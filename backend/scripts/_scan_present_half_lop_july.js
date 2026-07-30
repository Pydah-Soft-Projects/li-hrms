/**
 * Find attendance days where day status looks Present/Partial but
 * presentPortion and lopPortion are both ~0.5 (or both 5).
 *
 * Scans July pay period (26 Jun–25 Jul) AND calendar July 2026,
 * plus Aug pay window start (26 Jul–25 Aug) for Jul 26–31.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isMatch(d) {
  const partial = d.policyMeta?.partialDayRule || {};
  const present = Number(partial.presentPortion);
  const lop = Number(partial.lopPortion);
  const status = String(d.status || '').toUpperCase();

  const bothHalf =
    Number.isFinite(present) &&
    Number.isFinite(lop) &&
    Math.abs(present - 0.5) < 1e-6 &&
    Math.abs(lop - 0.5) < 1e-6;

  const bothFive =
    Number.isFinite(present) &&
    Number.isFinite(lop) &&
    present === 5 &&
    lop === 5;

  const presentLike =
    status === 'PRESENT' ||
    status === 'PARTIAL' ||
    status === 'HALF_DAY' ||
    status === 'OD';

  // Case A: Present status with 0.5 credit + 0.5 LOP (the reported bug shape)
  if (status === 'PRESENT' && (bothHalf || bothFive)) return 'PRESENT_with_0.5_credit_and_0.5_lop';

  // Case B: Partial rule applied with 0.5 + 0.5 (expected for true half+LOP, still list)
  if (partial.applied && bothHalf) return 'PARTIAL_applied_0.5_plus_0.5_lop';

  // Case C: Present status but lopPortion > 0
  if (status === 'PRESENT' && Number.isFinite(lop) && lop > 0) return 'PRESENT_with_positive_lop';

  // Case D: Present status but presentPortion is 0.5 (not full day) while payable looks full/partial
  if (status === 'PRESENT' && Number.isFinite(present) && present > 0 && present < 1) {
    return 'PRESENT_with_partial_presentPortion';
  }

  return null;
}

(async () => {
  await mongoose.connect((process.env.MONGODB_URI || '').trim());

  const ranges = [
    { label: 'july_pay_period_jun26_jul25', from: '2026-06-26', to: '2026-07-25' },
    { label: 'calendar_july_01_31', from: '2026-07-01', to: '2026-07-31' },
    { label: 'aug_pay_window_jul26_aug25', from: '2026-07-26', to: '2026-08-25' },
  ];

  const allHits = [];

  for (const range of ranges) {
    const rows = await AttendanceDaily.find({
      date: { $gte: range.from, $lte: range.to },
      'policyMeta.partialDayRule': { $exists: true },
    })
      .select(
        'employeeNumber date status payableShifts totalWorkingHours policyMeta.partialDayRule policyMeta.sandwichRule shifts.status shifts.payableShift shifts.workingHours shifts.inTime shifts.outTime'
      )
      .lean();

    const hits = [];
    for (const d of rows) {
      const reason = isMatch(d);
      if (!reason) continue;
      const p = d.policyMeta?.partialDayRule || {};
      hits.push({
        range: range.label,
        employeeNumber: d.employeeNumber,
        date: d.date,
        status: d.status,
        reason,
        presentPortion: p.presentPortion,
        lopPortion: p.lopPortion,
        coveredPortion: p.coveredPortion,
        ruleCode: p.ruleCode,
        firstHalfStatus: p.firstHalfStatus,
        secondHalfStatus: p.secondHalfStatus,
        note: p.note,
        payableShifts: d.payableShifts,
        totalWorkingHours: d.totalWorkingHours,
        shifts: (d.shifts || []).map((s) => ({
          status: s.status,
          payable: s.payableShift,
          wh: s.workingHours,
          in: s.inTime,
          out: s.outTime,
        })),
      });
    }

    console.log(`\n=== ${range.label} rows=${rows.length} hits=${hits.length} ===`);
    // breakdown
    const byReason = {};
    for (const h of hits) {
      byReason[h.reason] = (byReason[h.reason] || 0) + 1;
    }
    console.log('byReason', byReason);
    allHits.push(...hits);
  }

  // Deduplicate by emp+date
  const uniq = new Map();
  for (const h of allHits) {
    const k = `${h.employeeNumber}|${h.date}`;
    if (!uniq.has(k)) uniq.set(k, h);
  }
  const list = [...uniq.values()].sort((a, b) =>
    a.date === b.date ? String(a.employeeNumber).localeCompare(String(b.employeeNumber)) : a.date.localeCompare(b.date)
  );

  // Focus 2181
  const emp2181 = list.filter((h) => String(h.employeeNumber) === '2181');
  console.log('\n=== EMP 2181 HITS ===');
  console.log(JSON.stringify(emp2181, null, 2));

  // Present-with-lop specifically
  const presentBugs = list.filter((h) => h.reason.startsWith('PRESENT_'));
  console.log('\n=== PRESENT_* BUG SHAPE COUNT ===', presentBugs.length);
  console.log(JSON.stringify(presentBugs, null, 2));

  // All 0.5+0.5 (including PARTIAL expected)
  const halfHalf = list.filter(
    (h) =>
      Math.abs(Number(h.presentPortion) - 0.5) < 1e-6 && Math.abs(Number(h.lopPortion) - 0.5) < 1e-6
  );
  console.log('\n=== ALL 0.5 credit + 0.5 LOP COUNT ===', halfHalf.length);

  // Attach names for halfHalf
  const empNos = [...new Set(halfHalf.map((h) => h.employeeNumber))];
  const emps = await Employee.find({ emp_no: { $in: empNos } })
    .select('emp_no employee_name')
    .lean();
  const nameBy = Object.fromEntries(emps.map((e) => [e.emp_no, e.employee_name]));

  const named = halfHalf.map((h) => ({
    ...h,
    employee_name: nameBy[h.employeeNumber] || null,
  }));

  // Write compact CSV-like summary
  console.log('\n=== HALF+HALF LIST ===');
  for (const h of named) {
    console.log(
      [
        h.date,
        h.employeeNumber,
        JSON.stringify(h.employee_name || ''),
        h.status,
        h.reason,
        h.presentPortion,
        h.lopPortion,
        h.payableShifts,
        h.firstHalfStatus,
        h.secondHalfStatus,
      ].join('\t')
    );
  }

  // Also specifically check 2181 on 2026-07-27 again with compute path note
  const focus = await AttendanceDaily.findOne({ employeeNumber: '2181', date: '2026-07-27' }).lean();
  console.log('\n=== FOCUS 2181 2026-07-27 ===');
  console.log(
    JSON.stringify(
      {
        status: focus?.status,
        payableShifts: focus?.payableShifts,
        partial: focus?.policyMeta?.partialDayRule,
        shifts: focus?.shifts,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
