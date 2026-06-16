/**
 * Database Initialization Service
 * Coordinates database initialization to avoid circular dependencies.
 */

const { initializeDatabases } = require('./database');

const initializeAllDatabases = async () => {
  await initializeDatabases();
};

module.exports = {
  initializeAllDatabases,
};
