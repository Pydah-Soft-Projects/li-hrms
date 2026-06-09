/**
 * Pay register features: modifications export, multi-shift full/half, payable totals.
 * Run: npm run test:pay-register-features
 */

const mongoose = require('mongoose');
const {
  normalizeShiftIds,
  normalizeShiftSelections,
  payableUnitsForSelection,
  computePayableFromSelections,
  extractMultiShiftFromAttendance,
  MAX_SHIFTS_PER_DAY,
} = require('../payRegisterShiftUtils');
const { calculateTotals } = require('../totalsCalculationService');
const {
  toExcelRows,
  humanizeField,
  formatExportValue,
} = require('../modificationsExportService');

const shiftA = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
const shiftB = new mongoose.Types.ObjectId('507f1f77bcf86cd799439012');
const shiftC = new mongoose.Types.ObjectId('507f1f77bcf86cd799439013');
const shiftD = new mongoose.Types.ObjectId('507f1f77bcf86cd799439014');

describe('Pay Register — Modifications export helpers', () => {
  test('humanizeField maps shift and payable fields', () => {
    expect(humanizeField('shiftSelections')).toBe('Shift full/half');
    expect(humanizeField('payableShifts')).toBe('Payable shifts');
    expect(humanizeField('firstHalf.status')).toBe('1st half status');
  });

  test('formatExportValue handles null and boolean', () => {
    expect(formatExportValue(null)).toBe('-');
    expect(formatExportValue(true)).toBe('Yes');
    expect(formatExportValue('present')).toBe('present');
  });

  test('toExcelRows produces expected columns', () => {
    const rows = toExcelRows([
      {
        empNo: 'E001',
        employeeName: 'Test User',
        division: 'Div A',
        department: 'Dept B',
        designation: 'Staff',
        date: '2026-04-05',
        fieldLabel: '1st half status',
        oldValue: 'absent',
        newValue: 'present',
        editedByName: 'Admin',
        editedByRole: 'super_admin',
        editedAt: '01 Apr 2026',
        remarks: '',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]['Employee Code']).toBe('E001');
    expect(rows[0]['Field']).toBe('1st half status');
    expect(rows[0]['New Value']).toBe('present');
  });
});

describe('Pay Register — Multi-shift selection (full / half)', () => {
  const shiftMap = new Map([
    [String(shiftA), { name: 'Morning', payableShifts: 1 }],
    [String(shiftB), { name: 'Evening', payableShifts: 2 }],
    [String(shiftC), { name: 'Night', payableShifts: 1 }],
  ]);

  test('normalizeShiftIds caps at 3 and dedupes', () => {
    const ids = normalizeShiftIds([shiftA, shiftA, shiftB, shiftC, shiftD]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids.map(String)).size).toBe(3);
  });

  test('normalizeShiftSelections preserves isHalf', () => {
    const sel = normalizeShiftSelections([
      { shiftId: shiftA, isHalf: false },
      { shiftId: shiftB, isHalf: true },
    ]);
    expect(sel).toHaveLength(2);
    expect(sel[1].isHalf).toBe(true);
  });

  test('TC-MS-01: one shift full → base payable', () => {
    const units = payableUnitsForSelection({ shiftId: shiftA, isHalf: false }, shiftMap.get(String(shiftA)));
    expect(units).toBe(1);
  });

  test('TC-MS-02: one shift half → half of base', () => {
    const units = payableUnitsForSelection({ shiftId: shiftB, isHalf: true }, shiftMap.get(String(shiftB)));
    expect(units).toBe(1);
  });

  test('TC-MS-03: Morning full (1) + Evening half (2 base → 1) = 2.0 day payable', () => {
    const selections = [
      { shiftId: shiftA, isHalf: false, payableUnits: null },
      { shiftId: shiftB, isHalf: true, payableUnits: null },
    ];
    const { payableShifts, shiftNames } = computePayableFromSelections(selections, shiftMap);
    expect(payableShifts).toBe(2);
    expect(shiftNames).toContain('Morning');
    expect(shiftNames.some((n) => n.includes('½'))).toBe(true);
  });

  test('TC-MS-04: two shifts both full → sum of bases', () => {
    const selections = [
      { shiftId: shiftA, isHalf: false },
      { shiftId: shiftB, isHalf: false },
    ];
    const { payableShifts } = computePayableFromSelections(selections, shiftMap);
    expect(payableShifts).toBe(3);
  });

  test('TC-MS-05: explicit payableUnits from attendance overrides isHalf', () => {
    const units = payableUnitsForSelection(
      { shiftId: shiftB, isHalf: false, payableUnits: 1.5 },
      shiftMap.get(String(shiftB))
    );
    expect(units).toBe(1.5);
  });

  test('TC-MS-06: extractMultiShiftFromAttendance — full + half segments', () => {
    const attendance = {
      payableShifts: 2,
      shifts: [
        {
          shiftId: { _id: shiftA, name: 'Morning', payableShifts: 1 },
          shiftName: 'Morning',
          status: 'PRESENT',
          payableShift: 1,
        },
        {
          shiftId: { _id: shiftB, name: 'Evening', payableShifts: 2 },
          shiftName: 'Evening',
          status: 'HALF_DAY',
          payableShift: 1,
        },
      ],
    };
    const result = extractMultiShiftFromAttendance(attendance);
    expect(result).not.toBeNull();
    expect(result.shiftSelections).toHaveLength(2);
    expect(result.payableShifts).toBe(2);
    expect(result.shiftName).toMatch(/Morning/);
    expect(result.shiftName).toMatch(/½/);
  });

  test('TC-MS-07: no attendance shifts → null', () => {
    expect(extractMultiShiftFromAttendance(null)).toBeNull();
    expect(extractMultiShiftFromAttendance({ shifts: [] })).toBeNull();
  });

  test('MAX_SHIFTS_PER_DAY is 3', () => {
    expect(MAX_SHIFTS_PER_DAY).toBe(3);
  });
});

