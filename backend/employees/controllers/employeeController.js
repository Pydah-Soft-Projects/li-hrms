/**
 * Employee Controller
 * Handles dual database operations (MongoDB + MSSQL) based on settings
 */

const Employee = require('../model/Employee');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const Settings = require('../../settings/model/Settings');
const {
  isHRMSConnected,
  createEmployeeMSSQL,
  getAllEmployeesMSSQL,
  getEmployeeByIdMSSQL,
  updateEmployeeMSSQL,
  deleteEmployeeMSSQL,
  employeeExistsMSSQL,
} = require('../config/mssqlHelper');

// ============== Helper Functions ==============

/**
 * Get employee settings from database
 */
const getEmployeeSettings = async () => {
  try {
    const dataSourceSetting = await Settings.findOne({ key: 'employee_data_source' });
    const deleteTargetSetting = await Settings.findOne({ key: 'employee_delete_target' });

    return {
      dataSource: dataSourceSetting?.value || 'mongodb', // 'mongodb' | 'mssql' | 'both'
      deleteTarget: deleteTargetSetting?.value || 'both', // 'mongodb' | 'mssql' | 'both'
    };
  } catch (error) {
    console.error('Error getting employee settings:', error);
    return { dataSource: 'mongodb', deleteTarget: 'both' };
  }
};

/**
 * Resolve department and designation names for employees
 */
const resolveEmployeeReferences = async (employees) => {
  // Get unique department and designation IDs
  const deptIds = [...new Set(employees.map(e => e.department_id).filter(Boolean))];
  const desigIds = [...new Set(employees.map(e => e.designation_id).filter(Boolean))];

  // Fetch departments and designations
  const [departments, designations] = await Promise.all([
    Department.find({ _id: { $in: deptIds } }).select('_id name code'),
    Designation.find({ _id: { $in: desigIds } }).select('_id name code'),
  ]);

  // Create lookup maps
  const deptMap = new Map(departments.map(d => [d._id.toString(), d]));
  const desigMap = new Map(designations.map(d => [d._id.toString(), d]));

  // Resolve references
  return employees.map(emp => ({
    ...emp,
    department: emp.department_id ? deptMap.get(emp.department_id.toString()) : null,
    designation: emp.designation_id ? desigMap.get(emp.designation_id.toString()) : null,
  }));
};

/**
 * Convert MongoDB employee to plain object for response
 */
const toPlainObject = (doc) => {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : doc;
};

// ============== Controller Methods ==============

/**
 * @desc    Get all employees
 * @route   GET /api/employees
 * @access  Private
 */
