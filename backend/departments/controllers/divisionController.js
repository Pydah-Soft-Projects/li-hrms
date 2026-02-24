const Division = require('../model/Division');
const Department = require('../model/Department');
const Designation = require('../model/Designation');
const Shift = require('../../shifts/model/Shift');

/**
 * @desc    Get all divisions
 * @route   GET /api/divisions
 * @access  Private
 */
exports.getDivisions = async (req, res, next) => {
    try {
        const { isActive } = req.query;
        // Apply metadata scope filter if it exists (New specialized scoping)
        let query = {};
        if (req.metadataScopeFilter) {
            query = { ...req.metadataScopeFilter };
        } else if (req.scopeFilter) {
            // Fallback to legacy scope filter if new metadata filter isn't present
            query = { ...req.scopeFilter };
            // Map division_id to _id for Division model queries
            if (query.division_id) {
                query._id = query.division_id;
                delete query.division_id;
            }
            // If there's an $or condition with division_id, map those too
            if (query.$or) {
                query.$or = query.$or.map(cond => {
                    if (cond.division_id) {
                        return { ...cond, _id: cond.division_id };
                    }
                    return cond;
                });
            }
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        const divisions = await Division.find(query)
            .populate('departments', 'name code')
            .populate('manager', 'name email');

        res.status(200).json({
            success: true,
            count: divisions.length,
            data: divisions,
        });
    } catch (error) {
        console.error('Error in getDivisions:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching divisions',
            error: error.message,
        });
    }
};

/**
 * @desc    Get single division
 * @route   GET /api/divisions/:id
 * @access  Private
 */
exports.getDivision = async (req, res, next) => {
    try {
        const division = await Division.findById(req.params.id)
            .populate('departments', 'name code')
            .populate('manager', 'name email')
            .populate('shifts');

        if (!division) {
            return res.status(404).json({
                success: false,
                message: `Division not found with id of ${req.params.id}`,
            });
        }

        res.status(200).json({
            success: true,
            data: division,
        });
    } catch (error) {
        console.error('Error in getDivision:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching division',
            error: error.message,
        });
    }
};

/**
 * @desc    Create new division
 * @route   POST /api/divisions
 * @access  Private/Admin
 */
exports.createDivision = async (req, res, next) => {
    try {
        const division = await Division.create(req.body);

        if (req.body.departments && Array.isArray(req.body.departments)) {
            await Department.updateMany(
                { _id: { $in: req.body.departments } },
                { $addToSet: { divisions: division._id } }
            );
        }

        if (req.body.manager) {
            const User = require('../../users/model/User');
            await User.findByIdAndUpdate(req.body.manager, {
                $addToSet: { divisionMapping: { division: division._id, departments: [] } }
            });
        }

        res.status(201).json({
            success: true,
            data: division,
        });
    } catch (error) {
        console.error('Error in createDivision:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating division',
            error: error.message,
        });
    }
};

/**
 * @desc    Update division
 * @route   PUT /api/divisions/:id
 * @access  Private/Admin
 */
exports.updateDivision = async (req, res, next) => {
    try {
        let division = await Division.findById(req.params.id);

        if (!division) {
            return res.status(404).json({
                success: false,
                message: `Division not found with id of ${req.params.id}`,
            });
        }

        const oldDepartments = division.departments.map((d) => d.toString());
        const newDepartments = req.body.departments || [];

        division = await Division.findByIdAndUpdate(req.params.id, req.body, {
            runValidators: true,
        });

        // Handle Manager Sync
        if (req.body.manager !== undefined) {
            const User = require('../../users/model/User');
            const newManagerId = req.body.manager;
            const oldManagerId = division.manager ? division.manager.toString() : null;

            if (oldManagerId !== newManagerId) {
                if (oldManagerId) {
                    await User.findByIdAndUpdate(oldManagerId, {
                        $pull: { divisionMapping: { division: division._id } }
                    });
                }
                if (newManagerId) {
                    await User.findByIdAndUpdate(newManagerId, {
                        $addToSet: { divisionMapping: { division: division._id, departments: [] } }
                    });
                }
            }
        }

        // Departments to add this division to
        const addedDepts = newDepartments.filter((d) => !oldDepartments.includes(d));
        if (addedDepts.length > 0) {
            await Department.updateMany(
                { _id: { $in: addedDepts } },
                { $addToSet: { divisions: division._id } }
            );
        }

        // Departments to remove this division from
        const removedDepts = oldDepartments.filter((d) => !newDepartments.includes(d));
        if (removedDepts.length > 0) {
            await Department.updateMany(
                { _id: { $in: removedDepts } },
                { $pull: { divisions: division._id } }
            );
        }

        if (addedDepts.length > 0 || removedDepts.length > 0) {
            const cacheService = require('../../shared/services/cacheService');
            await cacheService.delByPattern('departments:*');
        }

        res.status(200).json({
            success: true,
            data: division,
        });
    } catch (error) {
        console.error('Error in updateDivision:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating division',
            error: error.message,
        });
    }
};

/**
 * @desc    Delete division
 * @route   DELETE /api/divisions/:id
 * @access  Private/Admin
 */
