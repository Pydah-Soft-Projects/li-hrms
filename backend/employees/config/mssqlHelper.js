/**
 * MSSQL Helper for Employee Module
 * Handles database and table auto-creation for HRMS
 */

const sql = require('mssql');

// MSSQL Configuration for HRMS database
const getMSSQLConfig = () => {
  const server = process.env.SQL_SERVER || 'localhost';
  const port = parseInt(process.env.SQL_PORT) || 1433;

  return {
    server: server,
    port: port,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: process.env.SQL_ENCRYPT === 'true',
      trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  };
};

// Pool instance for HRMS database
let hrmsPool = null;

/**
 * Initialize HRMS Database and Employees Table
 * Creates database if not exists, creates table if not exists
 */
const initializeHRMSDatabase = async () => {
  try {
    // First connect to master to check/create database
    const masterConfig = { ...getMSSQLConfig(), database: 'master' };
    const masterPool = await sql.connect(masterConfig);

    // Check if HRMS database exists
    const dbCheckResult = await masterPool.request().query(`
      SELECT database_id FROM sys.databases WHERE name = 'HRMS'
    `);

    if (dbCheckResult.recordset.length === 0) {
      // Create HRMS database
      await masterPool.request().query(`CREATE DATABASE HRMS`);
      console.log('✅ HRMS database created successfully');
    } else {
      console.log('✅ HRMS database already exists');
    }

    await masterPool.close();

    // Now connect to HRMS database
    const hrmsConfig = { ...getMSSQLConfig(), database: 'HRMS' };
    hrmsPool = await sql.connect(hrmsConfig);

    // Check if employees table exists and create if not
    await createEmployeesTable();

    console.log('✅ HRMS MSSQL connection established');
    return hrmsPool;
  } catch (error) {
    console.error('❌ Error initializing HRMS database:', error.message);
    throw error;
  }
};

/**
 * Create employees table if not exists
 */
