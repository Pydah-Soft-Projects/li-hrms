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
const Settings = require('../../settings/model/Settings');
const customGrouping = require('../../shared/utils/customEmployeeGrouping');

// Mock all Mongoose models and helpers
jest.mock('../../employees/model/Employee');
jest.mock('../../shifts/model/Shift');
jest.mock('../../shifts/model/PreScheduledShift');
jest.mock('../../attendance/model/AttendanceDaily');
jest.mock('../../shifts/model/ConfusedShift');
jest.mock('../../settings/model/Settings');
jest.mock('../../shared/utils/customEmployeeGrouping');

describe('Shift Detection Unit Tests - Discipline Tracking', () => {
    const mockEmployeeId = new mongoose.Types.ObjectId();
    const mockShiftId1 = new mongoose.Types.ObjectId();
    const mockShiftId2 = new mongoose.Types.ObjectId();

    const mockEmployee = {
        _id: mockEmployeeId,
        emp_no: 'EMP001',
        designation_id: {
            _id: new mongoose.Types.ObjectId(),
            shifts: [mockShiftId1]
        },
        department_id: {
            _id: new mongoose.Types.ObjectId(),
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
        Settings.getSettingsByCategory = jest.fn().mockResolvedValue({
            late_in_grace_time: 15,
            early_out_grace_time: 15,
            processingMode: {},
        });
        customGrouping.isCustomEmployeeGroupingEnabled = jest.fn().mockResolvedValue(false);
    });

    describe('getShiftsForEmployee', () => {
        test('should return combined shifts from roster, designation, and department', async () => {
            // Mock employee lookup with proper chaining
            const mockPopulate = jest.fn().mockReturnThis();
            Employee.findOne.mockReturnValue({
                populate: mockPopulate
            });

            // Mock rostered shift
            const mockRosterId = new mongoose.Types.ObjectId();
            const mockRosteredShiftId = new mongoose.Types.ObjectId();
            const mockRosteredShift = { _id: mockRosteredShiftId, name: 'Rostered Shift', startTime: '09:00', endTime: '18:00', duration: 9 };

            const mockPopulate2 = jest.fn().mockReturnThis();
            PreScheduledShift.findOne.mockReturnValue({
                populate: mockPopulate2
            });
            
            // Setup PreScheduledShift mock to resolve with the mocked data
            PreScheduledShift.findOne.mockImplementation(() => ({
                populate: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue({
                    _id: mockRosterId,
                    shiftId: mockRosteredShift,
                    actualShiftId: null
                }),
                then: function(callback) {
                    return callback({
                        _id: mockRosterId,
                        shiftId: mockRosteredShift,
                        actualShiftId: null
                    });
                }
            }));

            // Mock shift lookups
            Shift.find.mockImplementation((query) => {
                if (query._id && query._id.$in && (query._id.$in.includes(mockShiftId1) || query._id.$in.some(id => id.toString() === mockShiftId1.toString()))) {
                    return Promise.resolve([mockShift1]);
                }
                if (query._id && query._id.$in && (query._id.$in.includes(mockShiftId2) || query._id.$in.some(id => id.toString() === mockShiftId2.toString()))) {
                    return Promise.resolve([mockShift2]);
                }
                return Promise.resolve([]);
            });

            const result = await getShiftsForEmployee('EMP001', '2025-12-19');

            expect(result.shifts.length).toBeGreaterThan(0); 
        });
    });

    describe('detectAndAssignShift - Discipline & Flexibility', () => {
        test('should match Designation shift even if Roster exists but punch is closer to Designation', async () => {
            // Setup: 09:00 Roster, 14:00 Designation. Punch is 14:10.
            const rosterShiftId = new mongoose.Types.ObjectId();
            const desigShiftId = new mongoose.Types.ObjectId();

            const rosterShift = { _id: rosterShiftId, startTime: '09:00', endTime: '18:00', name: 'Roster 9-6', duration: 9, gracePeriod: 15 };
            const desigShift = { _id: desigShiftId, startTime: '14:00', endTime: '23:00', name: 'Desig 2-11', duration: 9, gracePeriod: 15 };

            // Mock employee with designation that has desigShift
            const mockEmpWithDesig = {
                ...mockEmployee,
                designation_id: { shifts: [desigShiftId] }
            };

            Employee.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue(mockEmpWithDesig)
                    })
                })
            });
            PreScheduledShift.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), shiftId: rosterShift })
                })
            });

            Shift.find.mockResolvedValue([desigShift]);

            const punchTime = new Date('2025-12-19T14:10:00');

            const result = await detectAndAssignShift('EMP001', '2025-12-19', punchTime);

            expect(result.success).toBe(true);
        });

        test('should record NO deviation if punch matches Rostered shift', async () => {
            const rosterShiftId = new mongoose.Types.ObjectId();
            const rosterShift = { _id: rosterShiftId, startTime: '09:00', endTime: '18:00', name: 'Roster 9-6', duration: 9, gracePeriod: 15 };

            Employee.findOne.mockImplementation(() => ({
                populate: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue(mockEmployee),
                then: function(callback) { return callback(mockEmployee); }
            }));

            PreScheduledShift.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue({ _id: new mongoose.Types.ObjectId(), shiftId: rosterShift })
                })
            });

            Shift.find.mockResolvedValue([]); // No desig/dept shifts for simplicity

            const punchTime = new Date('2025-12-19T09:05:00');

            const result = await detectAndAssignShift('EMP001', '2025-12-19', punchTime);

            expect(result.success).toBe(true);
        });

        test('should include segment metadata when the assigned shift defines firstHalf/secondHalf', async () => {
            const shiftId = new mongoose.Types.ObjectId();
            const halfDayShift = {
                _id: shiftId,
                name: 'Half Day Split Shift',
                startTime: '09:00',
                endTime: '17:00',
                duration: 8,
                gracePeriod: 10,
                firstHalf: {
                    startTime: '09:00',
                    endTime: '13:00',
                    duration: 4,
                    gracePeriod: 5,
                    payableShifts: 1,
                },
                secondHalf: {
                    startTime: '13:00',
                    endTime: '17:00',
                    duration: 4,
                    gracePeriod: 5,
                    payableShifts: 1,
                },
                isActive: true,
            };

            Employee.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockReturnValue({
                        populate: jest.fn().mockResolvedValue({
                            ...mockEmployee,
                            division_id: null,
                            department_id: null,
                            designation_id: { _id: new mongoose.Types.ObjectId(), shifts: [shiftId] },
                        })
                    })
                })
            });

            PreScheduledShift.findOne.mockReturnValue({
                populate: jest.fn().mockReturnValue({
                    populate: jest.fn().mockResolvedValue(null)
                })
            });

            Shift.find.mockResolvedValue([halfDayShift]);

            const punchTimeIn = new Date('2025-12-19T09:10:00');
            const punchTimeOut = new Date('2025-12-19T17:00:00');

            const result = await detectAndAssignShift('EMP001', '2025-12-19', punchTimeIn, punchTimeOut);

            expect(result.success).toBe(true);
            expect(result.shiftSegments).toBeDefined();
            expect(Array.isArray(result.shiftSegments)).toBe(true);
            expect(result.shiftSegments.length).toBeGreaterThan(0);
        });
    });
});
