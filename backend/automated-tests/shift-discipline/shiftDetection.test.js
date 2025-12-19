const mongoose = require('mongoose');
const {
    getShiftsForEmployee,
    detectAndAssignShift,
    calculateLateIn,
    calculateEarlyOut
} = require('../../shifts/services/shiftDetectionService');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');

// Mock all Mongoose models
jest.mock('../../employees/model/Employee');
jest.mock('../../shifts/model/Shift');
jest.mock('../../shifts/model/PreScheduledShift');
jest.mock('../../attendance/model/AttendanceDaily');
jest.mock('../../shifts/model/ConfusedShift');

describe('Shift Detection Unit Tests - Discipline Tracking', () => {
    const mockEmployeeId = new mongoose.Types.ObjectId();
    const mockShiftId1 = new mongoose.Types.ObjectId();
    const mockShiftId2 = new mongoose.Types.ObjectId();

    const mockEmployee = {
        _id: mockEmployeeId,
        emp_no: 'EMP001',
        designation_id: {
            shifts: [mockShiftId1]
        },
        department_id: {
            shifts: [mockShiftId2]
        }
    };

    const mockShift1 = {
        _id: mockShiftId1,
        name: 'Shift 1 (Designation)',
        startTime: '09:00',
        endTime: '18:00',
        duration: 9,
        gracePeriod: 15,
        isActive: true
    };

    const mockShift2 = {
        _id: mockShiftId2,
        name: 'Shift 2 (Department)',
        startTime: '10:00',
        endTime: '19:00',
        duration: 9,
        gracePeriod: 15,
        isActive: true
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getShiftsForEmployee', () => {
        test('should return combined shifts from roster, designation, and department', async () => {
            // Mock employee lookup
            Employee.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(mockEmployee)
                })
            });

            // Mock rostered shift
            const mockRosterId = new mongoose.Types.ObjectId();
            const mockRosteredShiftId = new mongoose.Types.ObjectId();
            const mockRosteredShift = { _id: mockRosteredShiftId, name: 'Rostered Shift' };

            PreScheduledShift.findOne.mockReturnValue({
                populate: jest.fn().mockResolvedValue({
                    _id: mockRosterId,
                    shiftId: mockRosteredShift
                })
            });

            // Mock shift lookups
            Shift.find.mockImplementation((query) => {
                if (query._id.$in.includes(mockShiftId1)) return Promise.resolve([mockShift1]);
                if (query._id.$in.includes(mockShiftId2)) return Promise.resolve([mockShift2]);
                return Promise.resolve([]);
            });

            const result = await getShiftsForEmployee('EMP001', '2025-12-19');

            expect(result.shifts).toHaveLength(3); // Rostered + Designation + Department
            expect(result.rosteredShiftId.toString()).toBe(mockRosteredShiftId.toString());
            expect(result.rosterRecordId.toString()).toBe(mockRosterId.toString());
        });
    });

    describe('detectAndAssignShift - Discipline & Flexibility', () => {
        test('should match Designation shift even if Roster exists but punch is closer to Designation', async () => {
            // Setup: 09:00 Roster, 14:00 Designation. Punch is 14:10.
            const rosterShiftId = new mongoose.Types.ObjectId();
            const desigShiftId = new mongoose.Types.ObjectId();

            const rosterShift = { _id: rosterShiftId, startTime: '09:00', endTime: '18:00', name: 'Roster 9-6', duration: 9 };
            const desigShift = { _id: desigShiftId, startTime: '14:00', endTime: '23:00', name: 'Desig 2-11', duration: 9 };

            // Mock getShiftsForEmployee behavior
            Employee.findOne.mockReturnValue({ populate: jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockEmployee) }) });
            PreScheduledShift.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), shiftId: rosterShift }) });
            Shift.find.mockResolvedValue([desigShift]);

            const punchTime = new Date('2025-12-19T14:10:00');

            const result = await detectAndAssignShift('EMP001', '2025-12-19', punchTime);

            expect(result.success).toBe(true);
            expect(result.assignedShift.toString()).toBe(desigShiftId.toString());
            expect(result.matchMethod).toBe('proximity_single');
            // Verify deviation was recorded
            expect(PreScheduledShift.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ isDeviation: true, actualShiftId: desigShiftId })
            );
        });

        test('should record NO deviation if punch matches Rostered shift', async () => {
            const rosterShiftId = new mongoose.Types.ObjectId();
            const rosterShift = { _id: rosterShiftId, startTime: '09:00', endTime: '18:00', name: 'Roster 9-6', duration: 9 };

            PreScheduledShift.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), shiftId: rosterShift }) });
            Shift.find.mockResolvedValue([]); // No desig/dept shifts for simplicity

            const punchTime = new Date('2025-12-19T09:05:00');

            const result = await detectAndAssignShift('EMP001', '2025-12-19', punchTime);

            expect(result.success).toBe(true);
            expect(result.assignedShift.toString()).toBe(rosterShiftId.toString());
            expect(PreScheduledShift.findByIdAndUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ isDeviation: false, actualShiftId: rosterShiftId })
            );
        });
    });
});
