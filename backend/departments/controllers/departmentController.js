const Department = require('../model/Department');
const User = require('../../users/model/User');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Designation = require('../model/Designation');

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getAllDepartments = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = { ...req.scopeFilter };

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const departments = await Department.find(query)
      .populate('hod', 'name email role') // Legacy
      .populate('divisionHODs.hod', 'name email role')
      .populate('divisionHODs.division', 'name code')
      .populate('hr', 'name email role')
      .populate('shifts.shiftId', 'name startTime endTime duration isActive')
      .populate({
        path: 'divisionDefaults.division',
        select: 'name code',
      })
      .populate({
        path: 'divisionDefaults.shifts.shiftId',
        select: 'name startTime endTime duration isActive',
      })
      .populate('designations', 'name code isActive')
      .populate('createdBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: departments.length,
      data: departments,
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching departments',
      error: error.message,
    });
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
exports.getDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id)
      .populate('hod', 'name email role')
      .populate('hr', 'name email role')
      .populate('shifts.shiftId', 'name startTime endTime duration isActive')
      .populate({
        path: 'divisionDefaults.division',
        select: 'name code',
      })
      .populate({
        path: 'divisionDefaults.shifts.shiftId',
        select: 'name startTime endTime duration isActive',
      })
      .populate('createdBy', 'name email');

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    res.status(200).json({
      success: true,
      data: department,
    });
  } catch (error) {
    console.error('Error fetching department:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching department',
      error: error.message,
    });
  }
};

