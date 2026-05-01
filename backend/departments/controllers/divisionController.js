const Division = require('../model/Division');
const Department = require('../model/Department');
const Designation = require('../model/Designation');
const Shift = require('../../shifts/model/Shift');
const User = require('../../users/model/User');
const {
    isCustomEmployeeGroupingEnabled,
    validateEmployeeGroupIfEnabled,
    stripEmployeeGroupWhenDisabled,
} = require('../../shared/utils/customEmployeeGrouping');
const { flattenShiftConfigsWithGroups } = require('../../shared/utils/shiftAssignmentConfig');

const formatAndValidateShiftConfigs = async (shifts, groupingEnabled) => {
    if (!Array.isArray(shifts)) {
        return { error: 'shifts must be an array' };
    }

    const flattened = flattenShiftConfigsWithGroups(shifts);

    if (flattened.length === 0) {
        return { formattedShifts: [] };
    }

    const shiftIds = [...new Set(flattened.map((s) => s.shiftId).filter(Boolean))];
    const foundShifts = await Shift.find({ _id: { $in: shiftIds } }).select('_id').lean();
    if (foundShifts.length !== shiftIds.length) {
        return { error: 'One or more shifts not found' };
    }

    const formattedShifts = [];
    for (const raw of flattened) {
        const config = {
            shiftId: raw.shiftId,
            gender: raw.gender || 'All',
            employee_group_id: raw.employee_group_id || null,
        };

        const groupValidation = await validateEmployeeGroupIfEnabled(config.employee_group_id);
        if (groupValidation?.error) {
            return { error: groupValidation.error };
        }

        stripEmployeeGroupWhenDisabled(config, groupingEnabled);
        formattedShifts.push(config);
    }

    return { formattedShifts };
};

/**
 * @desc    Get all divisions
 * @route   GET /api/divisions
 * @access  Private
 * For workspace users with divisionMapping: returns only divisions they are mapped to,
 * and each division's departments array is restricted to only the departments in their mapping (not the full division link).
 * For super_admin/sub_admin: returns all divisions with full linked departments.
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

        let divisions = await Division.find(query)
            .populate('departments', 'name code isActive')
            .populate('manager', 'name email')
            .lean();

        const user = req.scopedUser || req.user;
        const isAdmin = user && (user.role === 'super_admin' || user.role === 'sub_admin');
        const hasMapping = user && user.divisionMapping && Array.isArray(user.divisionMapping) && user.divisionMapping.length > 0;

        // For workspace users with divisionMapping: return only their mapped departments per division (not the full division link)
        if (!isAdmin && hasMapping && user._id) {
            const populatedUser = await User.findById(user._id)
                .populate('divisionMapping.division', 'name code')
                .populate('divisionMapping.departments', 'name code')
                .lean();
            if (populatedUser && populatedUser.divisionMapping) {
                divisions = divisions.map((div) => {
                    const divId = (div._id && div._id.toString()) || div._id;
                    const mapping = populatedUser.divisionMapping.find((m) => {
                        const mDivId = (m.division && (m.division._id || m.division).toString()) || (m.division && m.division.toString());
                        return mDivId === divId;
                    });
                    if (!mapping) return { ...div, departments: [] };
                    const depts = mapping.departments || [];
                    // Empty departments array = division-wide access (e.g. manager on division), same as User.divisionMapping convention
                    if (!Array.isArray(depts) || depts.length === 0) {
                        return { ...div };
                    }
                    const normalized = depts.map((d) => (d && typeof d === 'object' ? { _id: d._id, name: d.name, code: d.code } : d));
                    return { ...div, departments: normalized };
                });
            }
        }

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

        // Must read previous manager BEFORE update — after findByIdAndUpdate, division.manager is already the new value,
        // so comparing it to req.body.manager always matches and User.divisionMapping never syncs (breaks workspace scope).
        const previousManagerId = division.manager ? division.manager.toString() : null;

        division = await Division.findByIdAndUpdate(req.params.id, req.body, {
            runValidators: true,
        });

        // Handle Manager Sync
        if (req.body.manager !== undefined) {
            const rawNew = req.body.manager;
            const newManagerId =
                rawNew !== null && rawNew !== undefined && String(rawNew).trim() !== ''
                    ? String(rawNew)
                    : null;

            if (previousManagerId !== newManagerId) {
                if (previousManagerId) {
                    await User.findByIdAndUpdate(previousManagerId, {
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
 * @desc    Link/Unlink/Set departments to division
 * @route   POST /api/divisions/:id/departments
 * @access  Private/Admin
 *
 * action: 'link'   - add departmentIds to division (additive)
 * action: 'unlink' - remove departmentIds from division
 * action: 'set'    - replace the full department list; diffs current vs desired,
 *                    checks for employees in removed depts, returns requiresConfirmation
 *                    if any found (unless force:true is passed)
 */
