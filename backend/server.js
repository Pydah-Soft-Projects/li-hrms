require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initializeDatabases } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const logger = require('./middleware/logger');
app.use(logger); // Log all requests

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint - Returns metadata
app.get('/', (req, res) => {
  res.json({
    name: 'HRMS Backend API',
    version: '1.0.0',
    status: 'running',
    message: 'HRMS Backend Server is operational',
    endpoints: {
      authentication: '/api/auth',
      employees: '/api/employees'
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Import and mount module routes
// Authentication routes
const authRoutes = require('./authentication/index.js');
app.use('/api/auth', authRoutes);

// Users routes
const userRoutes = require('./users/index.js');
app.use('/api/users', userRoutes);

// Shifts routes
const shiftRoutes = require('./shifts/index.js');
app.use('/api/shifts', shiftRoutes);

// Departments routes
const departmentRoutes = require('./departments/index.js');
app.use('/api/departments', departmentRoutes);

// Settings routes
const settingsRoutes = require('./settings/index.js');
app.use('/api/settings', settingsRoutes);

// Employees routes
const employeeRoutes = require('./employees/index.js');
app.use('/api/employees', employeeRoutes);

// Workspaces routes
const workspaceRoutes = require('./workspaces/index.js');
app.use('/api/workspaces', workspaceRoutes);

// Leaves and OD routes
const leaveRoutes = require('./leaves/index.js');
app.use('/api/leaves', leaveRoutes);

const loanRoutes = require('./loans/index.js');
app.use('/api/loans', loanRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'Something went wrong'
  });
});

// Initialize databases and start server
const startServer = async () => {
  try {
    // Initialize database connections
    await initializeDatabases();

    // Start server
    app.listen(PORT, () => {
      console.log(`🚀 HRMS Backend Server is running on port ${PORT}`);
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`📋 API Root: http://localhost:${PORT}/`);
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
      console.log(`\n📦 Available Endpoints:`);
      console.log(`   - Authentication: /api/auth`);
      console.log(`   - Users: /api/users`);
      console.log(`   - Shifts: /api/shifts`);
      console.log(`   - Departments: /api/departments`);
      console.log(`   - Settings: /api/settings`);
      console.log(`   - Employees: /api/employees`);
      console.log(`   - Workspaces: /api/workspaces`);
      console.log(`   - Leaves & OD: /api/leaves`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  const { closeMongoDB, closeMSSQL } = require('./config/database');
  await closeMSSQL();
  await closeMongoDB();
  process.exit(0);
});

// Start the server
startServer();

