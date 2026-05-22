/**
 * Mirror frontend payPeriodRange + istDate (no TS compile needed).
 * Usage: node scripts/test_frontend_payroll_period_logic.mjs
 */

const IST_TIMEZONE = 'Asia/Kolkata';

function extractISTComponents(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(String(dateInput));
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  if (!year || !month || !day) return null;
  return { year, month, day, dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

function normalizeToISTYmd(value) {
  const raw = String(value ?? '').trim();
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const ist = extractISTComponents(raw);
  return ist?.dateStr ?? null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function lastDayOfMonth(year, month1Based) {
  return new Date(year, month1Based, 0).getDate();
}

function getPayrollPeriodForDate(dateInput, payrollCycleStartDay, payrollCycleEndDay) {
  const ymd = normalizeToISTYmd(dateInput);
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  const day = Number(m[3]);
  const startDay = payrollCycleStartDay >= 1 && payrollCycleStartDay <= 31 ? payrollCycleStartDay : 1;
  const rawEnd = payrollCycleEndDay;
  const endDay =
    rawEnd != null && !Number.isNaN(Number(rawEnd)) && Number(rawEnd) >= 1 && Number(rawEnd) <= 31
      ? Number(rawEnd)
      : startDay > 1
        ? startDay - 1
        : 31;

  if (startDay <= 1 && endDay >= 28) {
    const actualEnd = Math.min(endDay, lastDayOfMonth(year, month1));
    return { from: `${year}-${pad2(month1)}-01`, to: `${year}-${pad2(month1)}-${pad2(actualEnd)}`, month: month1, year };
  }
  if (day >= startDay) {
    let nextMonth = month1 + 1;
    let nextYear = year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const endActual = Math.min(endDay, lastDayOfMonth(nextYear, nextMonth));
    return {
      from: `${year}-${pad2(month1)}-${pad2(startDay)}`,
      to: `${nextYear}-${pad2(nextMonth)}-${pad2(endActual)}`,
      month: nextMonth,
      year: nextYear,
    };
  }
  let prevMonth = month1 - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const endActual = Math.min(endDay, lastDayOfMonth(year, month1));
  return {
    from: `${prevYear}-${pad2(prevMonth)}-${pad2(startDay)}`,
    to: `${year}-${pad2(month1)}-${pad2(endActual)}`,
    month: month1,
    year,
  };
}

function leaveDatesInSinglePayrollPeriod(fromYmd, toYmd, startDay, endDay) {
  const to = toYmd?.trim() || fromYmd;
  const fromPeriod = getPayrollPeriodForDate(fromYmd, startDay, endDay);
  const toPeriod = getPayrollPeriodForDate(to, startDay, endDay);
  if (!fromPeriod || !toPeriod) return { ok: true };
  if (fromPeriod.from === toPeriod.from && fromPeriod.to === toPeriod.to) return { ok: true, period: fromPeriod };
  return { ok: false, fromPeriod, toPeriod };
}

const startDay = 26;
const endDay = 25;

let passed = 0;
let failed = 0;

const p25 = getPayrollPeriodForDate('2026-04-25', startDay, endDay);
const p26 = getPayrollPeriodForDate('2026-04-26', startDay, endDay);
console.log('Frontend logic (26–25):');
console.log('  2026-04-25 →', p25?.from, '→', p25?.to);
console.log('  2026-04-26 →', p26?.from, '→', p26?.to);

if (p25?.from !== p26?.from) {
  passed++;
  console.log('PASS different periods for 25 vs 26 Apr');
} else {
  failed++;
  console.log('FAIL periods should differ');
}

const cross = leaveDatesInSinglePayrollPeriod('2026-04-25', '2026-04-26', startDay, endDay);
if (!cross.ok) {
  passed++;
  console.log('PASS blocks 25–26 Apr range');
} else {
  failed++;
  console.log('FAIL should block cross-period range');
}

const same = leaveDatesInSinglePayrollPeriod('2026-04-26', '2026-04-30', startDay, endDay);
if (same.ok) {
  passed++;
  console.log('PASS allows 26–30 Apr in one period');
} else {
  failed++;
  console.log('FAIL should allow same-period range');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
