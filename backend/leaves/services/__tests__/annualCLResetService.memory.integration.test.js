/**
 * End-to-end style annual reset: in-memory MongoDB, real LeaveRegisterYear + Employee,
 * mocked date cycle + policy (deterministic 12 calendar periods). Exercises resetEmployeeCL →
 * upsertLeaveRegisterYear → recalculateRegisterBalances.
 *
 * First run may download mongodb-memory-server binary (~2 min). CI should cache it.
 */
jest.setTimeout(180000);

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../../attendance/services/summaryCalculationService', () => ({
  recalculateOnLeaveRegisterUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../settings/services/leavePolicyTypeConfigService', () => ({
  getLeavePolicyResolved: jest.fn(),
  toResolvedPolicyPlain: (x) => x || {},
}));

jest.mock('../dateCycleService', () => {
  const y = 2026;
  const cycles = [];
  for (let m = 0; m < 12; m++) {
    const start = new Date(y, m, 1, 12, 0, 0);
    const last = new Date(y, m + 1, 0).getDate();
    const end = new Date(y, m, last, 23, 59, 59);
    cycles.push({ startDate: start, endDate: end, month: m + 1, year: y, isCustomCycle: false });
  }
  return {
    getFinancialYearForDate: jest.fn().mockImplementation(async (date) => {
      const d = new Date(date);
      const y = d.getFullYear();
      return {
        name: String(y),
        year: y,
        startDate: new Date(y, 0, 1),
        endDate: new Date(y, 11, 31, 23, 59, 59),
        isCustomYear: false,
      };
    }),
    getPayrollCyclesInRange: jest.fn().mockResolvedValue(cycles),
    getPayrollCycleForDate: jest.fn().mockImplementation(async (date) => {
      const d = new Date(date);
      const m0 = d.getMonth();
      const y = d.getFullYear();
      const start = new Date(y, m0, 1, 12, 0, 0);
      const last = new Date(y, m0 + 1, 0).getDate();
      const end = new Date(y, m0, last, 23, 59, 59);
      return { startDate: start, endDate: end, month: m0 + 1, year: y, isCustomCycle: false };
    }),
    getPayrollCycleSettings: jest.fn().mockResolvedValue({ startDay: 1, endDay: 31 }),
    getPeriodInfo: jest.fn().mockImplementation(async (date) => {
      const d = new Date(date);
      const y = d.getFullYear();
      const m0 = d.getMonth();
      const start = new Date(y, m0, 1, 12, 0, 0);
      const last = new Date(y, m0 + 1, 0).getDate();
      const end = new Date(y, m0, last, 23, 59, 59);
      return {
        date,
        payrollCycle: { startDate: start, endDate: end, month: m0 + 1, year: y, isCustomCycle: false },
        financialYear: {
          name: String(y),
          year: y,
          startDate: new Date(y, 0, 1),
          endDate: new Date(y, 11, 31, 23, 59, 59),
        },
      };
    }),
    getLeavePolicySettings: jest.fn(),
    calculateRemainingPayrollPeriodsInFY: jest.fn().mockResolvedValue(12),
  };
});

const { getLeavePolicyResolved } = require('../../../settings/services/leavePolicyTypeConfigService');
const leaveRegisterService = require('../leaveRegisterService');
const LeaveRegisterYear = require('../../model/LeaveRegisterYear');
const { resetEmployeeCL } = require('../annualCLResetService');

