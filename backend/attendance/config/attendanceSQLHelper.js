/**
 * SQL Helper for Attendance Module (Hybrid: MSSQL + MySQL)
 * Handles fetching attendance logs and table creation
 */

const mssql = require('mssql');
const mysql = require('mysql2/promise');
const { getDBType } = require('../../config/database');

const dbType = getDBType();

/**
 * Get SQL config for attendance database
 * This creates a connection config for a specific database on the main SQL server
 */
const getAttendanceSQLConfig = (databaseName) => {
    const host = (process.env.SQL_SERVER || 'localhost').replace(/^https?:\/\//, '').split('/')[0];
    const port = parseInt(process.env.SQL_PORT) || (dbType === 'mysql' ? 3306 : 1433);

    if (dbType === 'mysql') {
        return {
            host: host,
            port: port,
            user: process.env.SQL_USER,
            password: process.env.SQL_PASSWORD,
            database: databaseName,
            multipleStatements: true
        };
    } else {
        return {
            server: host,
            port: port,
            database: databaseName,
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
    }
};

/**
 * Create biometric_logs table if it doesn't exist
 * Useful for testing or when using a dedicated table for logs
 */
const createBiometricLogsTable = async (databaseName, tableName = 'biometric_logs') => {
    let connection = null;
    try {
        const config = getAttendanceSQLConfig(databaseName);

        if (dbType === 'mysql') {
            connection = await mysql.createConnection(config);
            const query = `
                CREATE TABLE IF NOT EXISTS \`${tableName}\` (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    employee_number VARCHAR(50) NOT NULL,
                    timestamp DATETIME NOT NULL,
                    log_type VARCHAR(10),
                    device_id VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX (employee_number),
                    INDEX (timestamp)
                )
            `;
            await connection.execute(query);
            console.log(`✅ MySQL table ${tableName} ensures in ${databaseName}`);
        } else {
            connection = await mssql.connect(config);
            const query = `
                IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='${tableName}' AND xtype='U')
                CREATE TABLE [${tableName}] (
                    id INT IDENTITY(1 PRIMARY KEY,
                    employee_number VARCHAR(50) NOT NULL,
                    timestamp DATETIME NOT NULL,
                    log_type VARCHAR(10),
                    device_id VARCHAR(50),
                    created_at DATETIME DEFAULT GETDATE()
                );
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_${tableName}_Emp' AND object_id = OBJECT_ID('${tableName}'))
                CREATE INDEX IX_${tableName}_Emp ON [${tableName}] (employee_number);
                IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_${tableName}_Time' AND object_id = OBJECT_ID('${tableName}'))
                CREATE INDEX IX_${tableName}_Time ON [${tableName}] (timestamp);
            `;
            await connection.request().query(query);
            console.log(`✅ MSSQL table ${tableName} ensures in ${databaseName}`);
        }
    } catch (error) {
        console.error(`❌ Error creating biometric table:`, error.message);
    } finally {
        if (connection) {
            if (dbType === 'mysql') await connection.end();
            else await connection.close();
        }
    }
};

/**
 * Fetch attendance logs from SQL
 * @param {Object} settings - Attendance settings with SQL config
 * @param {Date} fromDate - Start date (optional)
 * @param {Date} toDate - End date (optional)
 * @returns {Array} Array of raw log records
 */
const fetchAttendanceLogsSQL = async (settings, fromDate = null, toDate = null) => {
    let connection = null;
    try {
        const sqlConfig = settings.mssqlConfig; // Keep name for now to avoid schema change
        if (!sqlConfig.databaseName || !sqlConfig.tableName) {
            throw new Error('SQL database name and table name must be configured');
        }

        const config = getAttendanceSQLConfig(sqlConfig.databaseName);
        const mapping = sqlConfig.columnMapping;
        const empCol = mapping.employeeNumberColumn || 'EmployeeNumber';
        const timeCol = mapping.timestampColumn || 'Timestamp';
        const typeCol = mapping.typeColumn || 'Type';

        let logs = [];

        if (dbType === 'mysql') {
            connection = await mysql.createConnection(config);

            let query = `SELECT \`${empCol}\` as EmployeeNumber, \`${timeCol}\` as Timestamp`;
            if (mapping.hasTypeColumn && typeCol) {
                query += `, \`${typeCol}\` as Type`;
            }
            query += ` FROM \`${sqlConfig.tableName}\` WHERE 1=1`;

            const params = [];
            if (fromDate) {
                query += ` AND \`${timeCol}\` >= ?`;
                params.push(fromDate);
            }
            if (toDate) {
                query += ` AND \`${timeCol}\` <= ?`;
                params.push(toDate);
            }

            query += ` ORDER BY \`${empCol}\`, \`${timeCol}\``;

            const [rows] = await connection.execute(query, params);
            logs = rows;

        } else {
            connection = await mssql.connect(config);
            const request = connection.request();

            let query = `SELECT [${empCol}] as EmployeeNumber, [${timeCol}] as Timestamp`;
            if (mapping.hasTypeColumn && typeCol) {
                query += `, [${typeCol}] as Type`;
            }
            query += ` FROM [${sqlConfig.tableName}]`;

            const conditions = [];
            if (fromDate) {
                request.input('fromDate', mssql.DateTime, fromDate);
                conditions.push(`[${timeCol}] >= @fromDate`);
            }
            if (toDate) {
                request.input('toDate', mssql.DateTime, toDate);
                conditions.push(`[${timeCol}] <= @toDate`);
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }
            query += ` ORDER BY [${empCol}], [${timeCol}]`;

            const result = await request.query(query);
            logs = result.recordset;
        }

        return logs.map(record => ({
            employeeNumber: String(record.EmployeeNumber || record.employeeNumber || '').trim().toUpperCase(),
            timestamp: record.Timestamp || record.timestamp,
            type: mapping.hasTypeColumn && record.Type ? (String(record.Type).toUpperCase() === 'IN' ? 'IN' : 'OUT') : null,
            rawData: record,
        })).filter(record => record.employeeNumber && record.timestamp);

    } catch (error) {
        console.error(`Error fetching attendance logs from ${dbType.toUpperCase()}:`, error);
        throw error;
    } finally {
        if (connection) {
            if (dbType === 'mysql') await connection.end();
            else await connection.close();
        }
    }
};

/**
 * Check if SQL connection is available
 */
const isSQLAvailable = async (settings) => {
    let connection = null;
    try {
        const sqlConfig = settings.mssqlConfig;
        if (!sqlConfig.databaseName || !sqlConfig.tableName) {
            return false;
        }
        const config = getAttendanceSQLConfig(sqlConfig.databaseName);

        if (dbType === 'mysql') {
            connection = await mysql.createConnection(config);
        } else {
            connection = await mssql.connect(config);
        }
        return true;
    } catch (error) {
        return false;
    } finally {
        if (connection) {
            if (dbType === 'mysql') await connection.end();
            else await connection.close();
        }
    }
};

module.exports = {
    fetchAttendanceLogsSQL,
    isSQLAvailable,
    createBiometricLogsTable,
    // Aliases for compatibility
    fetchAttendanceLogsFromMSSQL: fetchAttendanceLogsSQL,
    isMSSQLAvailable: isSQLAvailable
};
