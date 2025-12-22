/**
 * Database Initialization Service
 * This service coordinates the initialization of various database components
 * to avoid circular dependencies between database config and model helpers.
 */

const { initializeDatabases: initBase } = require('./database');
const { initializeHRMSDatabase: initHRMS } = require('../employees/config/sqlHelper');

const initializeAllDatabases = async () => {
    // Initialize MongoDB and SQL Connections first
    await initBase();

    // Then initialize HRMS specific table schemas
    await initHRMS();
};

module.exports = {
    initializeAllDatabases
};
