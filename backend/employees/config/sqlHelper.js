/**
 * SQL Helper for Employee Module (Hybrid: MSSQL + MySQL)
 * Handles database and table auto-creation for HRMS
 */

const sql = require('mssql'); // For types
const { getSQLPool, getDBType } = require('../../config/database');

const dbType = getDBType();

// Helper to map JS types to MSSQL types
const getMSSQLType = (value) => {
    if (value === null || value === undefined) return sql.NVarChar; // Default for nulls
    if (typeof value === 'number') return Number.isInteger(value) ? sql.Int : sql.Decimal(12, 2);
    if (value instanceof Date) return sql.Date;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return sql.Date; // Handle ISO date strings
    if (typeof value === 'boolean') return sql.Bit;
    return sql.NVarChar;
};

/**
 * Initialize HRMS Database and Employees Table
 */
const initializeHRMSDatabase = async () => {
    try {
        const pool = getSQLPool();

        // Database creation is handled in connectSQL for MySQL
        // For MSSQL, it was handled in previous logic but often requires connecting to 'master' first.
        // Assuming database exists or was created by connectSQL logic in database.js

        await createEmployeesTable();
        console.log(`✅ HRMS ${dbType.toUpperCase()} schema initialized`);
    } catch (error) {
        console.error(`❌ Error initializing HRMS ${dbType.toUpperCase()} database:`, error.message);
        console.warn(`⚠️ Continuing without ${dbType.toUpperCase()} schema initialization`);
    }
};

/**
 * Create employees table if not exists
 */
