const Holiday = require('../model/Holiday');
const HolidayGroup = require('../model/HolidayGroup');
const User = require('../../users/model/User');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Employee = require('../../employees/model/Employee');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const cacheService = require('../../shared/services/cacheService');

// Helper to sync holiday to shift roster
async function syncHolidayToRoster(holiday) {
    try {
        const { date, endDate, scope, applicableTo, targetGroupIds, groupId, name } = holiday;
        const dates = [];
        let current = new Date(date);
        const stop = endDate ? new Date(endDate) : new Date(date);

        while (current <= stop) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
        }

        // 1. Identify Target Employees
        let empFilter = { isActive: true };
        if (scope === 'GROUP') {
            const group = await HolidayGroup.findById(groupId);
            if (!group) return;

            const mappingConditions = group.divisionMapping.map(m => ({
                division_id: m.division,
                ...(m.departments && m.departments.length > 0 ? { department_id: { $in: m.departments } } : {})
            }));
            empFilter.$or = mappingConditions;
        } else if (applicableTo === 'SPECIFIC_GROUPS') {
            const groups = await HolidayGroup.find({ _id: { $in: targetGroupIds } });
            const allMappings = [];
            for (const g of groups) {
                (g.divisionMapping || []).forEach(m => {
                    allMappings.push({
                        division_id: m.division,
                        ...(m.departments && m.departments.length > 0 ? { department_id: { $in: m.departments } } : {})
                    });
                });
            }
            if (allMappings.length > 0) empFilter.$or = allMappings;
            else return; // No targets
        }

        const employees = await Employee.find(empFilter).select('emp_no');
        const empNos = employees.map(e => e.emp_no);

        if (empNos.length === 0) return;

        // 2. Update Roster (Bulk update/upsert)
        // Note: For large datasets, use bulkWrite for performance
        for (const day of dates) {
            for (const empNo of empNos) {
                await PreScheduledShift.findOneAndUpdate(
                    { employeeNumber: empNo, date: day },
                    {
                        $set: {
                            status: 'HOL',
                            shiftId: null,
                            notes: `Holiday: ${name}`
                        },
                        $setOnInsert: { scheduledBy: holiday.createdBy }
                    },
                    { upsert: true }
                );
            }
        }

        console.log(`Synced holiday "${name}" to roster for ${empNos.length} employees across ${dates.length} days.`);
    } catch (err) {
        console.error('Error syncing holiday to roster:', err);
    }
}