// @desc    Get department employees
// @route   GET /api/departments/:id/employees
// @access  Private
exports.getDepartmentEmployees = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    const employees = await Employee.find({ department_id: req.params.id })
      .select('-password')
      .populate('department_id', 'name')
      .sort({ employee_name: 1 });

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error('Error fetching department employees:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching department employees',
      error: error.message,
    });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (Super Admin, Sub Admin, HR)
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description, divisionHODs } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required',
      });
    }

    // Validate divisionHODs if provided
    let validDivisionHODs = [];
    if (divisionHODs && Array.isArray(divisionHODs)) {
      for (const dh of divisionHODs) {
        if (dh.division && dh.hod) {
          // Check if division exists (optional but good practice)
          // Check if user exists
          const userExists = await User.findById(dh.hod);
          if (!userExists) {
            return res.status(400).json({
              success: false,
              message: `HOD User not found for division assignment`,
            });
          }

          // STRICT RULE: Check if this user is already an HOD for ANY department/division
          const existingAssignment = await Department.findOne({
            'divisionHODs.hod': dh.hod
          });

          if (existingAssignment) {
            return res.status(400).json({
              success: false,
              message: `User ${userExists.name} is already an HOD for Department: ${existingAssignment.name}. A user can only be HOD for one department/division.`,
            });
          }

          validDivisionHODs.push({
            division: dh.division,
            hod: dh.hod
          });
        }
      }
    }

    const department = await Department.create({
      name,
      code: code || undefined,
      description: description || undefined,
      hod: null, // Global HOD is deprecated
      divisionHODs: validDivisionHODs,
      createdBy: req.user?.userId,
    });

    // Auto-sync: Add department to Division-specific HODs
    if (validDivisionHODs.length > 0) {
      const hodIds = [...new Set(validDivisionHODs.map(dh => dh.hod))];
      await User.updateMany(
        { _id: { $in: hodIds } },
        { $addToSet: { departments: department._id } }
      );
    }

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: department,
    });
  } catch (error) {
    console.error('Error creating department:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department with this name or code already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating department',
      error: error.message,
    });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateDepartment = async (req, res) => {
  try {
    const {
      name,
      code,
      description,
      hod,
      hr,
      attendanceConfig,
      permissionPolicy,
      autoDeductionRules,
      shifts,
      paidLeaves,
      leaveLimits,
      isActive,
    } = req.body;

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Validate HOD if provided
    if (hod) {
      const hodUser = await User.findById(hod);
      if (!hodUser) {
        return res.status(400).json({
          success: false,
          message: 'HOD user not found',
        });
      }
    }

    // Validate HR if provided
    if (hr) {
      const hrUser = await User.findById(hr);
      if (!hrUser) {
        return res.status(400).json({
          success: false,
          message: 'HR user not found',
        });
      }
    }

    // Update fields & Sync Users
    if (name) department.name = name;
    if (code !== undefined) department.code = code;
    if (description !== undefined) department.description = description;

    // Handle Division HODs Sync
    if (req.body.divisionHODs !== undefined) {
      const newDivisionHODs = req.body.divisionHODs;

      // Validate structure (minimal validation, trust valid IDs or frontend checks primarily, but safeguard)
      let validDivisionHODs = [];
      if (Array.isArray(newDivisionHODs)) {
        for (const dh of newDivisionHODs) {
          if (dh.division && dh.hod) {
            // Check if user exists 
            const userExists = await User.findById(dh.hod);
            if (!userExists) {
              return res.status(400).json({ success: false, message: 'Invalid HOD User ID' });
            }

            // STRICT RULE: Check if this user is already an HOD for ANY OTHER department/division
            // Query for existing assignments of this HOD
            const existingAssignments = await Department.find({
              'divisionHODs.hod': dh.hod
            });

            for (const existingDept of existingAssignments) {
              // If it's a different department, BLOCK.
              if (existingDept._id.toString() !== department._id.toString()) {
                return res.status(400).json({
                  success: false,
                  message: `User ${userExists.name} is already HOD for ${existingDept.name}. Cannot assign to multiple departments.`,
                });
              }
            }

            // Check for duplicates in the incoming payload (Internal consistency)
            const duplicateInPayload = newDivisionHODs.filter(d => d.hod === dh.hod).length > 1;
            if (duplicateInPayload) {
              return res.status(400).json({
                success: false,
                message: `User ${userExists.name} cannot be assigned to multiple divisions in the same request.`,
              });
            }

            validDivisionHODs.push({ division: dh.division, hod: dh.hod });
          }
        }
      }

      // Sync User Departments:
      // 1. Add department to new HODs
      if (validDivisionHODs.length > 0) {
        const newHodIds = [...new Set(validDivisionHODs.map(dh => dh.hod))];
        await User.updateMany(
          { _id: { $in: newHodIds } },
          { $addToSet: { departments: department._id } }
        );
      }

      // 2. Remove department from HODs who are no longer associated (Global HOD or any Division HOD)
      // Get all previous HODs (division only, global deprecated)
      const oldDivisionHodIds = department.divisionHODs ? department.divisionHODs.map(dh => dh.hod.toString()) : [];
      const allOldHods = new Set([...oldDivisionHodIds].filter(id => id));

      // Get all new HODs (division only)
      const newDivisionHodIds = validDivisionHODs.map(dh => dh.hod);
      const allNewHods = new Set([...newDivisionHodIds].filter(id => id));

      // Find removed HODs
      const removedHods = [...allOldHods].filter(id => !allNewHods.has(id));

      if (removedHods.length > 0) {
        await User.updateMany(
          { _id: { $in: removedHods } },
          { $pull: { departments: department._id } }
        );
      }

      department.divisionHODs = validDivisionHODs;
    }

    // Handle HR Sync
    if (hr !== undefined) {
      // If HR changed, remove department from old HR
      if (department.hr && department.hr.toString() !== (hr || '')) {
        await User.findByIdAndUpdate(department.hr, {
          $pull: { departments: department._id }
        });
      }
      // Add department to new HR
      if (hr) {
        await User.findByIdAndUpdate(hr, {
          $addToSet: { departments: department._id }
        });
      }
      department.hr = hr || null;
    }

    if (attendanceConfig) department.attendanceConfig = { ...department.attendanceConfig, ...attendanceConfig };
    if (permissionPolicy) department.permissionPolicy = { ...department.permissionPolicy, ...permissionPolicy };
    if (autoDeductionRules) department.autoDeductionRules = autoDeductionRules;
    if (shifts !== undefined) {
      // Validate shifts if provided
      if (Array.isArray(shifts) && shifts.length > 0) {
        const shiftDocs = await Shift.find({ _id: { $in: shifts } });
        if (shiftDocs.length !== shifts.length) {
          return res.status(400).json({
            success: false,
            message: 'One or more shifts not found',
          });
        }
      }
      department.shifts = shifts;
    }
    if (paidLeaves !== undefined) department.paidLeaves = Number(paidLeaves);
    if (leaveLimits) department.leaveLimits = { ...department.leaveLimits, ...leaveLimits };
    if (isActive !== undefined) department.isActive = isActive;

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      data: department,
    });
  } catch (error) {
    console.error('Error updating department:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Department with this name or code already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating department',
      error: error.message,
    });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Super Admin, Sub Admin)
