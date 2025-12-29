require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const logger = require('./utils/logger');
const DeviceService = require('./services/DeviceService');
const SyncScheduler = require('./jobs/syncScheduler');
const apiRoutes = require('./routes/api');
const deviceRoutes = require('./routes/devices');
const admsRoutes = require('./routes/adms');
const userSyncRoutes = require('./routes/userSync');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.text({ type: 'text/plain', limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize services (will load devices from database)
const deviceService = new DeviceService();
const syncScheduler = new SyncScheduler(
    deviceService,
    parseInt(process.env.SYNC_INTERVAL_MINUTES) || 15
);

// Make device service available to routes
app.set('deviceService', deviceService);

// Routes
app.use('/api', apiRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/user-sync', userSyncRoutes); // Added: Use userSyncRoutes
app.use('/api/adms/raw', (req, res, next) => {
    // Forward to the adms router's internally defined /api/raw endpoint
    req.url = '/api/raw';
    next();
}, admsRoutes);
app.use('/iclock', admsRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Biometric Log Collection System',
        version: '1.0.0',
        endpoints: {
            logs: 'GET /api/logs?employeeId=&startDate=&endDate=&logType=',
            employeeLogs: 'GET /api/logs/employee/:employeeId',
            sync: 'POST /api/sync',
            deviceStatus: 'GET /api/devices/status',
            stats: 'GET /api/stats',
            latestSync: 'GET /api/logs/latest',
            health: 'GET /health',
            devices: {
                list: 'GET /api/devices',
                get: 'GET /api/devices/:deviceId',
                add: 'POST /api/devices',
                update: 'PUT /api/devices/:deviceId',
                delete: 'DELETE /api/devices/:deviceId',
                toggle: 'PATCH /api/devices/:deviceId/toggle'
            }
        }
    });
});

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/biometric_logs';

mongoose.connect(MONGODB_URI)
    .then(() => {
        logger.info('Connected to MongoDB');

        // Start the server
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`API Documentation: http://localhost:${PORT}/`);

            // Start the sync scheduler ONLY if interval > 0
            if (parseInt(process.env.SYNC_INTERVAL_MINUTES) > 0) {
                syncScheduler.start();

                // Run initial sync after 5 seconds
                setTimeout(async () => {
                    logger.info('Running initial sync...');
                    try {
                        await syncScheduler.runNow();
                    } catch (error) {
                        logger.error('Initial sync failed:', error);
                    }
                }, 5000);
            } else {
                logger.info('Automated TCP Sync is DISABLED (running in ADMS-Only mode).');
            }
        });
    })
    .catch((error) => {
        logger.error('MongoDB connection failed:', error);
        process.exit(1);
    });

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    syncScheduler.stop();
    await mongoose.connection.close();
    process.exit(0);
});

module.exports = app;
