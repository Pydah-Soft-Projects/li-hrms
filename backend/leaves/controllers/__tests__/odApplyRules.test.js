const mongoose = require('mongoose');

jest.mock('../../model/OD', () => {
  return jest.fn().mockImplementation((data) => ({
    ...data,
    _id: new (require('mongoose').Types.ObjectId)(),
    save: jest.fn().mockResolvedValue(this),
  }));
});
jest.mock('../../model/LeaveSettings', () => ({
  getActiveSettings: jest.fn().mockResolvedValue({
    settings: {
      allowBackdated: true,
      maxBackdatedDays: 30,
      allowFutureDated: true,
      maxAdvanceDays: 365,
    },
    workflow: {
      steps: [],
      finalAuthority: { role: 'hr' },
    },
  }),
  findOne: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../employees/model/Employee', () => ({
  findById: jest.fn(),
  findOne: jest.fn(),
}));
jest.mock('../../../users/model/User', () => ({
  findById: jest.fn(),
}));
jest.mock('../../../attendance/model/AttendanceDaily', () => ({
  findOne: jest.fn(),
}));
jest.mock('../../services/dateCycleService', () => ({
  getPeriodInfo: jest.fn().mockResolvedValue({
    payrollCycle: {
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
    },
  }),
}));
jest.mock('../../../departments/controllers/departmentSettingsController', () => ({
  getResolvedLeaveSettings: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../../shared/middleware/dataScopeMiddleware', () => ({
  getEmployeeIdsInScope: jest.fn().mockResolvedValue([]),
  checkJurisdiction: jest.fn().mockReturnValue(true),
}));
jest.mock('../../services/odDurationClassificationService', () => ({
  parseEvidenceInstant: jest.fn((d) => (d ? new Date(d) : null)),
  classifyRegularOdFromEvidence: jest.fn().mockResolvedValue({
    isTentative: false,
    durationClassification: 'full_day',
    tentativeHalfDayType: null,
    skipReason: null,
  }),
}));
jest.mock('../../../shared/services/conflictValidationService', () => ({
  validateODRequest: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
  validateHoursOdAttendance: jest.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
}));
jest.mock('../../../attendance/services/processingModeResolutionService', () => ({
  getProcessingModeForEmployee: jest.fn().mockResolvedValue({ mode: 'single_shift' }),
}));
jest.mock('../../services/leavePayrollPeriodValidationService', () => ({
  assertEmployeeRangeRequestsEditable: jest.fn().mockResolvedValue(true),
}));

const Employee = require('../../../employees/model/Employee');
const AttendanceDaily = require('../../../attendance/model/AttendanceDaily');
const odController = require('../odController');

describe('odController.applyOD - Rules verification', () => {
  let mockEmployee;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEmployee = {
      _id: new mongoose.Types.ObjectId(),
      emp_no: 'EMP100',
      employee_name: 'Test Employee',
      populate: jest.fn().mockResolvedValue(this),
      division_id: { _id: new mongoose.Types.ObjectId(), name: 'Division A' },
      department_id: { _id: new mongoose.Types.ObjectId(), name: 'Department B' },
      designation_id: { _id: new mongoose.Types.ObjectId(), name: 'Engineer' },
      dynamicFields: {},
    };
    Employee.findOne.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue(mockEmployee),
    });
  });

  test('blocks past-date OD when user lacks file upload permission in user management', async () => {
    const req = {
      body: {
        fromDate: '2026-10-01',
        toDate: '2026-10-01',
        purpose: 'Client visit',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'employee',
        featureControl: [], // Lacks LEAVE_OD:file
        emp_no: 'EMP100',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await odController.applyOD(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('file upload permission in User Management'),
      })
    );
  });

  test('allows past-date check to pass when user has LEAVE_OD:file permission', async () => {
    const req = {
      body: {
        fromDate: '2026-10-01',
        toDate: '2026-10-01',
        purpose: 'Client visit',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'employee',
        featureControl: ['LEAVE_OD:file'], // Has file upload option
        emp_no: 'EMP100',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // No attendance punches for that date (null punches)
    AttendanceDaily.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await odController.applyOD(req, res);

    // It should NOT be rejected with 403 past-date error
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  test('blocks OD when attendance record has single punch of IN on that date', async () => {
    const today = new Date().toISOString().split('T')[0];
    const req = {
      body: {
        fromDate: today,
        toDate: today,
        purpose: 'Client visit',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'employee',
        featureControl: [],
        emp_no: 'EMP100',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // AttendanceDaily with single punch IN (inTime present, outTime null)
    AttendanceDaily.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        status: 'PARTIAL',
        shifts: [
          {
            inTime: new Date(`${today}T09:00:00+05:30`),
            outTime: null,
          },
        ],
      }),
    });

    await odController.applyOD(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.stringMatching(/single punch|null punches/i),
      })
    );
  });

  test('allows OD when attendance punches are null (no punches recorded)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const req = {
      body: {
        fromDate: today,
        toDate: today,
        purpose: 'Client visit',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'employee',
        featureControl: [],
        emp_no: 'EMP100',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // AttendanceDaily with null punches (neither IN nor OUT)
    AttendanceDaily.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        status: 'ABSENT',
        shifts: [
          {
            inTime: null,
            outTime: null,
          },
        ],
      }),
    });

    await odController.applyOD(req, res);

    // Should NOT be blocked for single punch
    if (res.status.mock.calls.length > 0) {
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/single punch/i),
        })
      );
    }
  });

  test('allows OD when attendance has two punches (both IN and OUT)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const req = {
      body: {
        fromDate: today,
        toDate: today,
        purpose: 'Client visit',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        odType_extended: 'hours',
        odStartTime: '14:00',
        odEndTime: '16:00',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'employee',
        featureControl: [],
        emp_no: 'EMP100',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    // AttendanceDaily with two punches
    AttendanceDaily.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        status: 'PRESENT',
        shifts: [
          {
            inTime: new Date(`${today}T09:00:00+05:30`),
            outTime: new Date(`${today}T18:00:00+05:30`),
          },
        ],
      }),
    });

    await odController.applyOD(req, res);

    // Should NOT be blocked for single punch
    if (res.status.mock.calls.length > 0) {
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/single punch/i),
        })
      );
    }
  });

  test('allows OD on single punch day when user has file upload permission (LEAVE_OD:file)', async () => {
    const today = new Date().toISOString().split('T')[0];
    const req = {
      body: {
        fromDate: today,
        toDate: today,
        purpose: 'Client visit authorized by manager',
        placeVisited: 'Site A',
        empNo: 'EMP100',
        startEvidence: {
          photoEvidence: { url: 'https://example.com/photo.jpg' },
          geoLocation: { latitude: 12.97, longitude: 77.59 },
        },
      },
      user: {
        _id: new mongoose.Types.ObjectId(),
        role: 'hr',
        featureControl: ['LEAVE_OD:file'],
        emp_no: 'HR001',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    AttendanceDaily.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        status: 'HALF_DAY',
        shifts: [
          {
            inTime: new Date(`${today}T09:00:00+05:30`),
            outTime: null,
          },
        ],
      }),
    });

    await odController.applyOD(req, res);

    // Should NOT be blocked for single punch because user has file upload permission
    if (res.status.mock.calls.length > 0) {
      expect(res.json).not.toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringMatching(/single punch/i),
        })
      );
    }
  });
});
