const AllowanceDeductionMaster = require('../model/AllowanceDeductionMaster');
const Department = require('../../departments/model/Department');
const Employee = require('../../employees/model/Employee');
const XLSX = require('xlsx');

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
      .populate('departmentRules.divisionId', 'name code')
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
      .populate('departmentRules.divisionId', 'name code')
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
      .populate('departmentRules.divisionId', 'name code')
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
      .populate('departmentRules.divisionId', 'name code')
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
 * @desc    Add or update department rule (can be division-department specific)
 * @route   PUT /api/allowances-deductions/:id/department-rule
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.addOrUpdateDepartmentRule = async (req, res) => {
  try {
    const { divisionId, departmentId, type, amount, percentage, percentageBase, minAmount, maxAmount, basedOnPresentDays } = req.body;

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

    // Verify division exists if provided
    if (divisionId) {
      const Division = require('../../departments/model/Division');
      const division = await Division.findById(divisionId);
      if (!division) {
        return res.status(404).json({
          success: false,
          message: 'Division not found',
        });
      }
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

    // Check if division-department combination already exists
    const existingRuleIndex = item.departmentRules.findIndex((rule) => {
      const ruleDiv = rule.divisionId ? rule.divisionId.toString() : null;
      const reqDiv = divisionId || null;
      const ruleDept = rule.departmentId.toString();
      const reqDept = departmentId.toString();

      return ruleDiv === reqDiv && ruleDept === reqDept;
    });

    const departmentRule = {
      divisionId: divisionId || null,
      departmentId,
      type,
      amount: type === 'fixed' ? amount : null,
      percentage: type === 'percentage' ? percentage : null,
      percentageBase: type === 'percentage' ? percentageBase : null,
      minAmount: minAmount || null,
      maxAmount: maxAmount || null,
      basedOnPresentDays: type === 'fixed' ? (basedOnPresentDays || false) : false,
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

    await item.populate('departmentRules.divisionId', 'name code');
    await item.populate('departmentRules.departmentId', 'name code');
    await item.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: divisionId
        ? 'Division-department specific rule updated successfully'
        : 'Department rule updated successfully',
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
 * @desc    Remove department rule (can be division-department specific)
 * @route   DELETE /api/allowances-deductions/:id/department-rule/:deptId?divisionId=xxx
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.removeDepartmentRule = async (req, res) => {
  try {
    const { id, deptId } = req.params;
    const { divisionId } = req.query;

    const item = await AllowanceDeductionMaster.findById(id);
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Allowance/Deduction not found',
      });
    }

    // Find rule matching division-department combination
    const ruleIndex = item.departmentRules.findIndex((rule) => {
      const ruleDiv = rule.divisionId ? rule.divisionId.toString() : null;
      const reqDiv = divisionId || null;
      const ruleDept = rule.departmentId.toString();
      const reqDept = deptId.toString();

      return ruleDiv === reqDiv && ruleDept === reqDept;
    });

    if (ruleIndex === -1) {
      return res.status(404).json({
        success: false,
        message: divisionId
          ? 'Division-department specific rule not found'
          : 'Department rule not found',
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
 * @desc    Download A&D Template with Master Amounts
 * @route   GET /api/allowances-deductions/template
 * @access  Private
 */
exports.downloadTemplate = async (req, res) => {
  console.log('Starting downloadTemplate...');
  try {
    // Fetch all active allowances and deductions
    const allowances = await AllowanceDeductionMaster.find({ category: 'allowance', isActive: true }).sort({ name: 1 });
    const deductions = await AllowanceDeductionMaster.find({ category: 'deduction', isActive: true }).sort({ name: 1 });
    console.log(`Found ${allowances.length} allowances and ${deductions.length} deductions.`);

    // Fetch all active employees with necessary fields
    const employees = await Employee.find({ is_active: true })
      .select('emp_no employee_name department_id division_id designation_id employeeAllowances employeeDeductions')
      .populate('department_id', 'name')
      .populate('division_id', 'name')
      .populate('designation_id', 'name')
      .sort({ emp_no: 1 });
    console.log(`Found ${employees.length} employees.`);

    const rows = employees.map((emp, index) => {
      try {
        const deptObj = emp.department_id;
        const divObj = emp.division_id;
        const desigObj = emp.designation_id;

        const row = {
          'Employee ID': emp.emp_no,
          'Name': emp.employee_name,
          'Department': (deptObj && typeof deptObj === 'object') ? (deptObj.name || '') : '',
          'Designation': (desigObj && typeof desigObj === 'object') ? (desigObj.name || '') : ''
        };

        // Create Maps for faster and safer lookup of overrides
        const allowMap = new Map();
        (Array.isArray(emp.employeeAllowances) ? emp.employeeAllowances : []).forEach(a => {
          if (a && a.masterId) allowMap.set(String(a.masterId), a);
        });

        const deductMap = new Map();
        (Array.isArray(emp.employeeDeductions) ? emp.employeeDeductions : []).forEach(d => {
          if (d && d.masterId) deductMap.set(String(d.masterId), d);
        });

        // Helper to resolve amount
        const resolveAmount = (master, overrideMap) => {
          // 1. Check Employee Override
          const override = overrideMap.get(String(master._id));

          if (override) {
            if (override.type === 'percentage') return 0;
            return override.amount !== null && override.amount !== undefined ? override.amount : 0;
          }

          // Get Department and Division IDs safely
          const deptId = deptObj?._id ? String(deptObj._id) : (deptObj ? String(deptObj) : null);
          const divId = divObj?._id ? String(divObj._id) : (divObj ? String(divObj) : null);

          // 2. Check Department Rule
          if (deptId && master.departmentRules?.length > 0) {
            // Division + Department Rule
            if (divId) {
              const divRule = master.departmentRules.find(r =>
                r.divisionId && String(r.divisionId) === divId &&
                r.departmentId && String(r.departmentId) === deptId
              );
              if (divRule) {
                if (divRule.type === 'percentage') return 0;
                return divRule.amount !== null && divRule.amount !== undefined ? divRule.amount : 0;
              }
            }

            // Department Only Rule
            const deptRule = master.departmentRules.find(r =>
              !r.divisionId &&
              r.departmentId && String(r.departmentId) === deptId
            );
            if (deptRule) {
              if (deptRule.type === 'percentage') return 0;
              return deptRule.amount !== null && deptRule.amount !== undefined ? deptRule.amount : 0;
            }
          }

          // 3. Global Rule
          if (master.globalRule) {
            if (master.globalRule.type === 'percentage') return 0;
            return master.globalRule.amount !== null && master.globalRule.amount !== undefined ? master.globalRule.amount : 0;
          }

          return 0;
        };

        // Fill Allowances
        allowances.forEach(allowance => {
          const header = `${allowance.name} (${allowance.category})`; // Removed ID
          row[header] = resolveAmount(allowance, allowMap);
        });

        // Fill Deductions
        deductions.forEach(deduction => {
          const header = `${deduction.name} (${deduction.category})`; // Removed ID
          const amount = resolveAmount(deduction, deductMap);
          // Make deductions negative for clarity? Or keep absolute? User requirement: "display of negative values for deductions"
          // If resolveAmount returns positive value for deduction, we should negated it?
          // Let's assume resolveAmount returns the *value*.
          // Usually deductions are stored as positive numbers in rules.
          // I will negate it here for display in template as requested in prompt "Handling the display of negative values for deductions".
          row[header] = -Math.abs(amount);
        });

        return row;
      } catch (err) {
        console.error(`Error processing employee ${emp.emp_no}:`, err);
        throw err;
      }
    });

    console.log('Generating Excel...');
    // Generate Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'A&D Template');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    console.log('Excel generated, sending response...');

    res.setHeader('Content-Disposition', 'attachment; filename="AD_Template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);

  } catch (error) {
    console.error('Error downloading template (Top Level):', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading template',
      error: error.message,
      stack: error.stack // Send stack to frontend for debugging
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

/**
 * @desc    Bulk update employee allowances/deductions from Excel
 * @route   POST /api/allowances-deductions/bulk-update
 * @access  Private (Super Admin)
 */
exports.bulkUpdateAllowancesDeductions = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an Excel file',
      });
    }

    const { buffer } = req.file;
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!jsonData || jsonData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'The uploaded file is empty',
      });
    }

    // 1. Fetch all active allowances & deductions to map names -> IDs/details
    const [allowances, deductions] = await Promise.all([
      AllowanceDeductionMaster.find({ category: 'allowance', isActive: true }),
      AllowanceDeductionMaster.find({ category: 'deduction', isActive: true }),
    ]);

    // Create lookup maps: "Name (category)" -> Master Object
    // Update: User requested headers without ID, so we must map by Name+Category.
    const headerMap = new Map();

    const addToMap = (list) => {
      list.forEach(item => {
        // Must match the format generated in downloadTemplate: `${name} (${category})`
        const headerKey = `${item.name} (${item.category})`;
        headerMap.set(headerKey, item);
      });
    };

    addToMap(allowances);
    addToMap(deductions);

    const results = {
      updated: 0,
      failed: 0,
      errors: [],
    };

    // 2. Process each row
    for (const [index, row] of jsonData.entries()) {
      const empNo = row['Employee ID'];

      if (!empNo) {
        results.errors.push(`Row ${index + 2}: Missing Employee ID`);
        results.failed++;
        continue;
      }

      const employee = await Employee.findOne({ emp_no: String(empNo).toUpperCase() });
      if (!employee) {
        results.errors.push(`Row ${index + 2}: Employee with ID ${empNo} not found`);
        results.failed++;
        continue;
      }

      const newAllowances = [];
      const newDeductions = [];

      // Iterate through row keys to find A&D columns
      Object.keys(row).forEach(key => {
        const master = headerMap.get(key);
        if (master) {
          let val = row[key];

          if (val !== '' && val !== null && val !== undefined) {
            // Handle deduction negative input if user kept it negative
            if (master.category === 'deduction' && val < 0) {
              val = Math.abs(val);
            }

            const amount = Number(val);
            if (!isNaN(amount)) {
              const overrideObj = {
                masterId: master._id,
                name: master.name,
                category: master.category,
                type: 'fixed', // Overrides are typically fixed amounts in this context
                amount: amount,
                basedOnPresentDays: master.departmentRules?.[0]?.basedOnPresentDays || master.globalRule?.basedOnPresentDays || false, // Best guess fallback, ideally should come from user input but simplistic for now
                isOverride: true
              };

              if (master.category === 'allowance') {
                newAllowances.push(overrideObj);
              } else {
                newDeductions.push(overrideObj);
              }
            }
          }
        }
      });

      // Update employee
      // We REPLACE existing overrides with the ones found in the sheet for the columns present.
      // However, we should preserve overrides for components NOT in the sheet?
      // Usually bulk upload implies "this is the state".
      // But if the sheet only had "Bonus", we shouldn't wipe "HRA".
      // The template download includes ALL active components. So safe to replace?
      // Let's merge: Remove old overrides for components present in the sheet, keep others.
      // Actually, since template has ALL active components, we can probably rebuild the lists.
      // But safest is: 
      // 1. Keep existing overrides for masters NOT in headerMap (maybe inactive ones?)
      // 2. Use new values for masters IN headerMap

      // Filter out assignments in existing arrays that match masters we are updating
      const mapKeys = Array.from(headerMap.values()).map(m => String(m._id));

      const keptAllowances = (employee.employeeAllowances || []).filter(
        a => a.masterId && !mapKeys.includes(String(a.masterId))
      );
      const keptDeductions = (employee.employeeDeductions || []).filter(
        d => d.masterId && !mapKeys.includes(String(d.masterId))
      );

      employee.employeeAllowances = [...keptAllowances, ...newAllowances];
      employee.employeeDeductions = [...keptDeductions, ...newDeductions];

      await employee.save();
      results.updated++;
    }

    res.status(200).json({
      success: true,
      message: `Processed ${jsonData.length} rows. Updated: ${results.updated}, Failed: ${results.failed}`,
      errors: results.errors,
    });

  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing bulk update',
      error: error.message,
    });
  }
};
