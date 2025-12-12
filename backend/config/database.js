require('dotenv').config();
const sql = require('mssql');
const mongoose = require('mongoose');

// MongoDB Connection
const connectMongoDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://192.168.3.185:27017/hrms';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// MSSQL Connection Pool
let mssqlPool = null;

const connectMSSQL = async () => {
  try {
    // Build server and port configuration
    const server = process.env.SQL_SERVER || 'localhost';
    const port = parseInt(process.env.SQL_PORT) || 1433;

    const config = {
      server: server,
      port: port,
      database: process.env.SQL_DATABASE || 'master',
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

    // For Windows/NTLM authentication, add domain
    if (process.env.SQL_AUTH === 'ntlm' && process.env.SQL_DOMAIN) {
      config.domain = process.env.SQL_DOMAIN;
    }

    // Validate required fields for SQL authentication
    if (process.env.SQL_AUTH === 'sql' || !process.env.SQL_AUTH) {
      if (!config.user || !config.password) {
        throw new Error('SQL_USER and SQL_PASSWORD are required for SQL authentication');
      }
    }

    mssqlPool = await sql.connect(config);
    console.log('✅ MSSQL connected successfully');
    console.log(`   Server: ${server}:${port}`);
    console.log(`   Database: ${config.database}`);
    return mssqlPool;
  } catch (error) {
    console.error('❌ MSSQL connection error:', error.message);
    // Don't exit - MSSQL is for read-only operations, app can work without it
    console.warn('⚠️  Continuing without MSSQL connection (biometric data may not be available)');
    return null;
  }
};

// Get MSSQL Pool (for use in other modules)
const getMSSQLPool = () => {
  if (!mssqlPool) {
    throw new Error('MSSQL connection not established');
  }
  return mssqlPool;
};

// Close MSSQL Connection
const closeMSSQL = async () => {
  try {
    if (mssqlPool) {
      await mssqlPool.close();
      console.log('✅ MSSQL connection closed');
    }
  } catch (error) {
    console.error('❌ Error closing MSSQL connection:', error.message);
  }
};

// Close MongoDB Connection
const closeMongoDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error.message);
  }
};

// Initialize HRMS Database (for employees)
const initializeHRMSDatabase = async () => {
  try {
    const { initializeHRMSDatabase: initHRMS } = require('../employees/config/mssqlHelper');
    await initHRMS();
  } catch (error) {
    console.error('❌ Error initializing HRMS database:', error.message);
    console.warn('⚠️  Continuing without HRMS database (employee MSSQL storage may not be available)');
  }
};

// Initialize all connections
const initializeDatabases = async () => {
  await connectMongoDB();
  await connectMSSQL();
  await initializeHRMSDatabase();
};

module.exports = {
  connectMongoDB,
  connectMSSQL,
  getMSSQLPool,
  closeMSSQL,
  closeMongoDB,
  initializeDatabases,
  mongoose,
};

