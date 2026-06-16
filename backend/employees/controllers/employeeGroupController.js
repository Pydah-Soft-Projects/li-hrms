const EmployeeGroup = require('../model/EmployeeGroup');
const Employee = require('../model/Employee');
const { buildRosterEmployeeFilters } = require('../../shifts/services/rosterEmployeeFilter');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');

/**
 * @desc    Distinct employee groups used by employees matching roster filters (lightweight)
 * @route   GET /api/employee-groups/for-roster-filters
 */
exports.getGroupsForRosterFilters = async (req, res) => {
  try {
    const { division_id, divisionId, department_id, departmentId, designation_id, designationId, startDate, endDate } = req.query;
    const filters = buildRosterEmployeeFilters({
      divisionId: division_id || divisionId,
      departmentId: department_id || departmentId,
      designationId: designation_id || designationId,
      startDate,
      endDate,
    });
    filters.employee_group_id = { $ne: null };

    const groupIds = await Employee.distinct('employee_group_id', filters);
    if (!groupIds.length) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const groups = await EmployeeGroup.find({ _id: { $in: groupIds }, isActive: { $ne: false } })
      .select('name code isActive')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({ success: true, count: groups.length, data: groups });
  } catch (error) {
    console.error('getGroupsForRosterFilters:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching groups for roster filters',
      error: error.message,
    });
  }
};

/**
 * @desc    List employee groups
 * @route   GET /api/employee-groups
 */
exports.getEmployeeGroups = async (req, res) => {
  try {
    const { isActive } = req.query;
    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    const groups = await EmployeeGroup.find(query).sort({ name: 1 }).lean();
    res.status(200).json({
      success: true,
      count: groups.length,
      data: groups,
    });
  } catch (error) {
    console.error('getEmployeeGroups:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee groups',
      error: error.message,
    });
  }
};

/**
 * @desc    Get one employee group
 * @route   GET /api/employee-groups/:id
 */
exports.getEmployeeGroup = async (req, res) => {
  try {
    const group = await EmployeeGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Employee group not found' });
    }
    res.status(200).json({ success: true, data: group });
  } catch (error) {
    console.error('getEmployeeGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee group',
      error: error.message,
    });
  }
};

/**
 * @desc    Create employee group
 * @route   POST /api/employee-groups
 */
exports.createEmployeeGroup = async (req, res) => {
  try {
    const { name, code, description, isActive } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const group = await EmployeeGroup.create({
      name: String(name).trim(),
      code: code != null ? String(code).trim().toUpperCase() : '',
      description: description != null ? String(description).trim() : '',
      isActive: isActive !== false,
    });
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A group with this name already exists' });
    }
    console.error('createEmployeeGroup:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error creating employee group',
    });
  }
};

/**
 * @desc    Update employee group
 * @route   PUT /api/employee-groups/:id
 */
exports.updateEmployeeGroup = async (req, res) => {
  try {
    const group = await EmployeeGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Employee group not found' });
    }
    const { name, code, description, isActive } = req.body;
    if (name !== undefined) group.name = String(name).trim();
    if (code !== undefined) group.code = String(code).trim().toUpperCase();
    if (description !== undefined) group.description = String(description).trim();
    if (isActive !== undefined) group.isActive = !!isActive;
    await group.save();
    res.status(200).json({ success: true, data: group });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A group with this name already exists' });
    }
    console.error('updateEmployeeGroup:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error updating employee group',
    });
  }
};

/**
 * @desc    Employees assigned to an employee group
 * @route   GET /api/employee-groups/:id/employees
 */
exports.getEmployeeGroupEmployees = async (req, res) => {
  try {
    const group = await EmployeeGroup.findById(req.params.id).select('name');
    if (!group) {
      return res.status(404).json({ success: false, message: 'Employee group not found' });
    }

    const employees = await Employee.find({ employee_group_id: group._id })
      .select('emp_no employee_name department_id division_id is_active left_date')
      .populate('department_id', 'name code')
      .populate('division_id', 'name code')
      .sort(EMP_NO_SORT)
      .collation(EMP_NO_COLLATION)
      .lean();

    return res.status(200).json({
      success: true,
      count: employees.length,
      data: employees,
    });
  } catch (error) {
    console.error('getEmployeeGroupEmployees:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching employee group members',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete employee group
 * @route   DELETE /api/employee-groups/:id
 */
exports.deleteEmployeeGroup = async (req, res) => {
  try {
    const group = await EmployeeGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ success: false, message: 'Employee group not found' });
    }

    const activeEmployeeCount = await Employee.countDocuments({
      employee_group_id: group._id,
      is_active: true,
    });

    if (activeEmployeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete employee group. It is assigned to ${activeEmployeeCount} active employee(s). Please reassign employees first.`,
      });
    }

    await group.deleteOne();

    res.status(200).json({ success: true, message: 'Employee group deleted', data: {} });
  } catch (error) {
    console.error('deleteEmployeeGroup:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting employee group',
      error: error.message,
    });
  }
};
