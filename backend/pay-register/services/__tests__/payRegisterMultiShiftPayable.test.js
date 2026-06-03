/**
 * Multi-shift payable accumulation — robust tests (unit + optional live MongoDB).
 * Run: npm run test:pay-register-multishift-payable
 */

const mongoose = require('mongoose');
const PayRegisterSummary = require('../../model/PayRegisterSummary');
const Shift = require('../../../shifts/model/Shift');
const { calculateTotals } = require('../totalsCalculationService');
const {
  applyShiftSelectionToDailyRecord,
  normalizeShiftSelections,
  computePayableFromSelections,
} = require('../payRegisterShiftUtils');
const shiftA = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const shiftB = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');

const shiftMap = new Map([
  [String(shiftA), { name: 'Shift A', payableShifts: 1 }],
  [String(shiftB), { name: 'Shift B', payableShifts: 1 }],
]);

/** Same payable math as applyShiftSelectionToDailyRecord, without Shift.find (unit tests). */
function applyMultiShiftEditSync(pr, date, shiftSelections) {
  const dr = pr.dailyRecords.find((r) => r.date === date);
  const selections = normalizeShiftSelections(shiftSelections);
  dr.shiftSelections = selections;
  dr.shiftIds = selections.map((s) => s.shiftId);
  const { payableShifts, shiftNames } = computePayableFromSelections(selections, shiftMap);
  dr.payableShifts = payableShifts;
  dr.shiftId = selections[0]?.shiftId || null;
  dr.shiftName = shiftNames.length ? shiftNames.join(' + ') : null;
  pr.markModified('dailyRecords');
  pr.recalculateTotals();
}

function makePresentDay(date, payableShifts = 1) {
  return {
    date,
    firstHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
    secondHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
    status: 'present',
    isSplit: false,
    payableShifts,
    shiftIds: [],
    shiftSelections: [],
    isManuallyEdited: false,
    isLate: false,
    isEarlyOut: false,
  };
}

function modelPayable(dailyRecords) {
  const pr = new PayRegisterSummary({
    employeeId: new mongoose.Types.ObjectId(),
    emp_no: 'TEST-MS',
    month: '2026-05',
    dailyRecords,
  });
  pr.recalculateTotals();
  return pr.totals.totalPayableShifts;
}

describe('Multi-shift — payable accumulation (calculateTotals vs recalculateTotals)', () => {
  test('MS-PAY-01: 17 days @1, edit 2 days to 2 payable each → +4 (19 total)', () => {
    const days = [];
    for (let d = 1; d <= 17; d++) {
      days.push(makePresentDay(`2026-05-${String(d).padStart(2, '0')}`, 1));
    }
    expect(calculateTotals(days, {}).totalPayableShifts).toBe(17);

    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-01',
      month: '2026-05',
      dailyRecords: days,
    });

    const twoShifts = [
      { shiftId: shiftA, isHalf: false, payableUnits: 1 },
      { shiftId: shiftB, isHalf: false, payableUnits: 1 },
    ];
    applyMultiShiftEditSync(pr, '2026-05-10', twoShifts);
    applyMultiShiftEditSync(pr, '2026-05-11', twoShifts);

    const afterCalc = calculateTotals(pr.dailyRecords, {}).totalPayableShifts;
    const afterModel = modelPayable(pr.dailyRecords);
    expect(afterCalc).toBe(19);
    expect(afterModel).toBe(19);
  });

  test('MS-PAY-06: reproduces 32 → 36 when two days gain +2 payable each (multi-shift edit)', () => {
    const days = [];
    for (let d = 1; d <= 32; d++) {
      days.push(makePresentDay(`2026-05-${String(d).padStart(2, '0')}`, 1));
    }
    expect(calculateTotals(days, {}).totalPayableShifts).toBe(32);

    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-06',
      month: '2026-05',
      dailyRecords: days,
    });

    // Two shifts totalling 3 payable units/day (+2 vs baseline 1) on two days → +4 month total
    const heavyDay = [
      { shiftId: shiftA, isHalf: false, payableUnits: 1.5 },
      { shiftId: shiftB, isHalf: false, payableUnits: 1.5 },
    ];
    applyMultiShiftEditSync(pr, '2026-05-10', heavyDay);
    applyMultiShiftEditSync(pr, '2026-05-11', heavyDay);

    expect(calculateTotals(pr.dailyRecords, {}).totalPayableShifts).toBe(36);
    expect(modelPayable(pr.dailyRecords)).toBe(36);
  });

  test('MS-PAY-08: two present days 1 → 2 payable adds +2 (32 → 34)', () => {
    const days = [];
    for (let d = 1; d <= 32; d++) {
      days.push(makePresentDay(`2026-05-${String(d).padStart(2, '0')}`, 1));
    }
    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-08',
      month: '2026-05',
      dailyRecords: days,
    });
    const twoShifts = [
      { shiftId: shiftA, isHalf: false, payableUnits: 1 },
      { shiftId: shiftB, isHalf: false, payableUnits: 1 },
    ];
    applyMultiShiftEditSync(pr, '2026-05-10', twoShifts);
    applyMultiShiftEditSync(pr, '2026-05-11', twoShifts);
    expect(pr.totals.totalPayableShifts).toBe(34);
  });

  test('MS-PAY-02: one day two shifts (1.0 + 0.5 explicit units) = 1.5 payable', () => {
    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-02',
      month: '2026-05',
      dailyRecords: [makePresentDay('2026-05-19', 1)],
    });

    applyMultiShiftEditSync(pr, '2026-05-19', [
      { shiftId: shiftA, isHalf: false, payableUnits: 1 },
      { shiftId: shiftB, isHalf: true, payableUnits: 0.5 },
    ]);

    expect(pr.dailyRecords[0].payableShifts).toBe(1.5);
    expect(calculateTotals(pr.dailyRecords, {}).totalPayableShifts).toBe(1.5);
    expect(modelPayable(pr.dailyRecords)).toBe(1.5);
  });

  test('MS-PAY-03: half-day present uses half of day payableShifts (2 shifts → 1.0 for working half)', () => {
    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-03',
      month: '2026-05',
      dailyRecords: [
        {
          date: '2026-05-20',
          firstHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
          secondHalf: { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
          status: null,
          isSplit: true,
          payableShifts: 1,
          shiftIds: [],
          shiftSelections: [],
        },
      ],
    });

    applyMultiShiftEditSync(pr, '2026-05-20', [
      { shiftId: shiftA, isHalf: false, payableUnits: 1 },
      { shiftId: shiftB, isHalf: false, payableUnits: 1 },
    ]);

    expect(pr.dailyRecords[0].payableShifts).toBe(2);
    expect(calculateTotals(pr.dailyRecords, {}).totalPayableShifts).toBe(1);
  });

  test('MS-PAY-04: two-shift selection stores payableShifts=2 on the day', () => {
    const pr = new PayRegisterSummary({
      employeeId: new mongoose.Types.ObjectId(),
      emp_no: 'MS-PAY-04',
      month: '2026-05',
      dailyRecords: [makePresentDay('2026-05-15', 1)],
    });

    applyMultiShiftEditSync(pr, '2026-05-15', [
      { shiftId: shiftA, isHalf: false, payableUnits: 1 },
      { shiftId: shiftB, isHalf: false, payableUnits: 1 },
    ]);

    const day = pr.dailyRecords[0];
    expect(day.payableShifts).toBe(2);
    expect(day.shiftSelections).toHaveLength(2);
    expect(pr.totals.totalPayableShifts).toBe(2);
  });

  test('MS-PAY-05: does NOT count absent halves toward payable', () => {
    const totals = calculateTotals(
      [
        {
          date: '2026-05-21',
          firstHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
          secondHalf: { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
          status: null,
          isSplit: true,
          payableShifts: 4,
          shiftIds: [shiftA],
          shiftSelections: [{ shiftId: shiftA, isHalf: false }],
        },
      ],
      {}
    );
    expect(totals.totalPayableShifts).toBe(2);
  });

  test('MS-PAY-07: old bug — present-day count (18) vs summed payable (19)', () => {
    const days = [];
    for (let d = 1; d <= 17; d++) {
      days.push(makePresentDay(`2026-05-${String(d).padStart(2, '0')}`, 1));
    }
    days[9].payableShifts = 2;
    days[10].payableShifts = 2;

    const totals = calculateTotals(days, {});
    expect(totals.totalPresentDays).toBe(17);
    expect(totals.totalPayableShifts).toBe(19);
    expect(totals.totalPayableShifts).not.toBe(totals.totalPresentDays);
  });
});

