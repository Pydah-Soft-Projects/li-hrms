const Holiday = require('../model/Holiday');
const HolidayGroup = require('../model/HolidayGroup');
const User = require('../../users/model/User');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const cacheService = require('../../shared/services/cacheService');

// @desc    Get all holidays (Master + Groups)
// @route   GET /api/holidays/admin
// @access  Private (Super Admin, HR)
exports.getAllHolidaysAdmin = async (req, res) => {
    try {
        const { year } = req.query;
        let query = {};

        if (year) {
            const startDate = new Date(`${year}-01-01`);
            const endDate = new Date(`${year}-12-31`);
            query.date = { $gte: startDate, $lte: endDate };
        }

        const holidays = await Holiday.find(query)
            .populate('targetGroupIds', 'name')
            .populate('groupId', 'name')
            .sort({ date: 1 });

        const groups = await HolidayGroup.find({ isActive: true })
            .populate('divisionMapping.division', 'name')
            .populate('divisionMapping.departments', 'name');

        res.status(200).json({
            success: true,
            data: {
                holidays,
                groups
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching holidays',
            error: error.message
        });
    }
};

// @desc    Get holidays for a specific user (Computed)
// @route   GET /api/holidays/my
// @access  Private
exports.getMyHolidays = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId)
            .populate('division')
            .populate('department')
            .select('division department role');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const { year } = req.query;
        let dateQuery = {};
        if (year) {
            const startDate = new Date(`${year}-01-01`);
            const endDate = new Date(`${year}-12-31`);
            dateQuery.date = { $gte: startDate, $lte: endDate };
        }

        // 1. Identify User's Group
        // Find groups that match user's division AND (department OR all departments)
        const applicableGroups = await HolidayGroup.find({
            isActive: true,
            'divisionMapping': {
                $elemMatch: {
                    division: user.division?._id,
                    $or: [
                        { departments: { $size: 0 } }, // Applies to all depts in division
                        { departments: user.department?._id } // Applies to specific dept
                    ]
                }
            }
        });

        const groupIds = applicableGroups.map(g => g._id);

        // 2. Fetch Master Holidays
        // - Global (applicableTo: 'ALL')
        // - Partial (applicableTo: 'SPECIFIC_GROUPS' and user's group is in targetGroupIds)
        const masterHolidays = await Holiday.find({
            ...dateQuery,
            isMaster: true,
            $or: [
                { applicableTo: 'ALL' },
                {
                    applicableTo: 'SPECIFIC_GROUPS',
                    targetGroupIds: { $in: groupIds }
                }
            ]
        }).lean();

        // 3. Fetch Group Specific Holidays
        const groupHolidays = await Holiday.find({
            ...dateQuery,
            scope: 'GROUP',
            groupId: { $in: groupIds }
        }).lean();

        // 4. Merge and Handle Overrides
        // If a group holiday overrides a master holiday, replace it
        const masterMap = new Map(masterHolidays.map(h => [h._id.toString(), h]));

        // Process group holidays
        const finalHolidays = [];

        // Add all group holidays first (they might be additions or overrides)
        for (const gh of groupHolidays) {
            if (gh.overridesMasterId) {
                // This is an override, remove the master from the map
                masterMap.delete(gh.overridesMasterId.toString());
            }
            finalHolidays.push(gh);
        }

        // Add remaining master holidays
        finalHolidays.push(...masterMap.values());

        // Sort by date
        finalHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));

        res.status(200).json({
            success: true,
            count: finalHolidays.length,
            data: finalHolidays
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user holidays',
            error: error.message
        });
    }
};

// @desc    Create/Update Holiday Group
// @route   POST /api/holidays/groups
// @access  Private (Super Admin)
exports.saveHolidayGroup = async (req, res) => {
    try {
        const { _id, name, description, divisionMapping, isActive } = req.body;

        let group;
        if (_id) {
            group = await HolidayGroup.findById(_id);
            if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

            group.name = name;
            group.description = description;
            group.divisionMapping = divisionMapping;
            group.isActive = isActive !== undefined ? isActive : group.isActive;
            await group.save();
        } else {
            group = await HolidayGroup.create({
                name,
                description,
                divisionMapping,
                isActive: true,
                createdBy: req.user.userId
            });
        }

        res.status(200).json({
            success: true,
            data: group
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error saving holiday group',
            error: error.message
        });
    }
};

// @desc    Create/Update Holiday (Master or Group)
// @route   POST /api/holidays
// @access  Private (Super Admin)
exports.saveHoliday = async (req, res) => {
    try {
        const { _id, name, date, type, isMaster, scope, applicableTo, targetGroupIds, groupId, overridesMasterId, description } = req.body;

        // Validation
        if (scope === 'GROUP' && !groupId) {
            return res.status(400).json({ success: false, message: 'Group ID is required for Group Scope holidays' });
        }

        let holiday;
        if (_id) {
            holiday = await Holiday.findById(_id);
            if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });

            holiday.name = name;
            holiday.date = date;
            holiday.type = type;
            holiday.isMaster = isMaster;
            holiday.scope = scope;
            holiday.applicableTo = applicableTo;
            holiday.targetGroupIds = applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [];
            holiday.groupId = scope === 'GROUP' ? groupId : undefined;
            holiday.overridesMasterId = overridesMasterId;
            holiday.description = description;

            await holiday.save();
        } else {
            holiday = await Holiday.create({
                name,
                date,
                type,
                isMaster,
                scope,
                applicableTo,
                targetGroupIds: applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [],
                groupId: scope === 'GROUP' ? groupId : undefined,
                overridesMasterId,
                description,
                createdBy: req.user.userId
            });
        }

        res.status(200).json({
            success: true,
            data: holiday
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error saving holiday',
            error: error.message
        });
    }
};

// @desc    Delete Holiday
// @route   DELETE /api/holidays/:id
// @access  Private (Super Admin)
exports.deleteHoliday = async (req, res) => {
    try {
        const holiday = await Holiday.findById(req.params.id);
        if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });

        await holiday.deleteOne();

        res.status(200).json({ success: true, message: 'Holiday deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting holiday', error: error.message });
    }
};

// @desc    Delete Holiday Group
// @route   DELETE /api/holidays/groups/:id
// @access  Private (Super Admin)
exports.deleteHolidayGroup = async (req, res) => {
    try {
        const group = await HolidayGroup.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

        // Check if used in holidays
        const associatedHolidays = await Holiday.countDocuments({ groupId: group._id });
        if (associatedHolidays > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete group: It has ${associatedHolidays} holidays associated with it. Delete the holidays first.`
            });
        }

        await group.deleteOne();

        res.status(200).json({ success: true, message: 'Holiday Group deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting group', error: error.message });
    }
};
