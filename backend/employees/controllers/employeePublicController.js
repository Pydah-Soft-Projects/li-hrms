const Employee = require('../model/Employee');

exports.getPublicEmployees = async (req, res) => {
  try {
    const query = {};
    if (req.query.includeInactive !== 'true') {
      const now = new Date();
      query.is_active = { $ne: false };
      query.$or = [{ leftDate: null }, { leftDate: { $gt: now } }];
    }

    const employees = await Employee.find(query)
      .select('emp_no employee_name is_active leftDate')
      .lean();

    const now = new Date();
    const formatted = employees.map((emp) => {
      const isActive = emp.is_active !== false && (!emp.leftDate || new Date(emp.leftDate) > now);
      return {
        _id: emp._id,
        empNo: emp.emp_no,
        emp_no: emp.emp_no,
        employee_name: emp.employee_name,
        name: emp.employee_name,
        isActive: isActive,
        status: isActive ? 'Active' : 'Inactive',
      };
    });

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error('Error in getPublicEmployees:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