describe('Pay Register — Monthly totals (payableShifts per day)', () => {
  const dayPresent = (date, payableShifts) => ({
    date,
    firstHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
    secondHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
    status: 'present',
    isSplit: false,
    payableShifts,
  });

  test('TC-TOT-01: full day present with payableShifts=2 → monthly totalPayableShifts=2', () => {
    const totals = calculateTotals([dayPresent('2026-04-01', 2)]);
    expect(totals.totalPresentDays).toBe(1);
    expect(totals.totalPayableShifts).toBe(2);
  });

  test('TC-TOT-02: full day present with payableShifts=3 (multi full+half) → 3', () => {
    const totals = calculateTotals([dayPresent('2026-04-02', 3)]);
    expect(totals.totalPayableShifts).toBe(3);
  });

  test('TC-TOT-03: one half present only → half of day payableShifts', () => {
    const totals = calculateTotals([
      {
        date: '2026-04-03',
        firstHalf: { status: 'present', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
        secondHalf: { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
        status: null,
        isSplit: true,
        payableShifts: 2,
      },
    ]);
    expect(totals.totalPresentDays).toBe(0.5);
    expect(totals.totalPayableShifts).toBe(1);
  });

  test('TC-TOT-04: absent day does not add payable shifts', () => {
    const totals = calculateTotals([
      {
        date: '2026-04-04',
        firstHalf: { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
        secondHalf: { status: 'absent', leaveType: null, leaveNature: null, isOD: false, otHours: 0 },
        status: 'absent',
        isSplit: false,
        payableShifts: 2,
      },
    ]);
    expect(totals.totalPayableShifts).toBe(0);
  });
});

describe('Pay Register — employee filter (multi division/department)', () => {
  const { parseQueryIdList } = require('../payRegisterEmployeeFilter');
  const idA = '507f1f77bcf86cd799439011';
  const idB = '507f1f77bcf86cd799439012';

  test('parseQueryIdList handles single id', () => {
    const out = parseQueryIdList(idA);
    expect(out).toHaveLength(1);
    expect(String(out[0])).toBe(idA);
  });

  test('parseQueryIdList handles comma-separated ids', () => {
    const out = parseQueryIdList(`${idA},${idB}`);
    expect(out).toHaveLength(2);
    expect(out.map(String)).toEqual([idA, idB]);
  });

  test('parseQueryIdList dedupes repeated array values', () => {
    const out = parseQueryIdList([idA, idA, idB]);
    expect(out).toHaveLength(2);
  });

  test('parseQueryIdList ignores invalid and empty values', () => {
    expect(parseQueryIdList('')).toEqual([]);
    expect(parseQueryIdList('all')).toEqual([]);
    expect(parseQueryIdList('not-an-id')).toEqual([]);
  });
});

describe('Pay Register — API routes registered', () => {
  test('modifications export routes are declared in pay-register index', () => {
    const fs = require('fs');
    const path = require('path');
    const indexSrc = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
    expect(indexSrc).toContain("'/export-modifications/:month'");
    expect(indexSrc).toContain("'/export-modifications-pdf/:month'");
    expect(indexSrc).toContain("'/export-modifications/:month', payRegisterController.exportModificationsExcel");
    expect(indexSrc).toContain("'/export-modifications-pdf/:month', payRegisterController.exportModificationsPDF");
    expect(indexSrc).toContain('/:employeeId/:month/history');
  });

  test('controller exports modification export handlers', () => {
    const ctrl = require('../../controllers/payRegisterController');
    expect(typeof ctrl.exportModificationsExcel).toBe('function');
    expect(typeof ctrl.exportModificationsPDF).toBe('function');
    expect(typeof ctrl.getEditHistory).toBe('function');
  });
});