const createEmployeesTable = async () => {
  try {
    const tableCheckResult = await hrmsPool.request().query(`
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'employees'
    `);

    if (tableCheckResult.recordset.length === 0) {
      // Create employees table
      await hrmsPool.request().query(`
        CREATE TABLE employees (
          emp_no VARCHAR(50) PRIMARY KEY,
          employee_name NVARCHAR(100) NOT NULL,
          department_id VARCHAR(24),
          designation_id VARCHAR(24),
          doj DATE,
          dob DATE,
          gross_salary DECIMAL(12,2),
          gender VARCHAR(10),
          marital_status VARCHAR(20),
          blood_group VARCHAR(5),
          qualifications NVARCHAR(255),
          experience INT,
          address NVARCHAR(500),
          location NVARCHAR(100),
          aadhar_number VARCHAR(12),
          phone_number VARCHAR(15),
          alt_phone_number VARCHAR(15),
          email NVARCHAR(100),
          pf_number VARCHAR(30),
          esi_number VARCHAR(30),
          bank_account_no VARCHAR(30),
          bank_name NVARCHAR(100),
          bank_place NVARCHAR(100),
          ifsc_code VARCHAR(15),
          is_active BIT DEFAULT 1,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('✅ employees table created successfully');
    } else {
      console.log('✅ employees table already exists');
    }
  } catch (error) {
    console.error('❌ Error creating employees table:', error.message);
    throw error;
  }
};

/**
 * Get HRMS Pool
 */
const getHRMSPool = () => {
  if (!hrmsPool) {
    throw new Error('HRMS database connection not established');
  }
  return hrmsPool;
};

/**
 * Check if HRMS Pool is connected
 */
const isHRMSConnected = () => {
  return hrmsPool !== null && hrmsPool.connected;
};

/**
 * Close HRMS Pool
 */
const closeHRMSPool = async () => {
  try {
    if (hrmsPool) {
      await hrmsPool.close();
      hrmsPool = null;
      console.log('✅ HRMS connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing HRMS connection:', error.message);
  }
};

// ============== CRUD Operations for MSSQL ==============

/**
 * Create employee in MSSQL
 * Note: Only permanent fields are synced to MSSQL, dynamicFields are MongoDB-only
 */
const createEmployeeMSSQL = async (employeeData) => {
  const pool = getHRMSPool();
  const request = pool.request();

  // Extract only permanent fields (exclude dynamicFields and qualifications)
  // dynamicFields and qualifications (new format - array of objects) are MongoDB-only and not synced to MSSQL
  const {
    dynamicFields,
    qualifications, // Exclude qualifications as it's now dynamic (array of objects)
    employeeAllowances, // Mongo-only
    employeeDeductions, // Mongo-only
    _id,
    __v,
    created_at,
    updated_at,
    ...permanentFields
  } = employeeData;

  // Add parameters (only permanent fields)
  request.input('emp_no', sql.VarChar(50), permanentFields.emp_no);
  request.input('employee_name', sql.NVarChar(100), permanentFields.employee_name);
  request.input('department_id', sql.VarChar(24), permanentFields.department_id || null);
  request.input('designation_id', sql.VarChar(24), permanentFields.designation_id || null);
  request.input('doj', sql.Date, permanentFields.doj || null);
  request.input('dob', sql.Date, permanentFields.dob || null);
  request.input('gross_salary', sql.Decimal(12, 2), permanentFields.gross_salary || null);
  request.input('gender', sql.VarChar(10), permanentFields.gender || null);
  request.input('marital_status', sql.VarChar(20), permanentFields.marital_status || null);
  request.input('blood_group', sql.VarChar(5), permanentFields.blood_group || null);
  // qualifications is now dynamic (array of objects) - not synced to MSSQL
  request.input('qualifications', sql.NVarChar(255), null);
  request.input('experience', sql.Int, permanentFields.experience || null);
  request.input('address', sql.NVarChar(500), permanentFields.address || null);
  request.input('location', sql.NVarChar(100), permanentFields.location || null);
  request.input('aadhar_number', sql.VarChar(12), permanentFields.aadhar_number || null);
  request.input('phone_number', sql.VarChar(15), permanentFields.phone_number || null);
  request.input('alt_phone_number', sql.VarChar(15), permanentFields.alt_phone_number || null);
  request.input('email', sql.NVarChar(100), permanentFields.email || null);
  request.input('pf_number', sql.VarChar(30), permanentFields.pf_number || null);
  request.input('esi_number', sql.VarChar(30), permanentFields.esi_number || null);
  request.input('bank_account_no', sql.VarChar(30), permanentFields.bank_account_no || null);
  request.input('bank_name', sql.NVarChar(100), permanentFields.bank_name || null);
  request.input('bank_place', sql.NVarChar(100), permanentFields.bank_place || null);
  request.input('ifsc_code', sql.VarChar(15), permanentFields.ifsc_code || null);
  request.input('is_active', sql.Bit, permanentFields.is_active !== false ? 1 : 0);

  const result = await request.query(`
    INSERT INTO employees (
      emp_no, employee_name, department_id, designation_id, doj, dob,
      gross_salary, gender, marital_status, blood_group, qualifications,
      experience, address, location, aadhar_number, phone_number, alt_phone_number,
      email, pf_number, esi_number, bank_account_no, bank_name, bank_place,
      ifsc_code, is_active, created_at, updated_at
    ) VALUES (
      @emp_no, @employee_name, @department_id, @designation_id, @doj, @dob,
      @gross_salary, @gender, @marital_status, @blood_group, @qualifications,
      @experience, @address, @location, @aadhar_number, @phone_number, @alt_phone_number,
      @email, @pf_number, @esi_number, @bank_account_no, @bank_name, @bank_place,
      @ifsc_code, @is_active, GETDATE(), GETDATE()
    )
  `);

  return result;
};

/**
 * Get all employees from MSSQL
 */
const getAllEmployeesMSSQL = async (filters = {}) => {
  const pool = getHRMSPool();
  const request = pool.request();

  let query = 'SELECT * FROM employees WHERE 1=1';

  if (filters.is_active !== undefined) {
    request.input('is_active', sql.Bit, filters.is_active ? 1 : 0);
    query += ' AND is_active = @is_active';
  }

  if (filters.department_id) {
    request.input('department_id', sql.VarChar(24), filters.department_id);
    query += ' AND department_id = @department_id';
  }

  if (filters.designation_id) {
    request.input('designation_id', sql.VarChar(24), filters.designation_id);
    query += ' AND designation_id = @designation_id';
  }

  query += ' ORDER BY employee_name ASC';

  const result = await request.query(query);
  return result.recordset;
};

/**
 * Get employee by emp_no from MSSQL
 */
const getEmployeeByIdMSSQL = async (empNo) => {
  const pool = getHRMSPool();
  const request = pool.request();
  request.input('emp_no', sql.VarChar(50), empNo);

  const result = await request.query('SELECT * FROM employees WHERE emp_no = @emp_no');
  return result.recordset[0] || null;
};

/**
 * Update employee in MSSQL
 */
/**
 * Update employee in MSSQL
 * Note: Only permanent fields are synced to MSSQL, dynamicFields are MongoDB-only
 */
const updateEmployeeMSSQL = async (empNo, employeeData) => {
  const pool = getHRMSPool();
  const request = pool.request();

  // Extract only permanent fields (exclude dynamicFields and qualifications)
  // dynamicFields and qualifications (new format - array of objects) are MongoDB-only and not synced to MSSQL
  const {
    dynamicFields,
    qualifications, // Exclude qualifications as it's now dynamic (array of objects)
    employeeAllowances, // Mongo-only
    employeeDeductions, // Mongo-only
    _id,
    __v,
    created_at,
    updated_at,
    ...permanentFields
  } = employeeData;

  request.input('emp_no', sql.VarChar(50), empNo);
  request.input('employee_name', sql.NVarChar(100), permanentFields.employee_name);
  request.input('department_id', sql.VarChar(24), permanentFields.department_id || null);
  request.input('designation_id', sql.VarChar(24), permanentFields.designation_id || null);
  request.input('doj', sql.Date, permanentFields.doj || null);
  request.input('dob', sql.Date, permanentFields.dob || null);
  request.input('gross_salary', sql.Decimal(12, 2), permanentFields.gross_salary || null);
  request.input('gender', sql.VarChar(10), permanentFields.gender || null);
  request.input('marital_status', sql.VarChar(20), permanentFields.marital_status || null);
  request.input('blood_group', sql.VarChar(5), permanentFields.blood_group || null);
  // qualifications is now dynamic (array of objects) - not synced to MSSQL
  request.input('qualifications', sql.NVarChar(255), null);
  request.input('experience', sql.Int, permanentFields.experience || null);
  request.input('address', sql.NVarChar(500), permanentFields.address || null);
  request.input('location', sql.NVarChar(100), permanentFields.location || null);
  request.input('aadhar_number', sql.VarChar(12), permanentFields.aadhar_number || null);
  request.input('phone_number', sql.VarChar(15), permanentFields.phone_number || null);
  request.input('alt_phone_number', sql.VarChar(15), permanentFields.alt_phone_number || null);
  request.input('email', sql.NVarChar(100), permanentFields.email || null);
  request.input('pf_number', sql.VarChar(30), permanentFields.pf_number || null);
  request.input('esi_number', sql.VarChar(30), permanentFields.esi_number || null);
  request.input('bank_account_no', sql.VarChar(30), permanentFields.bank_account_no || null);
  request.input('bank_name', sql.NVarChar(100), permanentFields.bank_name || null);
  request.input('bank_place', sql.NVarChar(100), permanentFields.bank_place || null);
  request.input('ifsc_code', sql.VarChar(15), permanentFields.ifsc_code || null);
  request.input('is_active', sql.Bit, permanentFields.is_active !== false ? 1 : 0);

  const result = await request.query(`
    UPDATE employees SET
      employee_name = @employee_name,
      department_id = @department_id,
      designation_id = @designation_id,
      doj = @doj,
      dob = @dob,
      gross_salary = @gross_salary,
      gender = @gender,
      marital_status = @marital_status,
      blood_group = @blood_group,
      qualifications = @qualifications,
      experience = @experience,
      address = @address,
      location = @location,
      aadhar_number = @aadhar_number,
      phone_number = @phone_number,
      alt_phone_number = @alt_phone_number,
      email = @email,
      pf_number = @pf_number,
      esi_number = @esi_number,
      bank_account_no = @bank_account_no,
      bank_name = @bank_name,
      bank_place = @bank_place,
      ifsc_code = @ifsc_code,
      is_active = @is_active,
      updated_at = GETDATE()
    WHERE emp_no = @emp_no
  `);

  return result;
};

/**
 * Delete employee from MSSQL
 */
const deleteEmployeeMSSQL = async (empNo) => {
  const pool = getHRMSPool();
  const request = pool.request();
  request.input('emp_no', sql.VarChar(50), empNo);

  const result = await request.query('DELETE FROM employees WHERE emp_no = @emp_no');
  return result;
};

/**
 * Check if employee exists in MSSQL
 */
const employeeExistsMSSQL = async (empNo) => {
  const pool = getHRMSPool();
  const request = pool.request();
  request.input('emp_no', sql.VarChar(50), empNo);

  const result = await request.query('SELECT COUNT(*) as count FROM employees WHERE emp_no = @emp_no');
  return result.recordset[0].count > 0;
};

module.exports = {
  initializeHRMSDatabase,
  getHRMSPool,
  isHRMSConnected,
  closeHRMSPool,
  createEmployeeMSSQL,
  getAllEmployeesMSSQL,
  getEmployeeByIdMSSQL,
  updateEmployeeMSSQL,
  deleteEmployeeMSSQL,
  employeeExistsMSSQL,
};