exports.deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Check if department has employees
    const employeeCount = await Employee.countDocuments({ department_id: req.params.id });
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. It has ${employeeCount} employee(s) assigned. Please reassign employees first.`,
      });
    }

    // Sync: Remove department from HOD and HR users
    if (department.hod) {
      await User.findByIdAndUpdate(department.hod, {
        $pull: { departments: department._id }
      });
    }
    if (department.hr) {
      await User.findByIdAndUpdate(department.hr, {
        $pull: { departments: department._id }
      });
    }

    await department.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting department',
      error: error.message,
    });
  }
};

// @desc    Assign HOD to department (Division Specific)
// @route   PUT /api/departments/:id/assign-hod
// @access  Private (Super Admin, Sub Admin, HR)
exports.assignHOD = async (req, res) => {
  try {
    const { hodId, divisionId } = req.body;

    if (!hodId) {
      return res.status(400).json({
        success: false,
        message: 'HOD ID is required',
      });
    }

    if (!divisionId) {
      return res.status(400).json({
        success: false,
        message: 'Division ID is required for HOD assignment',
      });
    }

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    const hodUser = await User.findById(hodId);
    if (!hodUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find existing HOD for this division in this department
    const existingEntryIndex = department.divisionHODs.findIndex(
      dh => dh.division.toString() === divisionId
    );
    const oldHodId = existingEntryIndex > -1 ? department.divisionHODs[existingEntryIndex].hod : null;

    // Sync: Remove this department from old HOD's list (if it was their only link to this department)
    // Actually, simply pulling the department from the old HOD is safer, assuming they don't lead *another* division in this same dept.
    // However, to be precise: "User.departments" is a list of departments they are associated with.
    // If they are removed as HOD for this division, do we remove the department from them?
    // Yes, generally. But we should check if they are HOD for *other* divisions in this same dept?
    // For simplicity, we pull the department. If they are HOD for another division, re-adding it is idempotent.
    // A better approach: distinct lists. But User.departments is simple.
    // Let's stick to the existing pattern: Pull department from old HOD.
    if (oldHodId) {
      await User.findByIdAndUpdate(oldHodId, {
        $pull: { departments: department._id }
      });
    }

    // Sync: Add department to new HOD
    await User.findByIdAndUpdate(hodId, {
      $addToSet: { departments: department._id }
    });

    // Update Department Model
    if (existingEntryIndex > -1) {
      department.divisionHODs[existingEntryIndex].hod = hodId;
    } else {
      department.divisionHODs.push({
        division: divisionId,
        hod: hodId
      });
    }

    // Also update legacy field if this is the first HOD or just as a fallback
    // department.hod = hodId; // Optional: Keep strictly division-based now.

    await department.save();

    res.status(200).json({
      success: true,
      message: 'HOD assigned successfully to division',
      data: department,
    });
  } catch (error) {
    console.error('Error assigning HOD:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning HOD',
      error: error.message,
    });
  }
};

// @desc    Assign HR to department
// @route   PUT /api/departments/:id/assign-hr
// @access  Private (Super Admin, Sub Admin)
exports.assignHR = async (req, res) => {
  try {
    const { hrId } = req.body;

    if (!hrId) {
      return res.status(400).json({
        success: false,
        message: 'HR ID is required',
      });
    }

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    const hrUser = await User.findById(hrId);
    if (!hrUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Sync: Remove from old HR
    if (department.hr) {
      await User.findByIdAndUpdate(department.hr, {
        $pull: { departments: department._id }
      });
    }

    // Sync: Add to new HR
    await User.findByIdAndUpdate(hrId, {
      $addToSet: { departments: department._id }
    });

    department.hr = hrId;
    await department.save();

    res.status(200).json({
      success: true,
      message: 'HR assigned successfully',
      data: department,
    });
  } catch (error) {
    console.error('Error assigning HR:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning HR',
      error: error.message,
    });
  }
};

// @desc    Assign shifts to department
// @route   PUT /api/departments/:id/shifts
// @access  Private (Super Admin, Sub Admin, HR)
exports.assignShifts = async (req, res) => {
  try {
    const { shifts } = req.body;

    if (!Array.isArray(shifts)) {
      return res.status(400).json({
        success: false,
        message: 'shifts must be an array',
      });
    }

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Validate all shifts exist
    if (shifts.length > 0) {
      // Extract IDs depending on whether input is object or string (backward compatibility)
      const shiftIds = shifts.map(s => (typeof s === 'string' ? s : s.shiftId));
      const foundShifts = await Shift.find({ _id: { $in: shiftIds } });
      if (foundShifts.length !== shiftIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more shifts not found',
        });
      }
    }

    // Ensure we store in the correct format [{ shiftId, gender }]
    const formattedShifts = shifts.map(s => {
      if (typeof s === 'string') return { shiftId: s, gender: 'All' };
      return { shiftId: s.shiftId, gender: s.gender || 'All' };
    });

    department.shifts = formattedShifts;
    await department.save();

    const populatedDepartment = await Department.findById(req.params.id).populate('shifts.shiftId', 'name startTime endTime duration');

    res.status(200).json({
      success: true,
      message: 'Shifts assigned successfully',
      data: populatedDepartment,
    });
  } catch (error) {
    console.error('Error assigning shifts:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning shifts',
      error: error.message,
    });
  }
};

// @desc    Get department configuration
// @route   GET /api/departments/:id/configuration
// @access  Private
exports.getDepartmentConfiguration = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id)
      .populate('shifts.shiftId', 'name startTime endTime duration isActive')
      .populate('hod', 'name email role')
      .populate('hr', 'name email role');

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Get designations linked to this department
    const designations = await Designation.find({
      _id: { $in: department.designations || [] },
      isActive: true
    }).select('name code deductionRules paidLeaves');

    res.status(200).json({
      success: true,
      data: {
        department,
        designations,
        configuration: {
          attendanceConfig: department.attendanceConfig,
          permissionPolicy: department.permissionPolicy,
          autoDeductionRules: department.autoDeductionRules,
          leaveLimits: department.leaveLimits,
          paidLeaves: department.paidLeaves,
          shifts: department.shifts,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching department configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching department configuration',
      error: error.message,
    });
  }
};

// @desc    Update department paid leaves
// @route   PUT /api/departments/:id/paid-leaves
// @access  Private (Super Admin, Sub Admin, HR)
exports.updatePaidLeaves = async (req, res) => {
  try {
    const { paidLeaves } = req.body;

    if (paidLeaves === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Paid leaves count is required',
      });
    }

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    department.paidLeaves = Number(paidLeaves);

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Paid leaves updated successfully',
      data: { paidLeaves: department.paidLeaves },
    });
  } catch (error) {
    console.error('Error updating paid leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating paid leaves',
      error: error.message,
    });
  }
};

// @desc    Update department leave limits
// @route   PUT /api/departments/:id/leave-limits
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateLeaveLimits = async (req, res) => {
  try {
    const { dailyLimit, monthlyLimit } = req.body;

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    if (dailyLimit !== undefined) department.leaveLimits.dailyLimit = dailyLimit;
    if (monthlyLimit !== undefined) department.leaveLimits.monthlyLimit = monthlyLimit;

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Leave limits updated successfully',
      data: department.leaveLimits,
    });
  } catch (error) {
    console.error('Error updating leave limits:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating leave limits',
      error: error.message,
    });
  }
};

// @desc    Update department configuration
// @route   PUT /api/departments/:id/configuration
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateDepartmentConfiguration = async (req, res) => {
  try {
    const {
      attendanceConfig,
      permissionPolicy,
      autoDeductionRules,
      leaveLimits,
      paidLeaves,
    } = req.body;

    const department = await Department.findById(req.params.id);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    if (attendanceConfig) {
      department.attendanceConfig = { ...department.attendanceConfig, ...attendanceConfig };
    }

    if (permissionPolicy) {
      department.permissionPolicy = { ...department.permissionPolicy, ...permissionPolicy };
    }

    if (autoDeductionRules) {
      department.autoDeductionRules = autoDeductionRules;
    }

    if (leaveLimits) {
      department.leaveLimits = { ...department.leaveLimits, ...leaveLimits };
    }

    if (paidLeaves !== undefined) {
      department.paidLeaves = Number(paidLeaves);
    }

    await department.save();

    const populatedDepartment = await Department.findById(req.params.id)
      .populate('shifts', 'name startTime endTime duration')
      .populate('hod', 'name email role')
      .populate('hr', 'name email role');

    res.status(200).json({
      success: true,
      message: 'Department configuration updated successfully',
      data: populatedDepartment,
    });
  } catch (error) {
    console.error('Error updating department configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating department configuration',
      error: error.message,
    });
  }
};