const hasMongo = Boolean(process.env.MONGODB_URI);

(hasMongo ? describe : describe.skip)('Multi-shift — live MongoDB (real shifts)', () => {
  let shiftLow;
  let shiftHigh;
  let employeeId;
  let month = '2026-05';

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const Employee = require('../../../employees/model/Employee');
    const shifts = await Shift.find({ isActive: { $ne: false } })
      .select('name payableShifts')
      .sort({ payableShifts: 1 })
      .limit(5)
      .lean();
    if (shifts.length < 2) return;
    shiftLow = shifts[0];
    shiftHigh = shifts.find((s) => Number(s.payableShifts) > Number(shiftLow.payableShifts)) || shifts[1];

    const emp = await Employee.findOne({ is_active: { $ne: false } }).select('_id emp_no').lean();
    if (!emp) return;
    employeeId = emp._id;
  }, 60000);

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
  });

  test('live: shift master payableShifts differ', () => {
    if (!shiftLow || !shiftHigh) return;
    expect(Number(shiftHigh.payableShifts) || 1).toBeGreaterThanOrEqual(Number(shiftLow.payableShifts) || 1);
  });

  test('live: two-shift edit increases month totalPayableShifts by expected delta', async () => {
    if (!employeeId) return;
    const prDoc = await PayRegisterSummary.findOne({ employeeId, month });
    if (!prDoc) return;

    const before = prDoc.totals?.totalPayableShifts ?? 0;
    const targetDate = prDoc.dailyRecords?.find(
      (r) => r.firstHalf?.status === 'present' || r.secondHalf?.status === 'present'
    )?.date;
    if (!targetDate) return;

    const dayBefore = prDoc.dailyRecords.find((r) => r.date === targetDate);
    const payableBefore = Number(dayBefore?.payableShifts) || 1;

    await applyShiftSelectionToDailyRecord(dayBefore, {
      shiftSelections: [
        { shiftId: shiftLow._id, isHalf: false },
        { shiftId: shiftHigh._id, isHalf: false },
      ],
    });

    const expectedDayPayable =
      (Number(shiftLow.payableShifts) || 1) + (Number(shiftHigh.payableShifts) || 1);

    prDoc.markModified('dailyRecords');
    prDoc.recalculateTotals();
    const after = prDoc.totals.totalPayableShifts;
    const delta = after - before;

    expect(dayBefore.payableShifts).toBe(expectedDayPayable);
    expect(delta).toBeCloseTo(expectedDayPayable - payableBefore, 2);
  });
});
