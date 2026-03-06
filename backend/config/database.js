require('dotenv').config();
const mssql = require('mssql');
const mysql = require('mysql2/promise');
const mongoose = require('mongoose');

// Determine Database Type
const getDBType = () => {
  if (process.env.SQL_TYPE) return process.env.SQL_TYPE.toLowerCase();

  const port = parseInt(process.env.SQL_PORT);
  if (port === 3306) return 'mysql';
  if (port === 1433) return 'mssql';

  return 'mssql'; // Default to MSSQL
};

const dbType = getDBType();
let sqlPool = null;

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://team:SriPyRa2456@cluster0.cobwab6.mongodb.net/hrms';
    await mongoose.connect(mongoURI, {
      maxPoolSize: 50, // Handle high concurrency
      minPoolSize: 10,
      socketTimeoutMS: 45000,
    });
    console.log('✅ MongoDB connected successfully (Pool Size: 500)', mongoURI);
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    if (process.env.NODE_ENV !== 'test') {
      if (process.env.NODE_ENV !== "test") if (process.env.NODE_ENV !== "test") process.exit(1);
    }
  }
};

// SQL Connection (Hybrid)
const connectSQL = async () => {
  try {
    // Parse URL if provided (for MySQL mostly, but generic enough)
    const serverUrl = process.env.SQL_SERVER || 'localhost';
    // Remove protocol if present for drivers that don't need it
    const host = serverUrl.replace(/^https?:\/\//, '').split('/')[0];

    // Check if we need to auto-create database (MySQL specific mostly here, but logic helps)
    const database = process.env.SQL_DATABASE || 'HRMS';

    if (dbType === 'mysql') {
      console.log('🔄 Connecting to MySQL...');
      const config = {
        host: host,
        port: parseInt(process.env.SQL_PORT) || 3306,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: database,
        waitForConnections: true,
        connectionLimit: 300, // Increased for high load
        queueLimit: 0,
        // MySQL specific options
        multipleStatements: true
      };

      try {
        sqlPool = await mysql.createPool(config);
        // Test connection
        await sqlPool.getConnection();
        console.log('✅ MySQL connected successfully');
      } catch (err) {
        if (err.code === 'ER_BAD_DB_ERROR') {
          console.log('⚠️ Database does not exist. Attempting to create...');
          // Connect without DB to create it
          const adminConfig = { ...config, database: undefined };
          const adminPool = await mysql.createConnection(adminConfig);
          await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
          await adminPool.end();
          console.log(`✅ Database ${database} created.`);

          // Reconnect with DB
          sqlPool = await mysql.createPool(config);
          console.log('✅ MySQL connected successfully (after creation)');
        } else {
          throw err;
        }
      }

      console.log(`   Host: ${host}:${config.port}`);
      console.log(`   Database: ${database}`);

    } else {
      // MSSQL Legacy Connection
      console.log('🔄 Connecting to MSSQL...');
      const config = {
        server: host,
        port: parseInt(process.env.SQL_PORT) || 1433,
        database: database,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        options: {
          encrypt: process.env.SQL_ENCRYPT === 'true',
          trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
          enableArithAbort: true,
        },
        pool: {
          max: 300, // Increased for high load
          min: 10,
          idleTimeoutMillis: 30000,
        },
      };

      // Handle NTLM
      if (process.env.SQL_AUTH === 'ntlm' && process.env.SQL_DOMAIN) {
        config.domain = process.env.SQL_DOMAIN;
      }

      sqlPool = await mssql.connect(config);
      console.log('✅ MSSQL connected successfully');
      console.log(`   Server: ${host}:${config.port}`);
      console.log(`   Database: ${database}`);
    }

    return sqlPool;

  } catch (error) {
    console.error(`❌ ${dbType.toUpperCase()} connection error:`, error.message);
    console.warn(`⚠️  Continuing without ${dbType.toUpperCase()} connection`);
    return null;
  }
};

const getSQLPool = () => {
  if (!sqlPool) {
    // Return mock or throw based on strictness. For now throwing is safe as callers check connection usually.
    // Or return null and let helpers handle it.
    throw new Error('SQL connection not established');
  }
  return sqlPool;
};

const closeSQL = async () => {
  try {
    if (sqlPool) {
      if (dbType === 'mysql') {
        await sqlPool.end();
      } else {
        await sqlPool.close();
      }
      console.log(`✅ ${dbType.toUpperCase()} connection closed`);
    }
  } catch (error) {
    console.error('❌ Error closing SQL connection:', error.message);
  }
};

const closeMongoDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
};

const initializeDatabases = async () => {
  await connectMongoDB();
  await connectSQL();
};

module.exports = {
  connectMongoDB,
  connectSQL,
  getSQLPool,
  getDBType, // Exported for helpers
  closeSQL,
  closeMongoDB,
  initializeDatabases,
  mongoose,
  // Alias for backward compatibility if needed, though we should update callers
  connectMSSQL: connectSQL,
  getMSSQLPool: getSQLPool,
  closeMSSQL: closeSQL
};

