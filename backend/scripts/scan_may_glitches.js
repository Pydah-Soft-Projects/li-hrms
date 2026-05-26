require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const Employee = require('../employees/model/Employee');
const { createISTDate, extractISTComponents } = require('../shared/utils/dateUtils');
const dateCycleService = require('../leaves/services/dateCycleService');

function cdOverlap(cd) {
  const partialArr = cd?.partial || [];
  const presentArr = cd?.present || [];
  if (!partialArr.length || !presentArr.length) return { total: 0, dates: [] };
  const presentByDate = new Map();
  for (const e of presentArr) {
    if (!e?.date) continue;
    const v = Number(e.value);
    if (Number.isFinite(v) && v > 0) presentByDate.set(String(e.date), (presentByDate.get(String(e.date)) || 0) + v);
  }
  const dates = [];
  let total = 0;
  for (const e of partialArr) {
    if (!e?.date) continue;
    const d = String(e.date);
    const pv = presentByDate.get(d);
    const partV = Number(e.value);
    if (pv > 0 && partV > 0) {
      const o = Math.min(pv, partV);
      total += o;
      dates.push({ date: d, present: pv, partial: partV, overlap: o });
    }
  }
  return { total: Math.round(total * 100) / 100, dates };
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const anchor = createISTDate('2026-05-15', '12:00');
  const { payrollCycle } = await dateCycleService.getPeriodInfo(anchor);
  const monthKey = `${payrollCycle.year}-${String(payrollCycle.month).padStart(2, '0')}`;

  const summaries = await MonthlyAttendanceSummary.find({ month: monthKey }).lean();
  const empIds = summaries.map((s) => s.employeeId).filter(Boolean);
  const emps = await Employee.find({ _id: { $in: empIds } })
    .select('emp_no employee_name')
    .lean();
  const empMap = new Map(emps.map((e) => [String(e._id), e]));

  const issues = {
    lopExactly1_twoHalfDays: [],
    lopExactly1_oneDayPolicy: [],
    presentPartialDoubleCount: [],
    missingOverlapField: [],
    highPartialPayableWithOd: [],
  };

  for (const s of summaries) {
    const emp = empMap.get(String(s.employeeId));
    const empNo = emp?.emp_no || '?';
    const cd = s.contributingDates || {};
    const overlap = cdOverlap(cd);
    const storedOverlap = Number(s.totalPartialPresentPayableOverlap);
    const pres = Number(s.totalPresentDays) || 0;
    const part = Number(s.totalPartialDays) || 0;
    const lop = Number(s.totalLopLeaves) || 0;

    if (lop >= 0.99 && lop <= 1.01) {
      const lopDays = (cd.lopLeaves || []).length;
      const partialDays = (cd.partial || []).length;
      if (lopDays === 2 && partialDays >= 2) {
        issues.lopExactly1_twoHalfDays.push({ empNo, name: emp?.employee_name, lopDays, partialDays });
      } else if (lopDays === 1) {
        const v = Number(cd.lopLeaves[0]?.value);
        issues.lopExactly1_oneDayPolicy.push({
          empNo,
          name: emp?.employee_name,
          date: cd.lopLeaves[0]?.date,
          value: v,
        });
      }
    }

    if (overlap.total > 0) {
      const missingStored =
        !Object.prototype.hasOwnProperty.call(s, 'totalPartialPresentPayableOverlap') ||
        !Number.isFinite(storedOverlap) ||
        storedOverlap < overlap.total - 0.01;
      if (missingStored) {
        issues.missingOverlapField.push({
          empNo,
          name: emp?.employee_name,
          cdOverlap: overlap.total,
          storedOverlap: Number.isFinite(storedOverlap) ? storedOverlap : 'missing',
          present: pres,
          partial: part,
          mergedWouldBe: pres + part - overlap.total,
          dates: overlap.dates,
        });
      }
      const mergedIfNoOverlap = pres + part;
      if (part > 0 && overlap.total > 0) {
        issues.presentPartialDoubleCount.push({
          empNo,
          name: emp?.employee_name,
          rawPresent: pres,
          partial: part,
          overlapShouldSubtract: overlap.total,
          payRegisterPresentIfBug: mergedIfNoOverlap,
          dates: overlap.dates,
        });
      }
    }

    for (const p of cd.partial || []) {
      if (Number(p.value) >= 0.99) {
        issues.highPartialPayableWithOd.push({
          empNo,
          date: p.date,
          partialValue: p.value,
          presentSameDay: (cd.present || []).find((x) => x.date === p.date)?.value,
        });
      }
    }
  }

  console.log('Month:', monthKey, '| summaries:', summaries.length);
  console.log('\n=== LOP total = 1 from TWO partial half-days (0.5+0.5) — correct policy ===');
  console.log('count:', issues.lopExactly1_twoHalfDays.length);
  issues.lopExactly1_twoHalfDays.slice(0, 30).forEach((r) => console.log(' ', r.empNo, r.name));

  console.log('\n=== LOP = 1 on a SINGLE day (policy bug) ===');
  console.log('count:', issues.lopExactly1_oneDayPolicy.length);
  issues.lopExactly1_oneDayPolicy.forEach((r) => console.log(' ', r.empNo, r.date, 'lopValue=', r.value, r.name));

  console.log('\n=== Same-day present + partial overlap NOT stored on summary (pay register double-count risk) ===');
  console.log('count:', issues.missingOverlapField.length);
  issues.missingOverlapField.forEach((r) => {
    console.log(
      `  ${r.empNo} present=${r.present} partial=${r.partial} cdOverlap=${r.cdOverlap} stored=${r.storedOverlap}`,
      r.dates
    );
  });

  console.log('\n=== Partial bucket value = 1.0 (often partial+OD day) ===');
  const byEmp = {};
  for (const r of issues.highPartialPayableWithOd) {
    byEmp[r.empNo] = byEmp[r.empNo] || [];
    byEmp[r.empNo].push(r);
  }
  console.log('employees:', Object.keys(byEmp).length);
  for (const [empNo, rows] of Object.entries(byEmp).sort()) {
    console.log(' ', empNo, rows.map((x) => `${x.date}(P${x.presentSameDay},PT${x.partialValue})`).join(', '));
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