exports.getAllEmployees = async (req, res) => {
  try {
    const { is_active, department_id, designation_id } = req.query;
    const settings = await getEmployeeSettings();

    let employees = [];

    // Build filters
    const filters = {};
    if (is_active !== undefined) filters.is_active = is_active === 'true';
    if (department_id) filters.department_id = department_id;
    if (designation_id) filters.designation_id = designation_id;

    // Fetch based on data source setting
    if (settings.dataSource === 'mssql' && isHRMSConnected()) {
      // Fetch from MSSQL
      const mssqlEmployees = await getAllEmployeesMSSQL(filters);
      employees = await resolveEmployeeReferences(mssqlEmployees);
    } else {
      // Fetch from MongoDB (default)
      const query = {};
      if (filters.is_active !== undefined) query.is_active = filters.is_active;
      if (filters.department_id) query.department_id = filters.department_id;
      if (filters.designation_id) query.designation_id = filters.designation_id;

      const mongoEmployees = await Employee.find(query)
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code')
        .sort({ employee_name: 1 });

      employees = mongoEmployees.map(emp => {
        const obj = toPlainObject(emp);
        return {
          ...obj,
          department: obj.department_id,
          designation: obj.designation_id,
          // Explicitly ensure paidLeaves is included (default to 0 if not set)
          paidLeaves: obj.paidLeaves !== undefined && obj.paidLeaves !== null ? Number(obj.paidLeaves) : 0,
        };
      });
    }

    res.status(200).json({
      success: true,
      count: employees.length,
      dataSource: settings.dataSource,
      data: employees,
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employees',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single employee
 * @route   GET /api/employees/:empNo
 * @access  Private
 */
exports.getEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const settings = await getEmployeeSettings();

    let employee = null;

    if (settings.dataSource === 'mssql' && isHRMSConnected()) {
      const mssqlEmployee = await getEmployeeByIdMSSQL(empNo);
      if (mssqlEmployee) {
        const resolved = await resolveEmployeeReferences([mssqlEmployee]);
        employee = resolved[0];
      }
    } else {
      const mongoEmployee = await Employee.findOne({ emp_no: empNo })
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code');

      if (mongoEmployee) {
        const obj = toPlainObject(mongoEmployee);
        employee = {
          ...obj,
          department: obj.department_id,
          designation: obj.designation_id,
        };
      }
    }

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    res.status(200).json({
      success: true,
      dataSource: settings.dataSource,
      data: employee,
    });
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Create employee
 * @route   POST /api/employees
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.createEmployee = async (req, res) => {
  try {
    const employeeData = req.body;

    // Validate required fields
    if (!employeeData.emp_no) {
      return res.status(400).json({
        success: false,
        message: 'Employee number (emp_no) is required',
      });
    }

    if (!employeeData.employee_name) {
      return res.status(400).json({
        success: false,
        message: 'Employee name is required',
      });
    }

    // Check if employee already exists in MongoDB
    const existingMongo = await Employee.findOne({ emp_no: employeeData.emp_no.toUpperCase() });
    if (existingMongo) {
      return res.status(400).json({
        success: false,
        message: 'Employee with this employee number already exists',
      });
    }

    // Validate department if provided
    if (employeeData.department_id) {
      const dept = await Department.findById(employeeData.department_id);
      if (!dept) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department ID',
        });
      }
    }

    // Validate designation if provided
    if (employeeData.designation_id) {
      const desig = await Designation.findById(employeeData.designation_id);
      if (!desig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid designation ID',
        });
      }
    }

    const results = { mongodb: false, mssql: false };

    // Create in MongoDB
    try {
      const mongoEmployee = await Employee.create({
        ...employeeData,
        emp_no: employeeData.emp_no.toUpperCase(),
      });
      results.mongodb = true;
    } catch (mongoError) {
      console.error('MongoDB create error:', mongoError);
    }

    // Create in MSSQL
    if (isHRMSConnected()) {
      try {
        await createEmployeeMSSQL({
          ...employeeData,
          emp_no: employeeData.emp_no.toUpperCase(),
          department_id: employeeData.department_id?.toString() || null,
          designation_id: employeeData.designation_id?.toString() || null,
        });
        results.mssql = true;
      } catch (mssqlError) {
        console.error('MSSQL create error:', mssqlError);
      }
    }

    if (!results.mongodb && !results.mssql) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create employee in both databases',
      });
    }

    // Fetch the created employee
    const createdEmployee = await Employee.findOne({ emp_no: employeeData.emp_no.toUpperCase() })
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      savedTo: results,
      data: createdEmployee,
    });
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Update employee
 * @route   PUT /api/employees/:empNo
 * @access  Private (Super Admin, Sub Admin, HR)
 */
