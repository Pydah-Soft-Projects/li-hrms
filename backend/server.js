
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { initializeAllDatabases } = require('./config/init');
const { checkConnection: checkS3Connection } = require('./shared/services/s3UploadService');

const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://192.168.3.147:3000',
  'http://192.168.3.198:3000',
  'http://localhost:3000'
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    credentials: true,
  }
});

// Store io on app for easy access in routes if needed
app.set('io', io);

io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);

  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`👤 User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected');
  });
});

// Export at the end of file
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Gzip compression

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // Limit each IP to 5000 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP, please try again after 15 minutes'
  }
});
app.use('/api/', limiter); // Apply rate limiting to all API routes

const logger = require('./middleware/logger');
app.use(logger); // Log all requests

// CORS configuration already handled in Socket.io initialization above,
// but we still need it for Express routes
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

const authRoutes = require('./authentication/index.js');
app.use('/api/auth', authRoutes);


const userRoutes = require('./users/index.js');
app.use('/api/users', userRoutes);


const shiftRoutes = require('./shifts/index.js');
app.use('/api/shifts', shiftRoutes);

// Departments routes
const departmentRoutes = require('./departments/index.js');
app.use('/api/departments', departmentRoutes);

// Division routes
const divisionRoutes = require('./departments/divisionRoutes.js');
app.use('/api/divisions', divisionRoutes);

// Settings routes
const settingsRoutes = require('./settings/index.js');
app.use('/api/settings', settingsRoutes);

// Employees routes
const employeeRoutes = require('./employees/index.js');
app.use('/api/employees', employeeRoutes);

// Employee Applications routes
const employeeApplicationRoutes = require('./employee-applications/index.js');
app.use('/api/employee-applications', employeeApplicationRoutes);

// Workspaces routes
const workspaceRoutes = require('./workspaces/index.js');
app.use('/api/workspaces', workspaceRoutes);

// Leaves and OD routes
const leaveRoutes = require('./leaves/index.js');
app.use('/api/leaves', leaveRoutes);

const loanRoutes = require('./loans/index.js');
app.use('/api/loans', loanRoutes);

// Salary Updates routes
const salaryUpdateRoutes = require('./salary-updates/index.js');
app.use('/api/salary-updates', salaryUpdateRoutes);

// Attendance routes
const attendanceRoutes = require('./attendance/index.js');

// Internal Attendance Routes (System-to-System, No Auth)
const internalAttendanceRoutes = require('./attendance/internalRoutes.js');
// Changed path to avoid conflict with /api/attendance which has auth middleware
app.use('/api/internal/attendance', internalAttendanceRoutes);

app.use('/api/attendance', attendanceRoutes);

// Overtime routes
const otRoutes = require('./overtime/index.js');
app.use('/api/ot', otRoutes);

// Permissions routes
const permissionRoutes = require('./permissions/index.js');
app.use('/api/permissions', permissionRoutes);

// Security Gate Pass routes
const securityRoutes = require('./security/routes/securityRoutes.js');
app.use('/api/security', securityRoutes);

// Upload routes (S3 file uploads)
const uploadRoutes = require('./shared/routes/uploadRoutes');
app.use('/api/upload', uploadRoutes);

// Allowances & Deductions routes
const allowanceDeductionRoutes = require('./allowances-deductions/index.js');
app.use('/api/allowances-deductions', allowanceDeductionRoutes);

// Payroll routes
const payrollRoutes = require('./payroll/index.js');
app.use('/api/payroll', payrollRoutes);

// Pay Register routes
const payRegisterRoutes = require('./pay-register/index.js');
app.use('/api/pay-register', payRegisterRoutes);

// Arrears routes
const arrearsRoutes = require('./arrears/index.js');
app.use('/api/arrears', arrearsRoutes);

// PayrollBatch routes
const payrollBatchRoutes = require('./payroll/routes/payrollBatchRoutes.js');
app.use('/api/payroll-batch', payrollBatchRoutes);

// Bonus routes
const bonusRoutes = require('./bonus/routes/bonusRoutes.js');
app.use('/api/bonus', bonusRoutes);

// Dashboard routes
const dashboardRoutes = require('./dashboard/index.js');
app.use('/api/dashboard', dashboardRoutes);

// Internal Job Test Routes (For verification)
const jobTestRoutes = require('./shared/routes/jobTestRoutes');
app.use('/api/internal/jobs', jobTestRoutes);

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
    await initializeAllDatabases();

    // Check S3 Connection
    await checkS3Connection();

    // Start attendance sync job
    const { startSyncJob } = require('./attendance/services/attendanceSyncJob');
    await startSyncJob();

    // Start BullMQ Workers for Background Jobs
    try {
      const { startWorkers } = require('./shared/jobs/worker');
      startWorkers();
    } catch (redisError) {
      console.warn('⚠️ Could not start BullMQ workers. Is Redis running?', redisError.message);
    }

    // Start server
    server.listen(PORT, () => {
      console.log(`🚀 HRMS Backend Server is running on port ${PORT}`);
      console.log(`📍 Server URL: http://localhost:${PORT}`);
      console.log(`📋 API Root: http://localhost:${PORT}/`);
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket Enabled`);
      console.log(`\n📦 Available Endpoints:`);
      console.log(`   - Authentication: /api/auth`);
      console.log(`   - Users: /api/users`);
      console.log(`   - Shifts: /api/shifts`);
      console.log(`   - Departments: /api/departments`);
      console.log(`   - Settings: /api/settings`);
      console.log(`   - Employees: /api/employees`);
      console.log(`   - Employee Applications: /api/employee-applications`);
      console.log(`   - Workspaces: /api/workspaces`);
      console.log(`   - Leaves & OD: /api/leaves`);
      console.log(`   - Loans: /api/loans`);
      console.log(`   - Attendance: /api/attendance`);
      console.log(`   - Overtime: /api/ot`);
      console.log(`   - Permissions: /api/permissions`);
      console.log(`   - Allowances & Deductions: /api/allowances-deductions`);
      console.log(`   - Payroll: /api/payroll`);
      console.log(`   - Pay Register: /api/pay-register`);
      console.log(`   - Bonus: /api/bonus`);
      console.log(`   - Arrears: /api/arrears`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    if (process.env.NODE_ENV !== "test") process.exit(1);
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

// Export app for testing
// Export app for testing
module.exports = { app, server, io };

// Start the server only if run directly (not required as a module)
if (require.main === module) {
  startServer();
}