function buildBasePolicy(overrides = {}) {
  return {
    financialYear: { useCalendarYear: true },
    annualCLReset: {
      enabled: true,
      addCarryForward: true,
      maxCarryForwardCl: 5,
      resetToBalance: 12,
      resetMonth: 4,
      resetDay: 1,
      usePayrollCycleForReset: false,
      casualLeaveByExperience: [
        {
          minYears: 0,
          maxYears: 100,
          casualLeave: 12,
          monthlyClCredits: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
      ],
    },
    annualResetByLeaveType: {},
    monthlyLeaveApplicationCap: { maxDaysByType: {} },
    carryForward: { compensatoryOff: { carryMonthlyPoolToNextPayrollMonth: true } },
    earnedLeave: { enabled: true, useAsPaidInPayroll: true },
    ...overrides,
  };
}

let mongoServer;
let Employee;

describe('resetEmployeeCL (in-memory Mongo + mocked cycles)', () => {
  let getBalanceImpl;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    Employee = require('../../../employees/model/Employee');
  });

  afterAll(async () => {
    if (mongoose.connection.readyState) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
    if (mongoServer) await mongoServer.stop();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const cols = await mongoose.connection.db.listCollections().toArray();
    for (const c of cols) {
      if (!c.name.startsWith('system')) {
        await mongoose.connection.db.collection(c.name).deleteMany({});
      }
    }
    if (getBalanceImpl) {
      getBalanceImpl.mockRestore();
    }
    getBalanceImpl = jest.spyOn(leaveRegisterService, 'getCurrentBalance');
  });

  it('persists LeaveRegisterYear with 12 months, CL monthly CREDITs, and yearly ADJUSTMENT for opening pool', async () => {
    const policy = buildBasePolicy();
    getLeavePolicyResolved.mockResolvedValue(policy);
    getBalanceImpl.mockImplementation(async (employeeId, leaveType) => {
      if (String(leaveType).toUpperCase() === 'CL') return 8;
      return 0;
    });

    const resetDate = new Date(2026, 3, 1, 10, 0, 0);

    const emp = await Employee.create({
      emp_no: 'MEM01',
      employee_name: 'Memory Int',
      is_active: true,
      doj: new Date(2015, 0, 1),
      compensatoryOffs: 0,
      casualLeaves: 8,
      paidLeaves: 0,
    });
    const empDoc = await Employee.findById(emp._id);

    const r = await resetEmployeeCL(empDoc, policy, resetDate);
    expect(r.success).toBe(true);
    expect(typeof r.newBalance).toBe('number');

    const doc = await LeaveRegisterYear.findOne({ employeeId: emp._id, financialYear: '2026' }).lean();
    expect(doc).toBeTruthy();
    expect(doc.months.length).toBe(12);

    const allTx = (doc.months || []).flatMap((m) => m.transactions || []);
    const clSched = allTx.filter((t) => t.autoGeneratedType === 'MONTHLY_CL_SCHEDULE');
    expect(clSched.length).toBe(12);
    const anyExpiry = (doc.yearlyTransactions || []).some((y) => y.transactionKind === 'EXPIRY' && y.leaveType === 'CL');
    const anyAdj = (doc.yearlyTransactions || []).some((y) => y.leaveType === 'CL' && y.transactionKind === 'ADJUSTMENT');
    expect(anyAdj).toBe(true);
    if (8 > 5) {
      expect(anyExpiry).toBe(true);
    }
  });

  it('adds EL scheduled credits when annualResetByLeaveType.EL is enabled (same FY doc)', async () => {
    const elGrid = { minYears: 0, maxYears: 100, casualLeave: 12, monthlyClCredits: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] };
    const policy = buildBasePolicy({
      annualResetByLeaveType: {
        EL: {
          enabled: true,
          addCarryForward: false,
          maxCarryForwardCl: 0,
          resetToBalance: 6,
          casualLeaveByExperience: [elGrid],
        },
      },
    });
    getLeavePolicyResolved.mockResolvedValue(policy);
    getBalanceImpl.mockImplementation(async (employeeId, leaveType) => {
      const u = String(leaveType).toUpperCase();
      if (u === 'CL') return 0;
      if (u === 'EL') return 2;
      return 0;
    });

    const resetDate = new Date(2026, 3, 1, 10, 0, 0);

    const emp = await Employee.create({
      emp_no: 'MEM02',
      employee_name: 'Memory EL',
      is_active: true,
      doj: new Date(2010, 0, 1),
      compensatoryOffs: 0,
      casualLeaves: 0,
      paidLeaves: 2,
    });
    const empDoc = await Employee.findById(emp._id);

    const r = await resetEmployeeCL(empDoc, policy, resetDate);
    expect(r.success).toBe(true);

    const doc = await LeaveRegisterYear.findOne({ employeeId: emp._id, financialYear: '2026' }).lean();
    expect(doc).toBeTruthy();
    const allTx = (doc.months || []).flatMap((m) => m.transactions || []);
    const elSched = allTx.filter((t) => t.autoGeneratedType === 'MONTHLY_EL_SCHEDULE' && t.leaveType === 'EL');
    expect(elSched.length).toBe(12);
    const elExp = (doc.yearlyTransactions || []).some(
      (y) => y.transactionKind === 'EXPIRY' && y.leaveType === 'EL'
    );
    expect(elExp).toBe(true);
  });
});