const createEmployeesTable = async () => {
    try {
        const pool = getSQLPool();

        if (dbType === 'mysql') {
            const createQuery = `
        CREATE TABLE IF NOT EXISTS employees (
          emp_no VARCHAR(50) PRIMARY KEY,
          employee_name VARCHAR(100) NOT NULL,
          department_id VARCHAR(24),
          designation_id VARCHAR(24),
          doj DATE,
          dob DATE,
          gross_salary DECIMAL(12,2),
          gender VARCHAR(10),
          marital_status VARCHAR(20),
          blood_group VARCHAR(5),
          qualifications VARCHAR(255),
          experience INT,
          address VARCHAR(500),
          location VARCHAR(100),
          aadhar_number VARCHAR(12),
          phone_number VARCHAR(15),
          alt_phone_number VARCHAR(15),
          email VARCHAR(100),
          pf_number VARCHAR(30),
          esi_number VARCHAR(30),
          bank_account_no VARCHAR(30),
          bank_name VARCHAR(100),
          bank_place VARCHAR(100),
          ifsc_code VARCHAR(15),
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )`;
            await pool.query(createQuery);

        } else {
            // MSSQL
            const tableCheckResult = await pool.request().query(`
            SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'employees'
        `);

            if (tableCheckResult.recordset.length === 0) {
                await pool.request().query(`
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
            }
        }
        console.log('✅ employees table checked/created');
    } catch (error) {
        console.error('❌ Error creating employees table:', error.message);
        console.warn('⚠️ Continuing even if employees table check failed');
    }
};

/**
 * Check if SQL Database is connected
 */
const isHRMSConnected = () => {
    try {
        const pool = getSQLPool();
        return !!pool;
    } catch (error) {
        return false;
    }
};

// ============== CRUD Operations ==============

const createEmployeeMSSQL = async (employeeData) => {
    // Legacy support alias if needed, but we should update callers to use generic name
    return createEmployeeSQL(employeeData);
};

const createEmployeeSQL = async (employeeData) => {
    const pool = getSQLPool();

    // Extract permanent fields
    const {
        dynamicFields, qualifications, employeeAllowances, employeeDeductions,
        paidLeaves, allottedLeaves, ctcSalary, calculatedSalary, _id, __v,
        created_at, updated_at,
        ...permanentFields
    } = employeeData;

    const fields = { ...permanentFields, qualifications: null, is_active: permanentFields.is_active !== false };

    if (dbType === 'mysql') {
        const keys = Object.keys(fields);
        const values = Object.values(fields);
        // MySQL uses ? for placeholders
        const placeholders = keys.map(() => '?').join(', ');
        const query = `INSERT INTO employees (${keys.join(', ')}, created_at, updated_at) VALUES (${placeholders}, NOW(), NOW())`;

        const [result] = await pool.execute(query, values);
        return result;

    } else {
        // MSSQL
        const request = pool.request();
        Object.entries(fields).forEach(([key, value]) => {
            // Simple type mapping based on value, or hardcoded for known fields
            // For safety with mssql lib, it's often better to let it infer or be explicit.
            // Given complexity, we iterate known fields if possible, or use implicit types.
            // For now, we rely on implicit or manual mapping if strictly needed.
            // Let's use the standard request.input without type if possible, or basic types.
            request.input(key, value);
        });

        // Construct Query
        const cols = Object.keys(fields).join(', ');
        const vars = Object.keys(fields).map(key => `@${key}`).join(', ');

        const query = `INSERT INTO employees (${cols}, created_at, updated_at) VALUES (${vars}, GETDATE(), GETDATE())`;
        return await request.query(query);
    }
};

const getAllEmployeesSQL = async (filters = {}) => {
    const pool = getSQLPool();

    if (dbType === 'mysql') {
        let query = 'SELECT * FROM employees WHERE 1=1';
        const params = [];

        if (filters.is_active !== undefined) {
            query += ' AND is_active = ?';
            params.push(filters.is_active ? 1 : 0);
        }
        if (filters.department_id) {
            query += ' AND department_id = ?';
            params.push(filters.department_id);
        }
        if (filters.designation_id) {
            query += ' AND designation_id = ?';
            params.push(filters.designation_id);
        }
        query += ' ORDER BY employee_name ASC';

        const [rows] = await pool.execute(query, params);
        return rows;

    } else {
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
    }
};

const getEmployeeByIdSQL = async (empNo) => {
    const pool = getSQLPool();

    if (dbType === 'mysql') {
        const [rows] = await pool.execute('SELECT * FROM employees WHERE emp_no = ?', [empNo]);
        return rows[0] || null;
    } else {
        const result = await pool.request()
            .input('emp_no', sql.VarChar(50), empNo)
            .query('SELECT * FROM employees WHERE emp_no = @emp_no');
        return result.recordset[0] || null;
    }
};

const EMPLOYEE_TABLE_COLUMNS = [
    'emp_no', 'employee_name', 'department_id', 'designation_id', 'doj', 'dob',
    'gross_salary', 'gender', 'marital_status', 'blood_group', 'qualifications',
    'experience', 'address', 'location', 'aadhar_number', 'phone_number',
    'alt_phone_number', 'email', 'pf_number', 'esi_number', 'bank_account_no',
    'bank_name', 'bank_place', 'ifsc_code', 'is_active'
];

const updateEmployeeSQL = async (empNo, employeeData) => {
    const pool = getSQLPool();
    // Extract permanent fields
    const {
        dynamicFields, qualifications, employeeAllowances, employeeDeductions,
        paidLeaves, allottedLeaves, ctcSalary, calculatedSalary, _id, __v,
        created_at, updated_at,
        ...permanentFields
    } = employeeData;

    const fields = { ...permanentFields };
    if (qualifications !== undefined) fields.qualifications = qualifications; // Use original value or handle if needed

    // Only update is_active if provided, otherwise leave it alone (partial update)
    // Note: permanentFields already includes is_active if it was in the input
    if (permanentFields.is_active !== undefined) {
        fields.is_active = permanentFields.is_active;
    }

    // FILTER fields to only include valid MSSQL columns
    // This prevents "Invalid column name" errors if extra fields (e.g. from MongoDB) are passed
    const validFields = {};
    Object.keys(fields).forEach(key => {
        if (EMPLOYEE_TABLE_COLUMNS.includes(key)) {
            validFields[key] = fields[key];
        }
    });

    if (Object.keys(validFields).length === 0) {
        console.warn(`⚠️ No valid MSSQL columns to update for employee ${empNo}. Skipping SQL update.`);
        return;
    }

    if (dbType === 'mysql') {
        const sets = [];
        const values = [];
        Object.entries(validFields).forEach(([key, value]) => {
            sets.push(`${key} = ?`);
            values.push(value);
        });
        sets.push('updated_at = NOW()');

        values.push(empNo); // For WHERE clause

        const query = `UPDATE employees SET ${sets.join(', ')} WHERE emp_no = ?`;
        const [result] = await pool.execute(query, values);
        return result;

    } else {
        const request = pool.request();
        request.input('emp_no', sql.VarChar(50), empNo);

        const sets = [];
        Object.entries(validFields).forEach(([key, value]) => {
            if (key === 'emp_no') return; // Primary key is usually not updated this way, but if it is in fields we skip it as we use it in WHERE

            // Special handling for boolean/bit fields to prevent driver confusion
            if (key === 'is_active') {
                request.input(key, sql.Bit, value);
            } else {
                request.input(key, getMSSQLType(value), value);
            }
            sets.push(`${key} = @${key}`);
        });

        if (sets.length === 0) return; // Nothing to update

        const query = `UPDATE employees SET ${sets.join(', ')}, updated_at = GETDATE() WHERE emp_no = @emp_no`;
        return await request.query(query);
    }
};

const deleteEmployeeSQL = async (empNo) => {
    const pool = getSQLPool();
    if (dbType === 'mysql') {
        const [result] = await pool.execute('DELETE FROM employees WHERE emp_no = ?', [empNo]);
        return result;
    } else {
        return await pool.request()
            .input('emp_no', sql.VarChar(50), empNo)
            .query('DELETE FROM employees WHERE emp_no = @emp_no');
    }
};

const employeeExistsSQL = async (empNo) => {
    const pool = getSQLPool();
    if (dbType === 'mysql') {
        const [rows] = await pool.execute('SELECT COUNT(*) as count FROM employees WHERE emp_no = ?', [empNo]);
        return rows[0].count > 0;
    } else {
        const result = await pool.request()
            .input('emp_no', sql.VarChar(50), empNo)
            .query('SELECT COUNT(*) as count FROM employees WHERE emp_no = @emp_no');
        return result.recordset[0].count > 0;
    }
};

module.exports = {
    initializeHRMSDatabase,
    getSQLPool,
    // Alias with old names for backward compatibility if we can't update all callers immediately
    // But prefer using new names
    createEmployeeSQL,
    getAllEmployeesSQL,
    getEmployeeByIdSQL,
    updateEmployeeSQL,
    deleteEmployeeSQL,
    employeeExistsSQL,
    isHRMSConnected,

    // Legacy Aliases
    getHRMSPool: getSQLPool,
    createEmployeeMSSQL: createEmployeeSQL,
    getAllEmployeesMSSQL: getAllEmployeesSQL,
    getEmployeeByIdMSSQL: getEmployeeByIdSQL,
    updateEmployeeMSSQL: updateEmployeeSQL,
    deleteEmployeeMSSQL: deleteEmployeeSQL,
    employeeExistsMSSQL: employeeExistsSQL
};
