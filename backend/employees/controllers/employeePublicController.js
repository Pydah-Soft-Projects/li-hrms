const Employee = require('../model/Employee');
require('../../departments/model/Department');
require('../../departments/model/Designation');
require('../../departments/model/Division');

/**
 * @desc    Get employees for external consumers via API Key authentication
 * @route   GET /api/employees/public
 * @access  Public (via x-api-key)
 */
exports.getPublicEmployees = async (req, res) => {
  try {
    const allowed = Array.isArray(req.apiClient?.allowedFields) && req.apiClient.allowedFields.length > 0
      ? req.apiClient.allowedFields
      : ['emp_no', 'employee_name', 'status'];

    const query = {};
    if (req.query.includeInactive !== 'true') {
      const now = new Date();
      query.is_active = { $ne: false };
      query.$or = [{ leftDate: null }, { leftDate: { $gt: now } }];
    }

    // Determine which MongoDB fields to select based on allowed configuration
    const selectFields = ['emp_no', 'employee_name', 'is_active', 'leftDate'];
    if (allowed.includes('email')) selectFields.push('email');
    if (allowed.includes('phone_number') || allowed.includes('phone')) selectFields.push('phone_number');
    if (allowed.includes('gender')) selectFields.push('gender');
    if (allowed.includes('dob')) selectFields.push('dob');
    if (allowed.includes('doj')) selectFields.push('doj');
    if (allowed.includes('blood_group')) selectFields.push('blood_group');
    if (allowed.includes('marital_status')) selectFields.push('marital_status');

    const needsDivision = allowed.some((f) => ['division', 'division_name', 'divisionName', 'division_id'].includes(f));
    const needsDepartment = allowed.some((f) => ['department', 'department_name', 'departmentName', 'department_id', 'dept'].includes(f));
    const needsDesignation = allowed.some((f) => ['designation', 'designation_name', 'designationName', 'designation_id'].includes(f));

    if (needsDivision) selectFields.push('division_id');
    if (needsDepartment) selectFields.push('department_id');
    if (needsDesignation) selectFields.push('designation_id');

    let dbQuery = Employee.find(query).select(selectFields.join(' '));

    if (needsDivision) dbQuery = dbQuery.populate('division_id', 'name');
    if (needsDepartment) dbQuery = dbQuery.populate('department_id', 'name');
    if (needsDesignation) dbQuery = dbQuery.populate('designation_id', 'name');

    const employees = await dbQuery.lean();

    const now = new Date();
    const formatted = employees.map((emp) => {
      const item = { _id: emp._id };
      const isActive = emp.is_active !== false && (!emp.leftDate || new Date(emp.leftDate) > now);

      if (allowed.some((f) => ['emp_no', 'empNo', 'employee_id'].includes(f))) {
        item.empNo = emp.emp_no;
        item.emp_no = emp.emp_no;
      }
      if (allowed.some((f) => ['employee_name', 'name', 'employeeName'].includes(f))) {
        item.employee_name = emp.employee_name;
        item.name = emp.employee_name;
      }
      if (allowed.some((f) => ['status', 'isActive', 'is_active'].includes(f))) {
        item.isActive = isActive;
        item.status = isActive ? 'Active' : 'Inactive';
      }
      if (allowed.includes('email')) {
        item.email = emp.email || null;
      }
      if (allowed.some((f) => ['phone_number', 'phone', 'phoneNumber'].includes(f))) {
        item.phone_number = emp.phone_number || null;
      }
      if (needsDivision) {
        const divName = emp.division_id?.name || (typeof emp.division === 'string' ? emp.division : null) || emp.dynamicFields?.division || null;
        item.division = divName;
        item.division_name = divName;
        item.divisionName = divName;
      }
      if (needsDepartment) {
        const deptName = emp.department_id?.name || (typeof emp.department === 'string' ? emp.department : null) || emp.dynamicFields?.department || null;
        item.department = deptName;
        item.department_name = deptName;
        item.departmentName = deptName;
      }
      if (needsDesignation) {
        const desigName = emp.designation_id?.name || (typeof emp.designation === 'string' ? emp.designation : null) || emp.dynamicFields?.designation || null;
        item.designation = desigName;
        item.designation_name = desigName;
        item.designationName = desigName;
      }
      if (allowed.includes('gender')) {
        item.gender = emp.gender || null;
      }
      if (allowed.includes('dob')) {
        item.dob = emp.dob || null;
      }
      if (allowed.includes('doj')) {
        item.doj = emp.doj || null;
      }
      if (allowed.includes('blood_group')) {
        item.blood_group = emp.blood_group || null;
      }
      if (allowed.includes('marital_status')) {
        item.marital_status = emp.marital_status || null;
      }

      return item;
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      allowedFields: allowed,
      data: formatted,
    });
  } catch (error) {
    console.error('Error in getPublicEmployees:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
