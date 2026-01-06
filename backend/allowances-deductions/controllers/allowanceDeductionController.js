const AllowanceDeductionMaster = require('../model/AllowanceDeductionMaster');
const Department = require('../../departments/model/Department');

/**
 * @desc    Get all allowances and deductions
 * @route   GET /api/allowances-deductions
 * @access  Private
 */
exports.getAllAllowancesDeductions = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const query = {};

    if (category) {
      query.category = category;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const items = await AllowanceDeductionMaster.find(query)
      .populate('departmentRules.departmentId', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: items.length,
      data: items,
    });
  } catch (error) {
    console.error('Error fetching allowances/deductions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allowances/deductions',
      error: error.message,
    });
  }
};

/**
 * @desc    Get only allowances
 * @route   GET /api/allowances-deductions/allowances
 * @access  Private
 */
exports.getAllowances = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = { category: 'allowance' };

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const allowances = await AllowanceDeductionMaster.find(query)
      .populate('departmentRules.departmentId', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: allowances.length,
      data: allowances,
    });
  } catch (error) {
    console.error('Error fetching allowances:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allowances',
      error: error.message,
    });
  }
};

/**
 * @desc    Get only deductions
 * @route   GET /api/allowances-deductions/deductions
 * @access  Private
 */
exports.getDeductions = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = { category: 'deduction' };

    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const deductions = await AllowanceDeductionMaster.find(query)
      .populate('departmentRules.departmentId', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      count: deductions.length,
      data: deductions,
    });
  } catch (error) {
    console.error('Error fetching deductions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching deductions',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single allowance/deduction
 * @route   GET /api/allowances-deductions/:id
 * @access  Private
 */
exports.getAllowanceDeduction = async (req, res) => {
  try {
    const item = await AllowanceDeductionMaster.findById(req.params.id)
      .populate('departmentRules.departmentId', 'name code')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    console.error('Error fetching allowance/deduction:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching allowance/deduction',
      error: error.message,
    });
  }
};

/**
 * @desc    Create allowance/deduction master
 * @route   POST /api/allowances-deductions
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.createAllowanceDeduction = async (req, res) => {
  try {
    const { name, category, description, globalRule, isActive } = req.body;

    // Validate required fields
    if (!name || !category || !globalRule) {
      return res.status(400).json({
        success: false,
        message: 'Name, category, and global rule are required',
      });
    }

    // Validate global rule
    if (!globalRule.type || !['fixed', 'percentage'].includes(globalRule.type)) {
      return res.status(400).json({
        success: false,
        message: 'Global rule type must be "fixed" or "percentage"',
      });
    }

    if (globalRule.type === 'fixed' && (globalRule.amount === null || globalRule.amount === undefined)) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required when type is fixed',
      });
    }

    if (globalRule.type === 'percentage') {
      if (globalRule.percentage === null || globalRule.percentage === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Percentage is required when type is percentage',
        });
      }
      if (!globalRule.percentageBase || !['basic', 'gross'].includes(globalRule.percentageBase)) {
        return res.status(400).json({
          success: false,
          message: 'Percentage base (basic/gross) is required when type is percentage',
        });
      }
    }

    const item = await AllowanceDeductionMaster.create({
      name,
      category,
      description: description || null,
      globalRule,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user._id,
    });

    await item.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: `${category === 'allowance' ? 'Allowance' : 'Deduction'} created successfully`,
      data: item,
    });
  } catch (error) {
    console.error('Error creating allowance/deduction:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Allowance/Deduction with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating allowance/deduction',
      error: error.message,
    });
  }
};

/**
 * @desc    Update allowance/deduction master
 * @route   PUT /api/allowances-deductions/:id
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.updateAllowanceDeduction = async (req, res) => {
  try {
    const { name, description, globalRule, isActive } = req.body;

    const item = await AllowanceDeductionMaster.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    // Update fields
    if (name !== undefined) item.name = name;
    if (description !== undefined) item.description = description;
    if (isActive !== undefined) item.isActive = isActive;

    // Update global rule if provided
    if (globalRule) {
      // Validate global rule
      if (globalRule.type && !['fixed', 'percentage'].includes(globalRule.type)) {
        return res.status(400).json({
          success: false,
          message: 'Global rule type must be "fixed" or "percentage"',
        });
      }

      if (globalRule.type === 'fixed' && (globalRule.amount === null || globalRule.amount === undefined)) {
        return res.status(400).json({
          success: false,
          message: 'Amount is required when type is fixed',
        });
      }

      if (globalRule.type === 'percentage') {
        if (globalRule.percentage === null || globalRule.percentage === undefined) {
          return res.status(400).json({
            success: false,
            message: 'Percentage is required when type is percentage',
          });
        }
        if (!globalRule.percentageBase || !['basic', 'gross'].includes(globalRule.percentageBase)) {
          return res.status(400).json({
            success: false,
            message: 'Percentage base (basic/gross) is required when type is percentage',
          });
        }
      }

      item.globalRule = { ...item.globalRule, ...globalRule };
    }

    item.updatedBy = req.user._id;
    await item.save();

    await item.populate('departmentRules.departmentId', 'name code');
    await item.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Allowance/Deduction updated successfully',
      data: item,
    });
  } catch (error) {
    console.error('Error updating allowance/deduction:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Allowance/Deduction with this name already exists',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating allowance/deduction',
      error: error.message,
    });
  }
};

/**
 * @desc    Add or update department rule
 * @route   PUT /api/allowances-deductions/:id/department-rule
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.addOrUpdateDepartmentRule = async (req, res) => {
  try {
    const { departmentId, type, amount, percentage, percentageBase, minAmount, maxAmount } = req.body;

    if (!departmentId) {
      return res.status(400).json({
        success: false,
        message: 'Department ID is required',
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

    const item = await AllowanceDeductionMaster.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    // Validate rule
    if (!type || !['fixed', 'percentage'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be "fixed" or "percentage"',
      });
    }

    if (type === 'fixed' && (amount === null || amount === undefined)) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required when type is fixed',
      });
    }

    if (type === 'percentage') {
      if (percentage === null || percentage === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Percentage is required when type is percentage',
        });
      }
      if (!percentageBase || !['basic', 'gross'].includes(percentageBase)) {
        return res.status(400).json({
          success: false,
          message: 'Percentage base (basic/gross) is required when type is percentage',
        });
      }
    }

    // Check if department rule already exists
    const existingRuleIndex = item.departmentRules.findIndex(
      (rule) => rule.departmentId.toString() === departmentId.toString()
    );

    const departmentRule = {
      departmentId,
      type,
      amount: type === 'fixed' ? amount : null,
      percentage: type === 'percentage' ? percentage : null,
      percentageBase: type === 'percentage' ? percentageBase : null,
      minAmount: minAmount || null,
      maxAmount: maxAmount || null,
    };

    if (existingRuleIndex >= 0) {
      // Update existing rule
      item.departmentRules[existingRuleIndex] = departmentRule;
    } else {
      // Add new rule
      item.departmentRules.push(departmentRule);
    }

    item.updatedBy = req.user._id;
    await item.save();

    await item.populate('departmentRules.departmentId', 'name code');
    await item.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Department rule updated successfully',
      data: item,
    });
  } catch (error) {
    console.error('Error updating department rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating department rule',
      error: error.message,
    });
  }
};

/**
 * @desc    Remove department rule
 * @route   DELETE /api/allowances-deductions/:id/department-rule/:deptId
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.removeDepartmentRule = async (req, res) => {
  try {
    const { id, deptId } = req.params;

    const item = await AllowanceDeductionMaster.findById(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    const ruleIndex = item.departmentRules.findIndex(
      (rule) => rule.departmentId.toString() === deptId.toString()
    );

    if (ruleIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Department rule not found',
      });
    }

    item.departmentRules.splice(ruleIndex, 1);
    item.updatedBy = req.user._id;
    await item.save();

    await item.populate('departmentRules.departmentId', 'name code');
    await item.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Department rule removed successfully',
      data: item,
    });
  } catch (error) {
    console.error('Error removing department rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing department rule',
      error: error.message,
    });
  }
};

/**
 * @desc    Get resolved rule for a department
 * @route   GET /api/allowances-deductions/:id/resolved/:deptId
 * @access  Private
 */
exports.getResolvedRule = async (req, res) => {
  try {
    const { id, deptId } = req.params;

    const item = await AllowanceDeductionMaster.findById(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    // Check for department override
    const deptRule = item.departmentRules.find(
      (rule) => rule.departmentId.toString() === deptId.toString()
    );

    // Return department rule if exists, else global rule
    const resolvedRule = deptRule || item.globalRule;

    res.status(200).json({
      success: true,
      data: {
        master: {
          _id: item._id,
          name: item.name,
          category: item.category,
        },
        rule: resolvedRule,
        source: deptRule ? 'department' : 'global',
        department: deptRule ? await Department.findById(deptId).select('name code') : null,
      },
    });
  } catch (error) {
    console.error('Error getting resolved rule:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resolved rule',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete allowance/deduction master
 * @route   DELETE /api/allowances-deductions/:id
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteAllowanceDeduction = async (req, res) => {
  try {
    const item = await AllowanceDeductionMaster.findById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    await item.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Allowance/Deduction deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting allowance/deduction:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting allowance/deduction',
      error: error.message,
    });
  }
};

