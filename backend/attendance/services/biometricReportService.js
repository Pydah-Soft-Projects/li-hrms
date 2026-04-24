const mongoose = require('mongoose');

// Cache the Atlas connection
let atlasConn = null;

const resolveBiometricMongoUri = () =>
    process.env.MONGODB_BIOMETRIC_URI || process.env.MONGODB_ATLAS_BIOMETRIC_URI || '';

const getAtlasConnection = async () => {
    if (atlasConn && atlasConn.readyState === 1) return atlasConn;

    const uri = resolveBiometricMongoUri();
    if (!uri) {
        throw new Error('MONGODB_BIOMETRIC_URI or MONGODB_ATLAS_BIOMETRIC_URI is not defined in .env');
    }

    atlasConn = mongoose.createConnection(uri, {
        serverSelectionTimeoutMS: 15000,
    });

    await atlasConn.asPromise();
    console.log('✅ Connected to Biometric Atlas Database');
    return atlasConn;
};

// Simplified model for Atlas Logs
const getAtlasLogModel = async () => {
    const conn = await getAtlasConnection();
    const schema = new mongoose.Schema({
        employeeId: String,
        timestamp: Date,
        logType: String,
        rawType: Number,
        deviceId: String,
        deviceName: String,
        ipAddress: String,
        receivedAt: Date
    }, { collection: 'attendancelogs', strict: false });

    return conn.models.AttendanceLog || conn.model('AttendanceLog', schema);
};

/**
 * Fetch biometric logs from Atlas
 */
const getThumbReports = async (filters = {}) => {
    try {
        const Model = await getAtlasLogModel();
        const query = {};

        if (filters.employeeId) {
            query.employeeId = filters.employeeId;
        } else if (filters.employeeIds && Array.isArray(filters.employeeIds)) {
            query.employeeId = { $in: filters.employeeIds };
        }

        if (filters.startDate || filters.endDate) {
            query.timestamp = {};
            if (filters.startDate) query.timestamp.$gte = new Date(filters.startDate);
            if (filters.endDate) query.timestamp.$lte = new Date(filters.endDate);
        }

        const limit = parseInt(filters.limit) || 50;
        const page = parseInt(filters.page) || 1;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            Model.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Model.countDocuments(query)
        ]);

        return {
            logs,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
        };
    } catch (error) {
        console.error('Error fetching thumb reports:', error);
        throw error;
    }
};

/**
 * All punch rows for one employee in [rangeStart, rangeEnd] from biometric Mongo (Atlas/local URI).
 * Used after application verify to replay punches that were skipped while the employee did not exist in HRMS.
 */
const findBiometricLogsForEmployeeBackfill = async (empNo, rangeStart, rangeEnd) => {
    if (!resolveBiometricMongoUri()) return [];

    const emp = String(empNo || '').trim();
    if (!emp || !rangeStart || !rangeEnd) return [];
    const start = rangeStart instanceof Date ? rangeStart : new Date(rangeStart);
    const end = rangeEnd instanceof Date ? rangeEnd : new Date(rangeEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];

    try {
        const Model = await getAtlasLogModel();
        const variants = [...new Set([emp, emp.toUpperCase(), emp.toLowerCase()])];
        return Model.find({
            employeeId: { $in: variants },
            timestamp: { $gte: start, $lte: end },
        })
            .sort({ timestamp: 1 })
            .lean();
    } catch (err) {
        console.error('[findBiometricLogsForEmployeeBackfill]', err.message);
        return [];
    }
};

module.exports = {
    getThumbReports,
    findBiometricLogsForEmployeeBackfill,
    resolveBiometricMongoUri,
};