exports.deleteDivision = async (req, res, next) => {
    try {
        const division = await Division.findById(req.params.id);

        if (!division) {
            return res.status(404).json({
                success: false,
                message: `Division not found with id of ${req.params.id}`,
            });
        }

        // Remove this division reference from all departments
        await Department.updateMany(
            { divisions: division._id },
            { $pull: { divisions: division._id } }
        );

        // Remove division defaults from departments
        await Department.updateMany(
            { 'divisionDefaults.division': division._id },
            { $pull: { divisionDefaults: { division: division._id } } }
        );

        // Remove division contexts from designations
        await Designation.updateMany(
            { 'divisionDefaults.division': division._id },
            { $pull: { divisionDefaults: { division: division._id } } }
        );
        await Designation.updateMany(
            { 'departmentShifts.division': division._id },
            { $pull: { departmentShifts: { division: division._id } } }
        );

        const User = require('../../users/model/User');
        await User.updateMany(
            { 'divisionMapping.division': division._id },
            { $pull: { divisionMapping: { division: division._id } } }
        );

        await division.deleteOne();

        res.status(200).json({
            success: true,
            data: {},
        });
    } catch (error) {
        console.error('Error in deleteDivision:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting division',
            error: error.message,
        });
    }
};

/**
 * @desc    Link/Unlink departments to division
 * @route   POST /api/divisions/:id/departments
 * @access  Private/Admin
 */
exports.linkDepartments = async (req, res, next) => {
    try {
        const { departmentIds, action } = req.body; // action: 'link' or 'unlink'
        const divisionId = req.params.id;

        const division = await Division.findById(divisionId);
        if (!division) {
            return res.status(404).json({
                success: false,
                message: `Division not found with id of ${divisionId}`,
            });
        }

        if (action === 'link') {
            await Division.findByIdAndUpdate(divisionId, {
                $addToSet: { departments: { $each: departmentIds } },
            });
            await Department.updateMany(
                { _id: { $in: departmentIds } },
                { $addToSet: { divisions: divisionId } }
            );
        } else if (action === 'unlink') {
            await Division.findByIdAndUpdate(divisionId, {
                $pull: { departments: { $in: departmentIds } },
            });
            await Department.updateMany(
                { _id: { $in: departmentIds } },
                { $pull: { divisions: divisionId } }
            );
        }

        const cacheService = require('../../shared/services/cacheService');
        await cacheService.delByPattern('departments:*');

        res.status(200).json({
            success: true,
            message: `Departments successfully ${action}ed`,
        });
    } catch (error) {
        console.error('Error in linkDepartments:', error);
        res.status(500).json({
            success: false,
            message: 'Error linking/unlinking departments',
            error: error.message,
        });
    }
};

/**
 * @desc    Assign shifts to division context (General Division Default or Department Specific in Division)
 * @route   POST /api/divisions/:id/shifts
 * @access  Private/Admin
 */
exports.assignShifts = async (req, res, next) => {
    try {
        const { shifts, targetType, targetId } = req.body;
        // targetType: 'division_general', 'department_in_division', 'designation_in_division', 'designation_in_dept_in_div'
        const divisionId = req.params.id;

        if (targetType === 'division_general') {
            await Division.findByIdAndUpdate(divisionId, { shifts });
        } else if (targetType === 'department_in_division') {
            // Update Department.divisionDefaults
            const departmentId = targetId;
            const department = await Department.findById(departmentId);

            if (!department) {
                return res.status(404).json({
                    success: false,
                    message: 'Department not found',
                });
            }

            // Find existing default for this division
            const existingIndex = department.divisionDefaults.findIndex(
                (d) => d.division?.toString() === divisionId
            );

            if (existingIndex > -1) {
                department.divisionDefaults[existingIndex].shifts = shifts;
            } else {
                department.divisionDefaults.push({ division: divisionId, shifts });
            }
            await department.save();
        } else if (targetType === 'designation_in_division') {
            // Update Designation.divisionDefaults
            const designationId = targetId;
            const designation = await Designation.findById(designationId);

            if (!designation) {
                return res.status(404).json({
                    success: false,
                    message: 'Designation not found',
                });
            }

            const existingIndex = designation.divisionDefaults.findIndex(
                (d) => d.division?.toString() === divisionId
            );

            if (existingIndex > -1) {
                designation.divisionDefaults[existingIndex].shifts = shifts;
            } else {
                designation.divisionDefaults.push({ division: divisionId, shifts });
            }
            await designation.save();
        } else if (targetType === 'designation_in_dept_in_div') {
            // Update Designation.departmentShifts with division context
            const { designationId, departmentId } = targetId;
            const designation = await Designation.findById(designationId);

            if (!designation) {
                return res.status(404).json({
                    success: false,
                    message: 'Designation not found',
                });
            }

            const existingIndex = designation.departmentShifts.findIndex(
                (ds) =>
                    ds.division?.toString() === divisionId && ds.department?.toString() === departmentId
            );

            if (existingIndex > -1) {
                designation.departmentShifts[existingIndex].shifts = shifts;
            } else {
                designation.departmentShifts.push({
                    division: divisionId,
                    department: departmentId,
                    shifts,
                });
            }
            await designation.save();
        }

        res.status(200).json({
            success: true,
            message: 'Shifts assigned successfully',
        });
    } catch (error) {
        console.error('Error in assignShifts:', error);
        res.status(500).json({
            success: false,
            message: 'Error assigning shifts',
            error: error.message,
        });
    }
};
