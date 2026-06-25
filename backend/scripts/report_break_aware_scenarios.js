/**
 * Report: break-aware half-segment outcomes for 9-21 shift (13:00-13:30 meal break)
 * Run: node scripts/report_break_aware_scenarios.js
 */
const { getShiftSegmentAssignment } = require('../shifts/services/shiftHalfSegmentService');
const { createISTDate } = require('../shared/utils/dateUtils');

const DATE = '2026-06-15';
const GRACE = { globalLateInGrace: 15, globalEarlyOutGrace: 15 };

const shift = {
  name: 'Pydahsoft 9-21',
  startTime: '09:00',
  endTime: '21:00',
  gracePeriod: 15,
  payableShifts: 1,
  firstHalf: {
    startTime: '09:00',
    endTime: '13:00',
    duration: 4,
    minDuration: 4,
    gracePeriod: 15,
    payableShifts: 0.5,
  },
  break: { startTime: '13:00', endTime: '13:30', duration: 0.5 },
  secondHalf: {
    startTime: '13:30',
    endTime: '21:00',
    duration: 7.5,
    minDuration: 4,
    gracePeriod: 15,
    payableShifts: 0.5,
  },
};

function evaluate(inTimeStr, outTimeStr) {
  const inTime = createISTDate(DATE, inTimeStr);
  const outTime = createISTDate(DATE, outTimeStr);
  const r = getShiftSegmentAssignment(shift, DATE, inTime, outTime, GRACE);
  const first = r.shiftSegments.find((s) => s.segmentName === 'firstHalf');
  const second = r.shiftSegments.find((s) => s.segmentName === 'secondHalf');
  const mins = Math.round((outTime - inTime) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return {
    punch: `${inTimeStr} → ${outTimeStr}`,
    span: `${h}h ${m}m`,
    firstHalf: first?.present ? 'YES' : 'NO',
    secondHalf: second?.present ? 'YES' : 'NO',
    payable: r.totalPayableShifts,
    status:
      r.totalPayableShifts >= 1 ? 'PRESENT' : r.totalPayableShifts === 0.5 ? 'HALF_DAY' : 'ABSENT',
    firstOverlap: first?.overlapMinutes ?? 0,
    secondOverlap: second?.overlapMinutes ?? 0,
  };
}

const scenarios = [
  // --- Full day / continuous ---
  { cat: 'Full day continuous (no lunch punches)', in: '09:00', out: '21:00',
    want: 'PRESENT 1.0 — both halves meet raw 4h min in their windows' },
  { cat: 'Full day continuous', in: '09:05', out: '20:55',
    want: 'PRESENT 1.0 — slight early/late still covers both halves' },

  // --- Morning only (ends at or before break) ---
  { cat: 'Morning exact 4h', in: '09:00', out: '13:00',
    want: 'HALF_DAY 0.5 — first half raw 4h exactly' },
  { cat: 'Morning with break skip', in: '09:18', out: '13:41',
    want: 'HALF_DAY 0.5 — first half: raw 3h42m + 30m break credit' },
  { cat: 'Morning into break window', in: '09:00', out: '13:15',
    want: 'HALF_DAY 0.5 — first half raw 4h; OUT in break does not count for 2nd' },
  { cat: 'Morning into break window', in: '09:00', out: '13:29',
    want: 'HALF_DAY 0.5 — still before 2nd half starts' },
  { cat: 'Morning just into 2nd half', in: '09:00', out: '13:35',
    want: 'HALF_DAY 0.5 — first half raw 4h; only 5m in 2nd half' },
  { cat: 'Short morning', in: '09:00', out: '11:30',
    want: 'ABSENT 0 — 2.5h < 4h min, no break span' },
  { cat: 'Short morning late', in: '10:00', out: '12:00',
    want: 'ABSENT 0 — 2h only' },
  { cat: 'Morning almost enough', in: '09:00', out: '12:50',
    want: 'ABSENT 0 — 3h50m < 4h, OUT before break' },

  // --- Afternoon only ---
  { cat: 'Afternoon full', in: '13:30', out: '21:00',
    want: 'HALF_DAY 0.5 — second half raw 7.5h' },
  { cat: 'Afternoon late start', in: '14:00', out: '21:00',
    want: 'HALF_DAY 0.5 — 7h in 2nd half window ≥ 4h' },
  { cat: 'Afternoon minimum-ish', in: '14:00', out: '18:00',
    want: 'HALF_DAY 0.5 — exactly 4h in 2nd half' },
  { cat: 'Afternoon short', in: '14:00', out: '17:00',
    want: 'ABSENT 0 — 3h < 4h min' },
  { cat: 'Afternoon from break end', in: '13:00', out: '21:00',
    want: 'HALF_DAY 0.5? — IN at break start; 2nd half from 13:30 = 7.5h raw' },

  // --- Work through break (skip lunch) edge cases ---
  { cat: 'Break skip barely first half', in: '09:31', out: '14:00',
    want: 'HALF_DAY 0.5 — first: 3h29m raw + 30m break + 30m overflow = 4h29m' },
  { cat: 'Break skip not enough', in: '10:30', out: '14:00',
    want: 'ABSENT or HALF? — first ~2h30m + 30m break + 30m overflow = 3h30m < 4h' },
  { cat: 'Break skip long into afternoon', in: '09:00', out: '15:00',
    want: 'PRESENT 1.0? — first raw 4h + second raw 1.5h; both may qualify' },
  { cat: 'Break skip dominant fallback', in: '10:30', out: '15:00',
    want: 'HALF or ABSENT — first ~2.5h+30m=3h; second ~1.5h; neither raw 4h' },

  // --- Boundary punches ---
  { cat: 'Boundary', in: '09:00', out: '13:30',
    want: 'HALF_DAY 0.5 — first 4h; second 0m at exact start' },
  { cat: 'Boundary', in: '13:00', out: '13:30',
    want: 'ABSENT 0 — only break window, no half overlap' },
  { cat: 'Boundary', in: '13:30', out: '17:30',
    want: 'HALF_DAY 0.5 — second exactly 4h' },
  { cat: 'Boundary', in: '13:29', out: '17:29',
    want: 'ABSENT? — IN before 2nd half; mostly break overlap' },

  // --- Late in full day ---
  { cat: 'Late in full day', in: '10:00', out: '21:00',
    want: 'PRESENT 1.0? — first 3h + second 7.5h; first may fail 4h min' },
  { cat: 'Late in full day', in: '11:00', out: '21:00',
    want: 'HALF_DAY 0.5? — first 2h fails; second 7.5h passes' },
  { cat: 'Early out full day', in: '09:00', out: '18:00',
    want: 'HALF_DAY 0.5? — first 4h; second 4.5h' },

  // --- Very long / OT ---
  { cat: 'OT day', in: '08:00', out: '22:00',
    want: 'PRESENT 1.0 — extra before/after shift; both halves covered' },
  { cat: 'Early arrival', in: '08:30', out: '21:00',
    want: 'PRESENT 1.0 — pre-shift time ignored for segment; 9-21 windows count' },
];

console.log('='.repeat(100));
console.log('BREAK-AWARE SEGMENT REPORT — Shift 09:00-21:00 | 1st: 09-13 | Break: 13-13:30 | 2nd: 13:30-21');
console.log('minDuration per half: 4h | payable per half: 0.5');
console.log('='.repeat(100));
console.log('');

let lastCat = '';
for (const s of scenarios) {
  const actual = evaluate(s.in, s.out);
  if (s.cat !== lastCat) {
    console.log(`\n## ${s.cat}`);
    console.log('-'.repeat(100));
    lastCat = s.cat;
  }
  const match =
    actual.status === s.want.split('—')[0].trim().split(' ')[0] ||
    s.want.includes(actual.status);
  const flag = match ? '  ' : '⚠ ';
  console.log(`${flag}Punch: ${actual.punch} (${actual.span})`);
  console.log(`   Actual:  1st=${actual.firstHalf} (${actual.firstOverlap}m) | 2nd=${actual.secondHalf} (${actual.secondOverlap}m) | payable=${actual.payable} → ${actual.status}`);
  console.log(`   Want:    ${s.want}`);
  console.log('');
}

// Two-pair scenarios (multi-shift) — evaluated as separate IN/OUT pairs
console.log('\n## Two punch pairs (multi-shift — each pair evaluated separately)');
console.log('-'.repeat(100));

const pairs = [
  {
    label: 'Proper lunch: 9-13 + 13:30-21',
    sessions: [['09:00', '13:00'], ['13:30', '21:00']],
    want: 'PRESENT 1.0 — pair1 first half 0.5 + pair2 second half 0.5',
  },
  {
    label: 'Short morning + full afternoon',
    sessions: [['09:00', '11:00'], ['13:30', '21:00']],
    want: 'HALF_DAY 0.5 — pair1 absent + pair2 second half 0.5',
  },
  {
    label: 'Full morning + short afternoon',
    sessions: [['09:00', '13:00'], ['13:30', '17:00']],
    want: 'HALF_DAY 0.5 — pair1 first 0.5 + pair2 absent (3.5h < 4h)',
  },
  {
    label: 'Both halves proper',
    sessions: [['09:00', '13:00'], ['13:30', '18:00']],
    want: 'PRESENT 1.0? — pair1 first 0.5 + pair2 second 4h+',
  },
  {
    label: 'Both short',
    sessions: [['09:00', '11:00'], ['14:00', '16:00']],
    want: 'ABSENT 0 — both pairs too short',
  },
  {
    label: 'Skip lunch style as 2 pairs: 9-13:41 only (single pair)',
    sessions: [['09:18', '13:41']],
    want: 'HALF_DAY 0.5 — break skip on first half',
  },
  {
    label: 'Triple punch noise: 9-10 OUT mistake + 10-13 + 13:30-21',
    sessions: [['09:00', '10:00'], ['10:05', '13:00'], ['13:30', '21:00']],
    want: 'Depends on multi-shift pairing — report each pair',
  },
];

for (const p of pairs) {
  console.log(`\n${p.label}`);
  let totalPayable = 0;
  const parts = [];
  for (const [i, o] of p.sessions) {
    const a = evaluate(i, o);
    totalPayable += a.payable;
    parts.push(`${i}-${o} → ${a.status} (${a.payable})`);
  }
  const daily =
    totalPayable >= 1 ? 'PRESENT' : totalPayable >= 0.5 ? 'HALF_DAY' : 'ABSENT';
  console.log(`   Sessions: ${parts.join(' | ')}`);
  console.log(`   Daily total payable: ${totalPayable} → ${daily}`);
  console.log(`   Want: ${p.want}`);
}

console.log('\n' + '='.repeat(100));
console.log('Done. Review rows marked ⚠ for mismatches between actual and stated want.');
console.log('='.repeat(100));
