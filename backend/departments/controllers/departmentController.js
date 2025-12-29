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
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const departments = await Department.find(query)
      .populate('hod', 'name email role')
      .populate('hr', 'name email role')
      .populate('shifts', 'name startTime endTime duration isActive')
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
      .populate('shifts', 'name startTime endTime duration isActive')
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
    const { name, code, description, hod } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required',
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

    const department = await Department.create({
      name,
      code: code || undefined,
      description: description || undefined,
      hod: hod || null,
      createdBy: req.user?.userId,
    });

    // Auto-sync: Add department to HOD's departments list
    if (hod) {
      await User.findByIdAndUpdate(hod, {
        $addToSet: { departments: department._id }
      });
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

    // Handle HOD Sync
    if (hod !== undefined) {
      // If HOD changed, remove department from old HOD
      if (department.hod && department.hod.toString() !== (hod || '')) {
        await User.findByIdAndUpdate(department.hod, {
          $pull: { departments: department._id }
        });
      }
      // Add department to new HOD
      if (hod) {
        await User.findByIdAndUpdate(hod, {
          $addToSet: { departments: department._id }
        });
      }
      department.hod = hod || null;
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

// @desc    Assign HOD to department
// @route   PUT /api/departments/:id/assign-hod
// @access  Private (Super Admin, Sub Admin, HR)
exports.assignHOD = async (req, res) => {
  try {
    const { hodId } = req.body;

    if (!hodId) {
      return res.status(400).json({
        success: false,
        message: 'HOD ID is required',
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

    // Sync: Remove from old HOD
    if (department.hod) {
      await User.findByIdAndUpdate(department.hod, {
        $pull: { departments: department._id }
      });
    }

    // Sync: Add to new HOD
    await User.findByIdAndUpdate(hodId, {
      $addToSet: { departments: department._id }
    });

    department.hod = hodId;
    await department.save();

    res.status(200).json({
      success: true,
      message: 'HOD assigned successfully',
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
    const { shiftIds } = req.body;

    if (!Array.isArray(shiftIds)) {
      return res.status(400).json({
        success: false,
        message: 'shiftIds must be an array',
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
    if (shiftIds.length > 0) {
      const shifts = await Shift.find({ _id: { $in: shiftIds } });
      if (shifts.length !== shiftIds.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more shifts not found',
        });
      }
    }

    department.shifts = shiftIds;
    await department.save();

    const populatedDepartment = await Department.findById(req.params.id).populate('shifts', 'name startTime endTime duration');

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
      .populate('shifts', 'name startTime endTime duration isActive')
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