exports.linkDepartments = async (req, res, next) => {
    try {
        const { departmentIds, action, force } = req.body;
        const divisionId = req.params.id;

        const division = await Division.findById(divisionId);
        if (!division) {
            return res.status(404).json({
                success: false,
                message: `Division not found with id of ${divisionId}`,
            });
        }

        if (action === 'link') {
            // --- Pure additive ---
            await Division.findByIdAndUpdate(divisionId, {
                $addToSet: { departments: { $each: departmentIds } },
            });
            await Department.updateMany(
                { _id: { $in: departmentIds } },
                { $addToSet: { divisions: divisionId } }
            );

        } else if (action === 'unlink') {
            // --- Explicit unlink (with employee check) ---
            await Division.findByIdAndUpdate(divisionId, {
                $pull: { departments: { $in: departmentIds } },
            });
            await Department.updateMany(
                { _id: { $in: departmentIds } },
                { $pull: { divisions: divisionId } }
            );

        } else if (action === 'set') {
            // --- Replace / sync the full list ---
            const Employee = require('../../employees/model/Employee');

            const currentDeptIds = division.departments.map((d) => d.toString());
            const newDeptIds = (departmentIds || []).map((id) => id.toString());

            const toAdd       = newDeptIds.filter((id) => !currentDeptIds.includes(id));
            const allToRemove = currentDeptIds.filter((id) => !newDeptIds.includes(id));

            // --- Split removals into safe (no employees) vs risky (has employees) ---
            let safeToRemove  = [...allToRemove]; // default: treat all as safe (force mode or no removals)
            let affectedDepts = [];

            if (!force && allToRemove.length > 0) {
                safeToRemove = [];
                for (const deptId of allToRemove) {
                    const count = await Employee.countDocuments({
                        division_id:   divisionId,
                        department_id: deptId,
                        is_active:     { $ne: false },
                    });
                    if (count > 0) {
                        const dept = await Department.findById(deptId).select('name code').lean();
                        affectedDepts.push({
                            departmentId:   deptId,
                            departmentName: dept ? `${dept.name} (${dept.code})` : deptId,
                            employeeCount:  count,
                        });
                    } else {
                        safeToRemove.push(deptId);
                    }
                }
            }

            // Always apply adds
            if (toAdd.length > 0) {
                await Division.findByIdAndUpdate(divisionId, {
                    $addToSet: { departments: { $each: toAdd } },
                });
                await Department.updateMany(
                    { _id: { $in: toAdd } },
                    { $addToSet: { divisions: divisionId } }
                );
            }

            // Always apply safe removals (no employees)
            if (safeToRemove.length > 0) {
                await Division.findByIdAndUpdate(divisionId, {
                    $pull: { departments: { $in: safeToRemove } },
                });
                await Department.updateMany(
                    { _id: { $in: safeToRemove } },
                    { $pull: { divisions: divisionId } }
                );
            }

            // If risky depts remain, flush cache and return warning
            // The frontend will re-submit with force:true for only the remaining risky ones
            if (affectedDepts.length > 0) {
                const cacheService = require('../../shared/services/cacheService');
                await cacheService.delByPattern('departments:*');
                return res.status(200).json({
                    success: false,
                    requiresConfirmation: true,
                    affectedDepartments: affectedDepts,
                    safeUnlinkedCount: safeToRemove.length,
                    addedCount: toAdd.length,
                    message: 'Some departments have active employees. Confirm to unlink them too.',
                });
            }
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
        const groupingEnabled = await isCustomEmployeeGroupingEnabled();
        const { formattedShifts, error } = await formatAndValidateShiftConfigs(shifts, groupingEnabled);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error,
            });
        }

        let shouldInvalidateDepartmentsCache = false;

        if (targetType === 'division_general') {
            await Division.findByIdAndUpdate(divisionId, { shifts: formattedShifts });
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
                department.divisionDefaults[existingIndex].shifts = formattedShifts;
            } else {
                department.divisionDefaults.push({ division: divisionId, shifts: formattedShifts });
            }
            await department.save();
            shouldInvalidateDepartmentsCache = true;
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
                designation.divisionDefaults[existingIndex].shifts = formattedShifts;
            } else {
                designation.divisionDefaults.push({ division: divisionId, shifts: formattedShifts });
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
                designation.departmentShifts[existingIndex].shifts = formattedShifts;
            } else {
                designation.departmentShifts.push({
                    division: divisionId,
                    department: departmentId,
                    shifts: formattedShifts,
                });
            }
            await designation.save();
        }

        if (shouldInvalidateDepartmentsCache) {
            const cacheService = require('../../shared/services/cacheService');
            await cacheService.delByPattern('departments:*');
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