// @desc    Get all holidays (Master + Groups)
// @route   GET /api/holidays/admin
// @access  Private (Super Admin, HR)
exports.getAllHolidaysAdmin = async (req, res) => {
    try {
        const { year } = req.query;
        let query = {};

        if (year) {
            query = {
                $or: [
                    { date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } },
                    { endDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } }
                ]
            };
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
        const dateQuery = year ? {
            $or: [
                { date: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } },
                { endDate: { $gte: new Date(`${year}-01-01`), $lte: new Date(`${year}-12-31`) } }
            ]
        } : {};

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

        // 1. Validation: Mapping Exclusivity
        // Ensure that a (Division, Department) combo doesn't exist in another group
        const allGroups = await HolidayGroup.find({ _id: { $ne: _id }, isActive: true });

        for (const mapping of divisionMapping) {
            const currentDivisionId = mapping.division.toString();
            const currentDeptIds = mapping.departments.map(d => d.toString());

            for (const existingGroup of allGroups) {
                for (const existingMapping of existingGroup.divisionMapping) {
                    if (existingMapping.division.toString() === currentDivisionId) {
                        // If current mapping has ALL departments (empty array)
                        if (currentDeptIds.length === 0) {
                            return res.status(400).json({
                                success: false,
                                message: `Division already mapped in group: ${existingGroup.name}. Overlapping division mappings are not allowed.`
                            });
                        }

                        // If existing mapping has ALL departments
                        if (existingMapping.departments.length === 0) {
                            return res.status(400).json({
                                success: false,
                                message: `Division already mapped to ALL departments in group: ${existingGroup.name}.`
                            });
                        }

                        // Check for specific department overlap
                        const overlap = currentDeptIds.filter(id =>
                            existingMapping.departments.map(d => d.toString()).includes(id)
                        );

                        if (overlap.length > 0) {
                            return res.status(400).json({
                                success: false,
                                message: `Some departments are already mapped in group: ${existingGroup.name}. Duplicate mappings are not allowed.`
                            });
                        }
                    }
                }
            }
        }

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
        const { _id, name, date, endDate, type, isMaster, scope, applicableTo, targetGroupIds, groupId, overridesMasterId, description } = req.body;

        // Validation
        if (scope === 'GROUP' && !groupId) {
            return res.status(400).json({ success: false, message: 'Group ID is required for Group Scope holidays' });
        }

        let holiday;
        // --- UPDATE LOGIC ---
        if (_id) {
            holiday = await Holiday.findById(_id);
            if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found' });

            const wasGlobal = holiday.scope === 'GLOBAL';
            const isNowGlobal = scope === 'GLOBAL';

            // Update the main holiday
            holiday.name = name;
            holiday.date = date;
            holiday.endDate = endDate || null;
            holiday.type = type;
            holiday.isMaster = isMaster;
            holiday.scope = scope;
            holiday.applicableTo = applicableTo;
            holiday.targetGroupIds = applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [];
            holiday.groupId = scope === 'GROUP' ? groupId : undefined;
            holiday.overridesMasterId = overridesMasterId;
            holiday.description = description;

            // If updating a Group Copy (that has a source), break the sync
            if (holiday.sourceHolidayId) {
                holiday.isSynced = false;
            }

            await holiday.save();

            // PROPAGATION: If Global Holiday Updated
            if (isNowGlobal) {
                // Find all synced copies and update them
                await Holiday.updateMany(
                    { sourceHolidayId: holiday._id, isSynced: true },
                    {
                        $set: {
                            name,
                            date,
                            endDate: endDate || null,
                            type,
                            description
                        }
                    }
                );
            }
        }
        // --- CREATE LOGIC ---
        else {
            // Special Case: Bulk Create for Specific Groups (Individually, No Global Master)
            if (scope === 'GLOBAL' && applicableTo === 'SPECIFIC_GROUPS' && targetGroupIds && targetGroupIds.length > 0) {
                const holidaysToCreate = targetGroupIds.map(gid => ({
                    name,
                    date,
                    endDate: endDate || null,
                    type,
                    isMaster: false,
                    scope: 'GROUP',
                    groupId: gid,
                    description,
                    createdBy: req.user.userId,
                    isSynced: false // Independent
                }));

                const createdHolidays = await Holiday.insertMany(holidaysToCreate);

                return res.status(201).json({
                    success: true,
                    data: createdHolidays[0],
                    message: `Created ${createdHolidays.length} group holidays`
                });
            }

            holiday = await Holiday.create({
                name,
                date,
                endDate: endDate || null,
                type,
                isMaster,
                scope,
                applicableTo,
                targetGroupIds: applicableTo === 'SPECIFIC_GROUPS' ? targetGroupIds : [],
                groupId: scope === 'GROUP' ? groupId : undefined,
                overridesMasterId,
                description,
                createdBy: req.user.userId,
                // Default new holidays to synced (if they become copies later logic handles it, but here it's main)
                isSynced: true
            });

            // PROPAGATION: If Global Holiday Created -> Create Synced Copies for ALL or SPECIFIC Groups
            if (scope === 'GLOBAL') {
                let groupFilter = { isActive: true };

                // If targeting specific groups, filter by ID
                if (applicableTo === 'SPECIFIC_GROUPS' && targetGroupIds && targetGroupIds.length > 0) {
                    groupFilter._id = { $in: targetGroupIds };
                }

                const targetedGroups = await HolidayGroup.find(groupFilter);

                const copies = targetedGroups.map(group => ({
                    name,
                    date,
                    endDate: endDate || null,
                    type,
                    isMaster: false, // Copies are not "Master" definitions, they are instances
                    scope: 'GROUP',
                    groupId: group._id,
                    description,
                    createdBy: req.user.userId,
                    sourceHolidayId: holiday._id, // Link to Parent
                    isSynced: true // Synced by default
                }));

                if (copies.length > 0) {
                    await Holiday.insertMany(copies);
                }
            }
        }

        res.status(200).json({
            success: true,
            data: holiday
        });

        // Background Sync (Do not block response)
        syncHolidayToRoster(holiday).catch(err => console.error('Roster Sync Error:', err));

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

        // If deleting a Global Holiday -> Delete it AND all synced copies
        if (holiday.scope === 'GLOBAL') {
            // Delete copies that are still synced
            await Holiday.deleteMany({ sourceHolidayId: holiday._id, isSynced: true });

            // For copies that are NOT synced (overridden), detach them (clear sourceHolidayId)
            await Holiday.updateMany(
                { sourceHolidayId: holiday._id, isSynced: false },
                { $set: { sourceHolidayId: null } }
            );
        }

        // If deleting a Group Copy -> Just delete it (Opt-out)
        // No extra logic needed, just standard delete below

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
