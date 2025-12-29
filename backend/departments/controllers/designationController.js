const Designation = require('../model/Designation');
const Department = require('../model/Department');
const User = require('../../users/model/User');
const Shift = require('../../shifts/model/Shift');

// @desc    Get all designations (global)
// @route   GET /api/designations
// @access  Private
exports.getAllDesignations = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = {};

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const designations = await Designation.find(query)
      .populate('shifts', 'name startTime endTime duration isActive')
      .populate('createdBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: designations.length,
      data: designations,
    });
  } catch (error) {
    console.error('Error fetching designations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching designations',
      error: error.message,
    });
  }
};

// @desc    Get designations for a specific department
// @route   GET /api/departments/:departmentId/designations
// @access  Private
exports.getDesignationsByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { isActive } = req.query;

    // Find department and get its linked designations
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    const query = { _id: { $in: department.designations || [] } };
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const designations = await Designation.find(query)
      .populate('shifts', 'name startTime endTime duration isActive')
      .populate('createdBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: designations.length,
      data: designations,
    });
  } catch (error) {
    console.error('Error fetching designations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching designations',
      error: error.message,
    });
  }
};

// @desc    Get single designation
// @route   GET /api/departments/designations/:id
// @access  Private
exports.getDesignation = async (req, res) => {
  try {
    const designation = await Designation.findById(req.params.id)
      .populate('department', 'name code')
      .populate('shifts', 'name startTime endTime duration isActive')
      .populate('createdBy', 'name email');

    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    res.status(200).json({
      success: true,
      data: designation,
    });
  } catch (error) {
    console.error('Error fetching designation:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching designation',
      error: error.message,
    });
  }
};

// @desc    Create global designation (independent of department)
// @route   POST /api/designations
// @access  Private (Super Admin, Sub Admin, HR)
exports.createGlobalDesignation = async (req, res) => {
  try {
    const { name, code, description, deductionRules, paidLeaves, shifts } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Designation name is required',
      });
    }

    // Check if designation with same name exists globally
    const existingDesignation = await Designation.findOne({
      name: name.trim(),
    });

    if (existingDesignation) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }

    // Validate shifts if provided
    if (shifts && Array.isArray(shifts) && shifts.length > 0) {
      const shiftDocs = await Shift.find({ _id: { $in: shifts } });
      if (shiftDocs.length !== shifts.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more shifts not found',
        });
      }
    }

    const designation = await Designation.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      department: null, // Independent designation
      description,
      deductionRules: deductionRules || [],
      paidLeaves: paidLeaves !== undefined ? Number(paidLeaves) : 0,
      shifts: shifts || [],
      createdBy: req.user?.userId,
    });

    res.status(201).json({
      success: true,
      message: 'Designation created successfully',
      data: designation,
    });
  } catch (error) {
    console.error('Error creating designation:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating designation',
      error: error.message,
    });
  }
};

// @desc    Link an existing designation to a department
// @route   POST /api/departments/:departmentId/designations/link
// @access  Private (Super Admin, Sub Admin, HR)
exports.linkDesignation = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { designationId } = req.body;

    if (!designationId) {
      return res.status(400).json({
        success: false,
        message: 'Designation ID is required',
      });
    }

    // Check if department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Check if designation exists
    const designation = await Designation.findById(designationId);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // Check if already linked
    if (department.designations.includes(designationId)) {
      return res.status(400).json({
        success: false,
        message: 'Designation is already linked to this department',
      });
    }

    // Link designation
    await Department.findByIdAndUpdate(
      departmentId,
      { $addToSet: { designations: designationId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: 'Designation linked successfully',
      data: designation,
    });
  } catch (error) {
    console.error('Error linking designation:', error);
    res.status(500).json({
      success: false,
      message: 'Error linking designation',
      error: error.message,
    });
  }
};

