/**
 * HRMS MongoDB connection and minimal models for Employee, Department, Division.
 * Used to enrich attendance export with employee name, department, division.
 * Database: mongodb://localhost:27017/hrms (same server as main HRMS backend).
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const HRMS_MONGODB_URI = process.env.HRMS_MONGODB_URI || 'mongodb://localhost:27017/hrms';

let hrmsConnection = null;
let hrmsModels = null;

// Minimal schemas matching HRMS collections (read-only usage)
const divisionSchema = new mongoose.Schema({
    name: String,
    code: String,
    description: String
}, { collection: 'divisions', strict: false });

const departmentSchema = new mongoose.Schema({
    name: String,
    code: String,
    description: String
}, { collection: 'departments', strict: false });

const employeeSchema = new mongoose.Schema({
    emp_no: { type: String, required: true },
    employee_name: { type: String, required: true },
    division_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' },
    department_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    is_active: { type: Boolean, default: true }
}, { collection: 'employees', strict: false });

async function connectHRMS() {
    if (hrmsConnection) return hrmsConnection;
    try {
        hrmsConnection = mongoose.createConnection(HRMS_MONGODB_URI, {
            maxPoolSize: 10,
            socketTimeoutMS: 10000
        });
        await hrmsConnection.asPromise();
        hrmsModels = {
            Division: hrmsConnection.model('Division', divisionSchema),
            Department: hrmsConnection.model('Department', departmentSchema),
            Employee: hrmsConnection.model('Employee', employeeSchema)
        };
        logger.info('HRMS MongoDB connected (hrms database)');
        return hrmsConnection;
    } catch (err) {
        logger.error('HRMS MongoDB connection failed:', err.message);
        return null;
    }
}

function getHRMSConnection() {
    return hrmsConnection;
}

function getHRMSModels() {
    return hrmsModels;
}

module.exports = {
    connectHRMS,
    getHRMSConnection,
    getHRMSModels,
    HRMS_MONGODB_URI
};
