const mongoose = require('mongoose');
const path = require('path');

// Absolute paths to models and services
const attendanceDailyPath = path.resolve(__dirname, '../../model/AttendanceDaily');
const preScheduledPath = path.resolve(__dirname, '../../../shifts/model/PreScheduledShift');
const shiftDetectionServicePath = path.resolve(__dirname, '../../../shifts/services/shiftDetectionService');
const employeePath = path.resolve(__dirname, '../../../employees/model/Employee');
const shiftPath = path.resolve(__dirname, '../../../shifts/model/Shift');
const confusedShiftPath = path.resolve(__dirname, '../../../shifts/model/ConfusedShift');
const extraHoursPath = path.resolve(__dirname, '../../services/extraHoursService');
const summaryPath = path.resolve(__dirname, '../../services/summaryCalculationService');

// Mock dependencies first with doMock
jest.doMock(attendanceDailyPath, () => {
    const mock = jest.fn().mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(true)
    }));
    mock.findOne = jest.fn();
    mock.findOneAndUpdate = jest.fn();
    mock.findByIdAndUpdate = jest.fn();
    mock.create = jest.fn();
    return mock;
});

jest.doMock(preScheduledPath, () => {
    const mock = jest.fn().mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(true)
    }));
    mock.findOne = jest.fn();
    mock.findByIdAndUpdate = jest.fn();
    mock.find = jest.fn();
    return mock;
});

jest.doMock(shiftDetectionServicePath, () => ({
    detectAndAssignShift: jest.fn(),
    calculateLateIn: jest.fn().mockReturnValue(0),
    calculateEarlyOut: jest.fn().mockReturnValue(0),
}));

jest.doMock(employeePath, () => ({
    findOne: jest.fn(),
}));

jest.doMock(shiftPath, () => ({
    findById: jest.fn(),
    find: jest.fn(),
}));

jest.doMock(confusedShiftPath, () => ({
    findOne: jest.fn(),
}));

jest.doMock(extraHoursPath, () => ({
    detectExtraHours: jest.fn().mockResolvedValue(true),
}));

jest.doMock(summaryPath, () => ({
    recalculateOnAttendanceUpdate: jest.fn().mockResolvedValue(true),
}));

// Require units under test AFTER mocking
const AttendanceDaily = require(attendanceDailyPath);
const PreScheduledShift = require(preScheduledPath);
const { detectAndAssignShift } = require(shiftDetectionServicePath);
const { updateOutTime, assignShift } = require('../attendanceController');

describe('Shift Discipline Integration Tests', () => {
    let mockRes;
    let mockReq;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis()
        };
    });

    test('updateOutTime should link attendance to roster', async () => {
        const mockAttendanceId = new mongoose.Types.ObjectId();
        const mockRosterId = new mongoose.Types.ObjectId();

        const mockAttendanceRecord = {
            _id: mockAttendanceId,
            employeeNumber: 'EMP001',
            date: '2025-12-19',
            save: jest.fn().mockResolvedValue(true),
            inTime: new Date('2025-12-19T09:00:00Z'),
            status: 'PRESENT'
        };

        // Standard mock for findOne chain
        AttendanceDaily.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockAttendanceRecord)
        });

        detectAndAssignShift.mockResolvedValue({
            success: true,
            assignedShift: new mongoose.Types.ObjectId(),
            rosterRecordId: mockRosterId,
            expectedHours: 9
        });

        PreScheduledShift.findByIdAndUpdate.mockResolvedValue({ _id: mockRosterId });

        mockReq = {
            params: { employeeNumber: 'EMP001', date: '2025-12-19' },
            body: { outTime: '2025-12-19T18:00:00Z' },
            user: { userId: 'admin' }
        };

        await updateOutTime(mockReq, mockRes);

        // Verify the call manually to handle any instance vs string mismatches
        const call = PreScheduledShift.findByIdAndUpdate.mock.calls[0];
        expect(call).toBeDefined();
        expect(call[0].toString()).toBe(mockRosterId.toString());
        expect(call[1].attendanceDailyId.toString()).toBe(mockAttendanceId.toString());

        expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('assignShift should track deviation', async () => {
        const mockAttendanceId = new mongoose.Types.ObjectId();
        const mockRosterId = new mongoose.Types.ObjectId();
        const oldShiftId = new mongoose.Types.ObjectId();
        const newShiftId = new mongoose.Types.ObjectId();

        const mockAttendanceRecord = {
            _id: mockAttendanceId,
            employeeNumber: 'EMP001',
            inTime: new Date('2025-12-19T09:00:00Z'),
            save: jest.fn().mockResolvedValue(true)
        };

        // Mock findOne chain (used twice in assignShift)
        AttendanceDaily.findOne.mockReturnValue({
            populate: jest.fn().mockResolvedValue(mockAttendanceRecord)
        });

        const mockRoster = {
            _id: mockRosterId,
            shiftId: oldShiftId,
            save: jest.fn().mockResolvedValue(true)
        };
        PreScheduledShift.findOne.mockResolvedValue(mockRoster);

        const Shift = require(shiftPath);
        Shift.findById.mockResolvedValue({
            _id: newShiftId,
            startTime: '09:00',
            endTime: '18:00',
            duration: 9,
            gracePeriod: 15
        });

        mockReq = {
            params: { employeeNumber: 'EMP001', date: '2025-12-19' },
            body: { shiftId: newShiftId },
            user: { userId: 'admin' }
        };

        await assignShift(mockReq, mockRes);

        expect(mockRoster.actualShiftId.toString()).toBe(newShiftId.toString());
        expect(mockRoster.isDeviation).toBe(true);
        expect(mockRoster.attendanceDailyId.toString()).toBe(mockAttendanceId.toString());
        expect(mockRoster.save).toHaveBeenCalled();
        expect(mockRes.status).toHaveBeenCalledWith(200);
    });
});
