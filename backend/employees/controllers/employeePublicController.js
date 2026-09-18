const Employee = require('../model/Employee');

exports.getPublicEmployees = async (req, res) => {
  try {
    // Client wants only: employee name, id (empNo), and status (isActive/status)
    const employees = await Employee.find()
      .select('firstName lastName empNo status isActive')
      .lean();

    res.status(200).json({
      success: true,
      count: employees.length,
      data: employees
    });
  } catch (error) {
    console.error('Error in getPublicEmployees:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