// @desc    Create designation (backward compatible - department-scoped)
// @route   POST /api/departments/:departmentId/designations
// @access  Private (Super Admin, Sub Admin, HR)
exports.createDesignation = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { name, code, description, deductionRules, paidLeaves, shifts } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Designation name is required',
      });
    }

    // Verify department exists
    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Check if designation with same name exists globally
    const existingDesignation = await Designation.findOne({
      name: name.trim(),
    });

    if (existingDesignation) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }

    // Validate shifts if provided
    if (shifts && Array.isArray(shifts) && shifts.length > 0) {
      const shiftDocs = await Shift.find({ _id: { $in: shifts } });
      if (shiftDocs.length !== shifts.length) {
        return res.status(400).json({
          success: false,
          message: 'One or more shifts not found',
        });
      }
    }

    const designation = await Designation.create({
      name: name.trim(),
      code: code ? code.trim().toUpperCase() : undefined,
      department: departmentId, // Keep for backward compatibility
      description,
      deductionRules: deductionRules || [],
      paidLeaves: paidLeaves !== undefined ? Number(paidLeaves) : 0,
      shifts: shifts || [],
      createdBy: req.user?.userId,
    });

    // Auto-link designation to department
    await Department.findByIdAndUpdate(
      departmentId,
      { $addToSet: { designations: designation._id } },
      { new: true }
    );

    res.status(201).json({
      success: true,
      message: 'Designation created successfully',
      data: designation,
    });
  } catch (error) {
    console.error('Error creating designation:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating designation',
      error: error.message,
    });
  }
};

// @desc    Update designation
// @route   PUT /api/departments/designations/:id
// @access  Private (Super Admin, Sub Admin, HR)
exports.updateDesignation = async (req, res) => {
  try {
    const { name, code, description, deductionRules, paidLeaves, shifts, isActive } = req.body;

    const designation = await Designation.findById(req.params.id);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // Check if name is being changed and conflicts with existing
    if (name && name.trim() !== designation.name) {
      const existingDesignation = await Designation.findOne({
        department: designation.department,
        name: name.trim(),
        _id: { $ne: designation._id },
      });

      if (existingDesignation) {
        return res.status(400).json({
          success: false,
          message: 'Designation with this name already exists in this department',
        });
      }
    }

    // Update fields
    if (name) designation.name = name.trim();
    if (code !== undefined) designation.code = code ? code.trim().toUpperCase() : undefined;
    if (description !== undefined) designation.description = description;
    if (deductionRules) designation.deductionRules = deductionRules;
    if (paidLeaves !== undefined) designation.paidLeaves = Number(paidLeaves);
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
      designation.shifts = shifts;
    }
    if (isActive !== undefined) designation.isActive = isActive;

    await designation.save();

    res.status(200).json({
      success: true,
      message: 'Designation updated successfully',
      data: designation,
    });
  } catch (error) {
    console.error('Error updating designation:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Designation with this name already exists in this department',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating designation',
      error: error.message,
    });
  }
};

// @desc    Assign shifts to designation
// @route   PUT /api/departments/designations/:id/shifts
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

    const designation = await Designation.findById(req.params.id);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
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

    designation.shifts = shiftIds;
    await designation.save();

    const populatedDesignation = await Designation.findById(req.params.id)
      .populate('department', 'name code')
      .populate('shifts', 'name startTime endTime duration isActive');

    res.status(200).json({
      success: true,
      message: 'Shifts assigned to designation successfully',
      data: populatedDesignation,
    });
  } catch (error) {
    console.error('Error assigning shifts to designation:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning shifts to designation',
      error: error.message,
    });
  }
};

// @desc    Delete designation
// @route   DELETE /api/departments/designations/:id
// @access  Private (Super Admin, Sub Admin)
exports.deleteDesignation = async (req, res) => {
  try {
    const Employee = require('../../employees/model/Employee');

    const designation = await Designation.findById(req.params.id);
    if (!designation) {
      return res.status(404).json({
        success: false,
        message: 'Designation not found',
      });
    }

    // Check if designation is assigned to any employees
    const employeeCount = await Employee.countDocuments({
      designation_id: designation._id,
    });

    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete designation. It is assigned to ${employeeCount} employee(s). Please reassign employees first.`,
      });
    }

    // Remove designation from all departments' designations arrays
    await Department.updateMany(
      { designations: designation._id },
      { $pull: { designations: designation._id } }
    );

    await designation.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Designation deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting designation:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting designation',
      error: error.message,
    });
  }
};