exports.updateEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const employeeData = req.body;

    // Check if employee exists
    const existingEmployee = await Employee.findOne({ emp_no: empNo });
    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    // Validate department if provided
    if (employeeData.department_id) {
      const dept = await Department.findById(employeeData.department_id);
      if (!dept) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department ID',
        });
      }
    }

    // Validate designation if provided
    if (employeeData.designation_id) {
      const desig = await Designation.findById(employeeData.designation_id);
      if (!desig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid designation ID',
        });
      }
    }

    const results = { mongodb: false, mssql: false };

    // Update in MongoDB
    try {
      // Ensure paidLeaves is explicitly set (even if 0)
      const updateData = {
        ...employeeData,
        updated_at: new Date(),
      };
      // Explicitly handle paidLeaves to ensure it's saved even if 0
      if (employeeData.paidLeaves !== undefined && employeeData.paidLeaves !== null) {
        updateData.paidLeaves = Number(employeeData.paidLeaves);
      }
      
      await Employee.findOneAndUpdate(
        { emp_no: empNo },
        updateData,
        { new: true }
      );
      results.mongodb = true;
    } catch (mongoError) {
      console.error('MongoDB update error:', mongoError);
    }

    // Update in MSSQL
    if (isHRMSConnected()) {
      try {
        await updateEmployeeMSSQL(empNo, {
          ...employeeData,
          department_id: employeeData.department_id?.toString() || null,
          designation_id: employeeData.designation_id?.toString() || null,
        });
        results.mssql = true;
      } catch (mssqlError) {
        console.error('MSSQL update error:', mssqlError);
      }
    }

    // Fetch updated employee
    const updatedEmployeeDoc = await Employee.findOne({ emp_no: empNo })
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');
    
    // Convert to plain object and ensure paidLeaves is included
    const updatedEmployee = toPlainObject(updatedEmployeeDoc);
    if (updatedEmployee) {
      updatedEmployee.paidLeaves = updatedEmployee.paidLeaves !== undefined && updatedEmployee.paidLeaves !== null 
        ? Number(updatedEmployee.paidLeaves) 
        : 0;
    }

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      updatedIn: results,
      data: updatedEmployee,
    });
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete employee
 * @route   DELETE /api/employees/:empNo
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteEmployee = async (req, res) => {
  try {
    const { empNo } = req.params;
    const settings = await getEmployeeSettings();

    // Check if employee exists
    const existingEmployee = await Employee.findOne({ emp_no: empNo });
    const existsMSSql = isHRMSConnected() ? await employeeExistsMSSQL(empNo) : false;

    if (!existingEmployee && !existsMSSql) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
    }

    const results = { mongodb: false, mssql: false };

    // Delete based on settings
    if (settings.deleteTarget === 'mongodb' || settings.deleteTarget === 'both') {
      try {
        if (existingEmployee) {
          await Employee.findOneAndDelete({ emp_no: empNo });
          results.mongodb = true;
        }
      } catch (mongoError) {
        console.error('MongoDB delete error:', mongoError);
      }
    }

    if (settings.deleteTarget === 'mssql' || settings.deleteTarget === 'both') {
      if (isHRMSConnected()) {
        try {
          await deleteEmployeeMSSQL(empNo);
          results.mssql = true;
        } catch (mssqlError) {
          console.error('MSSQL delete error:', mssqlError);
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
      deletedFrom: results,
      deleteTarget: settings.deleteTarget,
    });
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting employee',
      error: error.message,
    });
  }
};

/**
 * @desc    Get employee count
 * @route   GET /api/employees/count
 * @access  Private
 */
exports.getEmployeeCount = async (req, res) => {
  try {
    const { is_active } = req.query;
    const query = {};

    if (is_active !== undefined) {
      query.is_active = is_active === 'true';
    }

    const count = await Employee.countDocuments(query);

    res.status(200).json({
      success: true,
      count,
    });
  } catch (error) {
    console.error('Error getting employee count:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting employee count',
      error: error.message,
    });
  }
};

/**
 * @desc    Get employee settings
 * @route   GET /api/employees/settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await getEmployeeSettings();
    const mssqlConnected = isHRMSConnected();

    res.status(200).json({
      success: true,
      data: {
        ...settings,
        mssqlConnected,
      },
    });
  } catch (error) {
    console.error('Error getting employee settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting employee settings',
      error: error.message,
    });
  }
};

