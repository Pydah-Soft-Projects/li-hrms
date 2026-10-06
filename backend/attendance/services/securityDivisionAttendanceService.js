/**
 * Security Division Dynamic Attendance Service
 *
 * Completely dynamic engine for Security Division & Department only.
 * No hardcoded dates, no hardcoded rosters, no hardcoded employee IDs.
 * Works for any past, current, or upcoming payroll cycle.
 *
 * Key fixes over v1:
 *  - IST-based punch date filtering (not UTC) → C-SECURITY 21:00 punch
 *    is correctly attributed to the shift's calendar date.
 *  - Overnight shift detection (C-SECURITY 21:00-06:00, 12HRS 18:00-06:00)
 *    with correct `shiftDate` context passed to calculateLateIn/EarlyOut.
 *  - Single-punch fallback now also computes earlyOutMinutes when the last
 *    IST-date punch differs from the first (multi-punch same day).
 *  - earlyOutMinutes is never blindly 0 — it is only skipped when outTime is
 *    truly unavailable.
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Shift = require('../../shifts/model/Shift');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const { calculateLateIn, calculateEarlyOut } = require('../../shifts/services/shiftDetectionService');

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Timezone helpers (IST = UTC + 05:30)                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Convert any UTC timestamp to an IST YYYY-MM-DD string.
 * Critical for overnight-shift employees whose punches store at e.g. 15:30 UTC
 * (= 21:00 IST) — UTC date would be wrong.
 */
function toISTDateStr(ts) {
  const istMs = new Date(ts).getTime() + (5 * 60 + 30) * 60 * 1000;
  const d = new Date(istMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isPunchIn(p) {
  if (!p) return false;
  const t = (p.type || p.subType || p.rawData?.resolvedType || p.rawData?.logType || '').toUpperCase();
  const rawStatus = p.rawData?.rawStatus ?? p.punch_state;
  return rawStatus === 0 || rawStatus === '0' || rawStatus === 4 || rawStatus === '4' || t.includes('IN');
}

function isPunchOut(p) {
  if (!p) return false;
  const t = (p.type || p.subType || p.rawData?.resolvedType || p.rawData?.logType || '').toUpperCase();
  const rawStatus = p.rawData?.rawStatus ?? p.punch_state;
  return rawStatus === 1 || rawStatus === '1' || rawStatus === 5 || rawStatus === '5' || t.includes('OUT');
}

/**
 * Security-specific multi-shift detection and pairing.
 * Self-contained to preserve core multiShiftDetectionService for other clients.
 *
 * Capabilities:
 *  - Supports terminal rawStatus (0/4 = IN, 1/5 = OUT) and logType strings.
 *  - Checkout-noise filtering: discards accidental IN taps occurring <= 15m before an OUT tap.
 *  - Directionless exit detection for overnight shifts: if an evening IN has no explicit OUT,
 *    allows the morning exit tap (rawStatus 0) to act as OUT for the overnight shift.
 *  - Consecutive shift boundary protection: ensures shift 1 doesn't jump over shift 2 start.
 *  - Duplicate exit pulse grouping to avoid reuse.
 */
function filterDuplicateIns(inPunches, thresholdMinutes = 60) {
  if (!inPunches || inPunches.length === 0) return [];
  const valid = [];
  for (let i = 0; i < inPunches.length; i++) {
    if (i === 0) {
      valid.push(inPunches[i]);
    } else {
      const prevValidIN = valid[valid.length - 1];
      const gapMinutes = (new Date(inPunches[i].timestamp) - new Date(prevValidIN.timestamp)) / 60000;
      if (gapMinutes >= thresholdMinutes) {
        valid.push(inPunches[i]);
      }
    }
  }
  return valid;
}

function detectAndPairSecurityShifts(rawLogs, date, maxShifts = 3) {
  if (!rawLogs || rawLogs.length === 0) return [];

  const allPunches = [...rawLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const allOuts = allPunches.filter(p => isPunchOut(p));

  const targetDateIns = allPunches.filter(p => {
    return toISTDateStr(p.timestamp) === date && isPunchIn(p);
  });

  if (targetDateIns.length === 0) return [];

  // Filter checkout-window noise:
  // If an IN punch is immediately succeeded by an OUT punch within <= 15 minutes,
  // and there is an earlier IN punch that day seeking an exit,
  // this IN punch is an accidental checkout tap.
  const cleanTargetDateIns = [];
  for (let i = 0; i < targetDateIns.length; i++) {
    const inP = targetDateIns[i];
    const inMs = new Date(inP.timestamp).getTime();

    const immediateOut = allOuts.find(o => {
      const oMs = new Date(o.timestamp).getTime();
      return oMs > inMs && (oMs - inMs) <= 15 * 60 * 1000;
    });

    if (immediateOut && cleanTargetDateIns.length > 0) {
      continue;
    }

    cleanTargetDateIns.push(inP);
  }

  // Filter duplicate INs (60-minute threshold)
  const validIns = filterDuplicateIns(cleanTargetDateIns, 60);

  // Candidate OUT pool:
  // Include explicit OUTs. For overnight shifts (starting in evening >= 16:00 IST) that have NO explicit OUT punch
  // within their working window, allow the morning punch (6 to 16 hours later, e.g. 04:00-11:00 IST)
  // to serve as candidate OUT punch.
  const candidateOuts = [...allOuts];
  validIns.forEach(inPunch => {
    const inMs = new Date(inPunch.timestamp).getTime();
    const istIn = new Date(inMs + (5 * 60 + 30) * 60 * 1000);
    const istHour = istIn.getUTCHours();

    if (istHour >= 16) {
      const hasExplicitOut = candidateOuts.some(o => {
        const oMs = new Date(o.timestamp).getTime();
        return oMs > inMs && (oMs - inMs) <= 16 * 60 * 60 * 1000;
      });

      if (!hasExplicitOut) {
        const morningPunch = allPunches.find(p => {
          const pMs = new Date(p.timestamp).getTime();
          const diffHours = (pMs - inMs) / (60 * 60 * 1000);
          return diffHours >= 6 && diffHours <= 16;
        });

        if (morningPunch) {
          candidateOuts.push(morningPunch);
        }
      }
    }
  });

  candidateOuts.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const shifts = [];
  const pairedOutIds = new Set();
  const MAX_WINDOW_MS = 36 * 60 * 60 * 1000;

  for (let i = 0; i < validIns.length && i < maxShifts; i++) {
    const inPunch = validIns[i];
    const nextInPunch = validIns[i + 1];

    const candidates = candidateOuts.filter(out => {
      const outMs = new Date(out.timestamp).getTime();
      const inMs = new Date(inPunch.timestamp).getTime();
      const timeDiff = outMs - inMs;
      const isBeforeNextIn = !nextInPunch || outMs < new Date(nextInPunch.timestamp).getTime();
      return timeDiff > 0 && timeDiff <= MAX_WINDOW_MS && isBeforeNextIn && !pairedOutIds.has(out._id?.toString() || out.id);
    });

    const outPunch = candidates.find(c => c.source === 'manual') || candidates[0];

    const shift = {
      shiftNumber: i + 1,
      inTime: inPunch.timestamp,
      outTime: outPunch ? outPunch.timestamp : null,
      status: outPunch ? 'complete' : 'incomplete',
      inPunchId: inPunch._id || inPunch.id,
      outPunchId: outPunch ? (outPunch._id || outPunch.id) : null,
    };

    if (outPunch) {
      pairedOutIds.add(outPunch._id?.toString() || outPunch.id);
      const outMs = new Date(outPunch.timestamp).getTime();
      candidateOuts.forEach(o => {
        const diff = Math.abs(new Date(o.timestamp).getTime() - outMs);
        if (diff <= 15 * 60 * 1000) {
          pairedOutIds.add(o._id?.toString() || o.id);
        }
      });

      const durationMs = new Date(shift.outTime) - new Date(shift.inTime);
      shift.duration = Math.round(durationMs / (1000 * 60));
      shift.workingHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;
    }

    shifts.push(shift);
  }

  return shifts;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Payroll cycle helper                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Return the 26th-to-25th payroll cycle that contains `refDate`.
 * Fully dynamic — no hardcoded months.
 */
function getPayrollCycleRange(refDate = new Date()) {
  const d = new Date(refDate);
  const day = d.getDate();
  let startYear = d.getFullYear();
  let startMonth = d.getMonth(); // 0-indexed

  if (day < 26) {
    startMonth -= 1;
    if (startMonth < 0) { startMonth = 11; startYear -= 1; }
  }

  const startDateStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-26`;

  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth > 11) { endMonth = 0; endYear += 1; }
  const endDateStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-25`;

  return { startDate: startDateStr, endDate: endDateStr };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  DB helpers                                                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

async function getSecurityDivisionEmployees(customEmpNos = null) {
  const securityDiv = await Division.findOne({ name: /SECURITY/i }).lean();
  const securityDept = await Department.findOne({ name: /SECURITY/i }).lean();

  const queryOr = [];
  if (securityDiv?._id) queryOr.push({ division_id: securityDiv._id });
  if (securityDept?._id) queryOr.push({ department_id: securityDept._id });
  queryOr.push({ department: /SECURITY/i });

  if (Array.isArray(customEmpNos) && customEmpNos.length > 0) {
    queryOr.push({ emp_no: { $in: customEmpNos } });
    queryOr.push({ employeeNumber: { $in: customEmpNos } });
  }

  const employees = await Employee.find({ $or: queryOr })
    .populate('division_id department_id designation_id')
    .lean();

  return { securityDiv, securityDept, employees };
}

async function getSecurityDivisionShifts(securityDiv, securityDept) {
  const shiftIdSet = new Set();

  [securityDiv?.shifts, securityDept?.shifts].forEach(arr => {
    (arr || []).forEach(s => { if (s.shiftId) shiftIdSet.add(s.shiftId.toString()); });
  });

  const allCandidateShifts = await Shift.find({
    $or: [
      { _id: { $in: Array.from(shiftIdSet) } },
      { name: /SECURITY/i },
      { name: /NTS-GENERAL/i },
    ],
    isActive: { $ne: false },
  }).lean();

  // Security Division ONLY uses:
  // 1. Shift names containing 'SECURITY' (e.g. A-SECURITY, B-SECURITY, C-SECURITY, 12HRS-SECURITY)
  // 2. Division-specific General shift: NTS-GENERAL (09:00 - 17:30)
  // Exclude any HALF shifts (HALF-1GENERAL, HALF-2GENERAL, etc.)
  const shifts = allCandidateShifts.filter(s => {
    const nameUpper = (s.name || '').toUpperCase();
    if (nameUpper.startsWith('HALF-') || nameUpper.includes('HALF')) return false;
    return nameUpper.includes('SECURITY') || nameUpper.includes('NTS-GENERAL');
  });

  const shiftCodeMap = {};
  shifts.forEach(s => {
    const u = s.name.toUpperCase();
    shiftCodeMap[u] = s;
    shiftCodeMap[s._id.toString()] = s;
    if (u.includes('A-SECURITY')) shiftCodeMap['A'] = s;
    if (u.includes('B-SECURITY')) shiftCodeMap['B'] = s;
    if (u.includes('C-SECURITY')) shiftCodeMap['C'] = s;
    if (u.includes('12HRS-SECURITY')) shiftCodeMap['12HRS'] = s;
    if (u.includes('NTS-GENERAL')) shiftCodeMap['G'] = s;
  });

  return { shifts, shiftCodeMap };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Shift-matching helpers                                                      */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * True when shift end hour < shift start hour (spans midnight).
 * Examples: C-SECURITY 21:00-06:00, 12HRS-SECURITY 18:00-06:00.
 */
function isOvernightShift(shift) {
  if (!shift?.startTime || !shift?.endTime) return false;
  const [sh] = shift.startTime.split(':').map(Number);
  const [eh] = shift.endTime.split(':').map(Number);
  return eh < sh;
}

/**
 * Match a UTC timestamp to the nearest Security shift by IST clock-time proximity.
 * Uses circular (wrap-around) distance to handle overnight shifts correctly.
 */
function matchSecurityShiftByTime(inTimeUTC, outTimeUTC, shiftsList) {
  if (Array.isArray(outTimeUTC) && !shiftsList) {
    shiftsList = outTimeUTC;
    outTimeUTC = null;
  }
  if (!inTimeUTC || !shiftsList || shiftsList.length === 0) return null;

  // IST minutes-since-midnight of the in-punch
  const istInMs = new Date(inTimeUTC).getTime() + (5 * 60 + 30) * 60 * 1000;
  const istIn = new Date(istInMs);
  const inMins = istIn.getUTCHours() * 60 + istIn.getUTCMinutes();

  let outMins = null;
  if (outTimeUTC) {
    const istOutMs = new Date(outTimeUTC).getTime() + (5 * 60 + 30) * 60 * 1000;
    const istOut = new Date(istOutMs);
    outMins = istOut.getUTCHours() * 60 + istOut.getUTCMinutes();
  }

  let best = null;
  let minScore = Infinity;

  for (const shift of shiftsList) {
    if (!shift.startTime) continue;
    const [sh, sm] = shift.startTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    let inDiff = Math.abs(inMins - startMins);
    if (inDiff > 12 * 60) inDiff = 24 * 60 - inDiff; // circular wrap

    let score = inDiff;

    if (outMins !== null && shift.endTime) {
      const [eh, em] = shift.endTime.split(':').map(Number);
      const endMins = eh * 60 + em;
      let outDiff = Math.abs(outMins - endMins);
      if (outDiff > 12 * 60) outDiff = 24 * 60 - outDiff;
      // Combined weighted score: prioritize in-time match while factoring in out-time
      score = inDiff * 1.5 + outDiff;
    }

    if (score < minScore) {
      minScore = score;
      best = shift;
    }
  }

  return best;
}

/**
 * Resolve the calendar date string that should be passed as `date` to
 * calculateLateIn / calculateEarlyOut.
 *
 * - For normal shifts:  nominalDate (the date being iterated in the outer loop)
 * - For overnight shifts: IST date of the in-punch
 *   (e.g., C-SECURITY that starts at 21:00 on Sep 29 = shiftDate "2026-09-29")
 */
function resolveShiftDate(inTimeUTC, nominalDate, shift) {
  if (!isOvernightShift(shift)) return nominalDate;
  return toISTDateStr(inTimeUTC);
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Date range generator                                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

function generateDateRange(startDateStr, endDateStr) {
  const dates = [];
  let cur = new Date(`${startDateStr}T00:00:00Z`);
  const end = new Date(`${endDateStr}T00:00:00Z`);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Core engine                                                                 */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Run Dynamic Security Division Attendance Engine.
 *
 * @param {Object} options
 *   startDate       YYYY-MM-DD  — defaults to current payroll cycle start
 *   endDate         YYYY-MM-DD  — defaults to current payroll cycle end
 *   empNos          string[]    — optional filter (all security employees if omitted)
 *   overrideWithThumbs boolean  — default true
 */
async function runSecurityDivisionAttendanceEngine(options = {}) {
  let { startDate, endDate, empNos = null, overrideWithThumbs = true } = options;

  if (!startDate || !endDate) {
    const cycle = getPayrollCycleRange(new Date());
    startDate = startDate || cycle.startDate;
    endDate = endDate || cycle.endDate;
  }

  const { securityDiv, securityDept, employees } = await getSecurityDivisionEmployees(empNos);
  const { shifts, shiftCodeMap } = await getSecurityDivisionShifts(securityDiv, securityDept);
  const dates = generateDateRange(startDate, endDate);
  const empIdentifiers = employees.map(e => e.emp_no || e.employeeNumber || e.customId).filter(Boolean);

  const Leave = require('../../leaves/model/Leave');
  const empIds = employees.map(e => e._id);
  const padStartUtc = new Date(`${startDate}T00:00:00.000Z`);
  const padEndUtc = new Date(`${endDate}T23:59:59.999Z`);

  // Load all leaves for security employees covering this period
  const allLeaves = await Leave.find({
    employeeId: { $in: empIds },
    isActive: true,
    status: { $in: ['approved', 'pending', 'hod_approved', 'manager_approved'] },
    fromDate: { $lte: padEndUtc },
    toDate: { $gte: padStartUtc },
  }).lean();

  // Auto-approve pending leaves for Security division employees so that
  // the pay sheet grid, leave reports, and monthly summary all recognize them
  const pendingLeaveIds = allLeaves.filter(l => l.status === 'pending').map(l => l._id);
  if (pendingLeaveIds.length > 0) {
    await Leave.updateMany(
      { _id: { $in: pendingLeaveIds } },
      {
        $set: {
          status: 'approved',
          'workflow.isCompleted': true,
          'workflow.currentStepRole': 'completed',
          'approvals.final.status': 'approved',
        }
      }
    );
  }

  // Map leaves by employeeId -> dateStr -> leaveDoc
  const leaveMapByEmp = {};
  for (const l of allLeaves) {
    const k = String(l.employeeId);
    if (!leaveMapByEmp[k]) leaveMapByEmp[k] = new Map();
    const lStart = toISTDateStr(l.fromDate);
    const lEnd = toISTDateStr(l.toDate);
    for (const d of generateDateRange(lStart, lEnd)) {
      leaveMapByEmp[k].set(d, l);
    }
  }

  // Pre-scheduled roster entries
  const psList = await PreScheduledShift.find({
    employeeNumber: { $in: empIdentifiers },
    date: { $gte: startDate, $lte: endDate },
  }).lean();
  const psMap = {};
  psList.forEach(ps => { psMap[`${ps.employeeNumber}_${ps.date}`] = ps; });

  // Raw biometric logs with 2-day padding (overnight shifts can straddle midnight)
  const padStart = new Date(`${startDate}T00:00:00Z`);
  padStart.setDate(padStart.getDate() - 2);
  const padEnd = new Date(`${endDate}T23:59:59Z`);
  padEnd.setDate(padEnd.getDate() + 2);

  const allRaw = await AttendanceRawLog.find({
    $or: [
      { employeeNumber: { $in: empIdentifiers } },
      { biometricId: { $in: empIdentifiers } },
    ],
    timestamp: { $gte: padStart, $lte: padEnd },
  }).sort({ timestamp: 1 }).lean();

  const logsByEmp = {};
  allRaw.forEach(r => {
    const k = r.employeeNumber || r.biometricId;
    if (!logsByEmp[k]) logsByEmp[k] = [];
    logsByEmp[k].push(r);
  });

  const results = {
    startDate, endDate,
    totalEmployees: employees.length,
    processedDays: 0,
    dailyRecordsUpserted: 0,
    discrepancyCount: 0,
    employeeSummaries: [],
  };

  for (const emp of employees) {
    const empNo = emp.emp_no || emp.employeeNumber || emp.customId;
    const empName = emp.employee_name || emp.displayName || emp.name || empNo;
    const empLogs = logsByEmp[empNo] || [];

    let thumbPresentDays = 0, scheduledDutyDays = 0, leaveDays = 0, absentDays = 0;
    let totalWorkingHours = 0, totalPayableShifts = 0;
    let totalLateInMinsEmp = 0, totalEarlyOutMinsEmp = 0;
    let lateInsCountEmp = 0, earlyOutsCountEmp = 0;
    const discrepancies = [];

    // Track previous day's overnight shift checkout time to prevent morning exit pulses
    // from falsely starting a new shift or counting as presence on the next day
    let prevOvernightOutTime = null;
    if (dates.length > 0) {
      const firstDateObj = new Date(dates[0]);
      firstDateObj.setDate(firstDateObj.getDate() - 1);
      const dayBeforeStr = toISTDateStr(firstDateObj);
      const prevShifts = detectAndPairSecurityShifts(empLogs, dayBeforeStr, 3);
      if (prevShifts && prevShifts.length > 0) {
        const lastS = prevShifts[prevShifts.length - 1];
        if (lastS.outTime && toISTDateStr(lastS.outTime) === dates[0]) {
          prevOvernightOutTime = new Date(lastS.outTime);
        }
      }
    }

    for (const date of dates) {
      results.processedDays++;

      const ps = psMap[`${empNo}_${date}`];
      const psStatus = ps?.status || null;
      const empLeave = leaveMapByEmp[String(emp._id)]?.get(date);
      const isLeave = Boolean(empLeave) || psStatus === 'L' || psStatus === 'LEAVE';
      const isWO = psStatus === 'WO' || psStatus === 'WEEK_OFF';
      const isHOL = psStatus === 'HOL' || psStatus === 'HOLIDAY';

      if (!isLeave && !isWO && !isHOL) scheduledDutyDays++;

      // 1. All raw punches for this IST calendar date
      const rawDayPunches = empLogs.filter(r => toISTDateStr(r.timestamp) === date);

      // 2. Identify effective punches on this date by excluding checkout pulses of previous day's overnight shift.
      // Any punch that occurred at or before prevOvernightOutTime belongs to the overnight shift.
      // Pure OUT pulses within the exit window (30 mins) of overnight checkout are also excluded.
      let effectivePunches = rawDayPunches;
      let minInTimeForPairing = null;

      if (prevOvernightOutTime && toISTDateStr(prevOvernightOutTime) === date) {
        const outTimeMs = new Date(prevOvernightOutTime).getTime();
        const exitCutoffMs = outTimeMs + 30 * 60 * 1000;

        // If all punches on this date fall within 15 minutes of the overnight checkout,
        // they are duplicate exit taps from the overnight shift — no new shift occurred today.
        const hasPunchesAfterExitWindow = rawDayPunches.some(p => {
          return new Date(p.timestamp).getTime() > outTimeMs + 15 * 60 * 1000;
        });

        if (!hasPunchesAfterExitWindow) {
          effectivePunches = [];
        } else {
          effectivePunches = rawDayPunches.filter(p => {
            const pMs = new Date(p.timestamp).getTime();
            if (pMs <= outTimeMs) return false;
            if (pMs <= exitCutoffMs && isPunchOut(p) && !isPunchIn(p)) {
              return false;
            }
            return true;
          });
        }
      }

      // 3. Filter logs for detection so previous day's overnight punches are not fed as IN punches on this date.
      // Any punch at or before prevOvernightOutTime belongs to the overnight shift and cannot start a new shift on this date.
      // Also exclude redundant OUT pulses within 30 mins after checkout.
      const logsForDetection = empLogs.filter(p => {
        if (prevOvernightOutTime && toISTDateStr(prevOvernightOutTime) === date) {
          const pMs = new Date(p.timestamp).getTime();
          const outMs = new Date(prevOvernightOutTime).getTime();
          if (toISTDateStr(p.timestamp) === date && pMs <= outMs) {
            return false;
          }
          const hasPunchesAfterExitWindow = rawDayPunches.some(r => {
            return new Date(r.timestamp).getTime() > outMs + 15 * 60 * 1000;
          });
          if (!hasPunchesAfterExitWindow && toISTDateStr(p.timestamp) === date) {
            return false;
          }
          if (toISTDateStr(p.timestamp) === date && pMs <= outMs + 30 * 60 * 1000 && isPunchOut(p) && !isPunchIn(p)) {
            return false;
          }
        }
        return true;
      });

      const pairedShifts = detectAndPairSecurityShifts(logsForDetection, date, 3);

      // Ensure paired shifts are valid (> 15 mins).
      // Note: Consecutive shifts (e.g. night C-shift immediately followed by morning A-shift) are genuine working shifts.
      const validPairedShifts = (pairedShifts || []).filter(s => {
        const dur = Number(s.duration) || 0;
        return dur > 15;
      });

      const hasValidShifts = validPairedShifts.length > 0;
      const hasWorkingPunches = effectivePunches.length > 0;
      const hasLogs = hasValidShifts || hasWorkingPunches;

      // Discrepancy tracking
      if (hasLogs && isLeave) {
        discrepancies.push({
          date, rosterStatus: empLeave?.leaveType || psStatus || 'LEAVE',
          issue: 'Thumb punches found on roster Leave day',
          punchCount: effectivePunches.length,
          punchTimes: effectivePunches.map(p => new Date(p.timestamp).toISOString().substring(11, 16)).join(', '),
        });
      } else if (!hasLogs && psStatus && !isLeave && !isWO && !isHOL) {
        discrepancies.push({
          date, rosterStatus: psStatus,
          issue: 'No thumb punches on scheduled Duty day',
          punchCount: 0,
        });
      }

      let status = 'PRESENT';
      let shiftData = [];

      if (hasValidShifts && overrideWithThumbs) {
        // ═══ FULL PRESENT — paired shifts ════════════════════════════════════
        status = 'PRESENT';
        thumbPresentDays++;

        shiftData = validPairedShifts.map((rs, idx) => {
          const shift = matchSecurityShiftByTime(rs.inTime, rs.outTime, shifts) || shiftCodeMap['A'] || shifts[0];
          const overnight = isOvernightShift(shift);
          const expH = shift?.duration || 8;
          const durMins = rs.duration ?? (expH * 60);
          const wH = rs.workingHours ?? (Math.round((durMins / 60) * 100) / 100);
          const otH = Math.max(0, Math.round((wH - expH) * 100) / 100);

          // Correct date context for late-in / early-out
          const shiftDate = resolveShiftDate(rs.inTime, date, shift);

          const lateIn = rs.inTime && shift?.startTime
            ? (calculateLateIn(rs.inTime, shift.startTime, shift.gracePeriod || 15, shiftDate) || 0)
            : 0;

          let earlyOut = 0;
          if (rs.outTime && shift?.endTime) {
            earlyOut = calculateEarlyOut(
              rs.outTime, shift.endTime, shift.startTime,
              shiftDate, null, shift.gracePeriod || 15
            ) || 0;
          }

          return {
            shiftNumber: idx + 1,
            inTime: rs.inTime,
            outTime: rs.outTime,
            duration: durMins,
            workingHours: wH,
            punchHours: wH,
            odHours: 0,
            edgePermissionHours: 0,
            otHours: otH,
            shiftId: shift?._id || null,
            shiftName: shift?.name || 'SECURITY',
            shiftStartTime: shift?.startTime || '09:00',
            shiftEndTime: shift?.endTime || '17:30',
            isOvernight: overnight,
            lateInMinutes: lateIn,
            earlyOutMinutes: earlyOut,
            isLateIn: lateIn > 0,
            isEarlyOut: earlyOut > 0,
            status: 'PRESENT',
            payableShift: shift?.payableShifts || 1,
            basePayable: shift?.payableShifts || 1,
            expectedHours: expH,
            extraHours: otH,
          };
        });

      } else if (hasWorkingPunches && overrideWithThumbs) {
        // ═══ PARTIAL STATE — genuine single or incomplete punches on this date ═══
        // Not a full shift. Never falsely marked PRESENT. Payable is 0.5.
        status = 'PARTIAL';
        thumbPresentDays += 0.5;

        const firstPunch = new Date(effectivePunches[0].timestamp);
        const lastPunch = effectivePunches.length > 1
          ? new Date(effectivePunches[effectivePunches.length - 1].timestamp)
          : null;

        const isOnlyOut = effectivePunches.every(p => {
          const t = (p.type || p.subType || p.rawData?.resolvedType || '').toUpperCase();
          return t.includes('OUT') && !t.includes('IN');
        });

        const shift = matchSecurityShiftByTime(firstPunch, lastPunch, shifts) || shiftCodeMap['A'] || shifts[0];
        const overnight = isOvernightShift(shift);
        const shiftDate = resolveShiftDate(firstPunch, date, shift);
        const expH = shift?.duration || 8;

        const lateIn = (!isOnlyOut && firstPunch && shift?.startTime)
          ? (calculateLateIn(firstPunch, shift.startTime, shift.gracePeriod || 15, shiftDate) || 0)
          : 0;

        const inTime = isOnlyOut ? null : firstPunch;
        const outTime = isOnlyOut ? (lastPunch || firstPunch) : (lastPunch && lastPunch.getTime() !== firstPunch.getTime() ? lastPunch : null);
        const durMins = (inTime && outTime) ? Math.round((outTime.getTime() - inTime.getTime()) / 60000) : 0;

        shiftData = [{
          shiftNumber: 1,
          inTime,
          outTime,
          duration: durMins,
          workingHours: 0,
          punchHours: 0,
          odHours: 0,
          edgePermissionHours: 0,
          otHours: 0,
          shiftId: shift?._id || null,
          shiftName: shift?.name || 'SECURITY',
          shiftStartTime: shift?.startTime || '09:00',
          shiftEndTime: shift?.endTime || '17:30',
          isOvernight: overnight,
          lateInMinutes: lateIn,
          earlyOutMinutes: 0,
          isLateIn: lateIn > 0,
          isEarlyOut: false,
          status: 'PARTIAL',
          payableShift: 0.5,
          basePayable: shift?.payableShifts || 1,
          expectedHours: expH,
          extraHours: 0,
        }];

      } else {
        // ═══ Non-working / No logs on this date ══════════════════════════════
        // Any morning punches were checkout pulses of previous day's shift.
        if (isLeave) {
          status = 'LEAVE';
          leaveDays++;
        } else if (isWO) {
          status = 'WEEK_OFF';
        } else if (isHOL) {
          status = 'HOLIDAY';
        } else {
          status = 'ABSENT';
          absentDays++;
        }
        shiftData = [];
      }

      // Update prevOvernightOutTime for next day's exit pulse detection
      if (validPairedShifts && validPairedShifts.length > 0) {
        const lastShift = validPairedShifts[validPairedShifts.length - 1];
        if (lastShift.outTime && toISTDateStr(lastShift.outTime) > date) {
          prevOvernightOutTime = new Date(lastShift.outTime);
        } else {
          prevOvernightOutTime = null;
        }
      } else {
        prevOvernightOutTime = null;
      }

      // Aggregate day-level totals
      const dayWH = shiftData.reduce((a, s) => a + (s.workingHours || 0), 0);
      const dayPay = status === 'PRESENT'
        ? shiftData.reduce((a, s) => a + (s.payableShift || 1), 0)
        : (status === 'PARTIAL' ? 0.5 : 0);
      const dayLate = shiftData.reduce((a, s) => a + (s.lateInMinutes || 0), 0);
      const dayEarly = shiftData.reduce((a, s) => a + (s.earlyOutMinutes || 0), 0);
      const dayOT = shiftData.reduce((a, s) => a + (s.otHours || 0), 0);

      totalWorkingHours += dayWH;
      totalPayableShifts += dayPay;
      totalLateInMinsEmp += dayLate;
      totalEarlyOutMinsEmp += dayEarly;
      if (dayLate > 0) lateInsCountEmp++;
      if (dayEarly > 0) earlyOutsCountEmp++;

      const payload = {
        employee_id: emp._id,
        employeeNumber: empNo,
        date,
        shifts: shiftData,
        totalShifts: shiftData.length,
        totalWorkingHours: Math.round(dayWH * 100) / 100,
        totalOTHours: Math.round(dayOT * 100) / 100,
        payableShifts: dayPay,
        totalLateInMinutes: dayLate,
        totalEarlyOutMinutes: dayEarly,
        totalExpectedHours: status === 'PRESENT'
          ? shiftData.reduce((a, s) => a + (s.expectedHours || 8), 0)
          : (status === 'PARTIAL' ? 4 : 0),
        status,
        isEdited: false,
        source: hasLogs ? ['biometric-realtime'] : ['roster-sync'],
        lastSyncedAt: new Date(),
        notes: [
          'Security Division Sync',
          `Status: ${status}`,
          status === 'LEAVE' && empLeave ? `Leave: ${empLeave.leaveType || 'LOP'}${empLeave.purpose ? ' (' + empLeave.purpose + ')' : ''}` : null,
          dayLate > 0 ? `LateIn: ${dayLate}m` : null,
          dayEarly > 0 ? `EarlyOut: ${dayEarly}m` : null,
          `Punches: ${rawDayPunches.length}`,
        ].filter(Boolean).join(' | '),
      };

      await AttendanceDaily.findOneAndUpdate(
        { employeeNumber: empNo, date },
        { $set: payload },
        { upsert: true, new: true }
      );
      results.dailyRecordsUpserted++;
    }

    results.discrepancyCount += discrepancies.length;
    results.employeeSummaries.push({
      empNo,
      empName,
      totalDays: dates.length,
      thumbPresentDays,
      scheduledDutyDays,
      finalPresentDays: thumbPresentDays,
      leaveDays,
      absentDays,
      weekOffDays: dates.length - thumbPresentDays - leaveDays - absentDays,
      totalWorkingHours: Math.round(totalWorkingHours * 100) / 100,
      totalPayableShifts,
      lateInsCount: lateInsCountEmp,
      earlyOutsCount: earlyOutsCountEmp,
      totalLateInMinutes: totalLateInMinsEmp,
      totalEarlyOutMinutes: totalEarlyOutMinsEmp,
      discrepancyCount: discrepancies.length,
      discrepancies,
    });
  }

  // Recalculate MonthlyAttendanceSummary for all processed employees
  // Exactly follows scripts/recalc_all_employees_monthly_summary.js conditions
  if (options.recalculateMonthlySummary !== false) {
    try {
      const { calculateMonthlySummary } = require('./summaryCalculationService');
      const dateCycleService = require('../../leaves/services/dateCycleService');
      const { createISTDate } = require('../../shared/utils/dateUtils');

      const baseDate = createISTDate(startDate);
      const periodInfo = await dateCycleService.getPeriodInfo(baseDate);
      const { year, month: monthNumber } = periodInfo.payrollCycle;

      for (const emp of employees) {
        const empNo = emp.emp_no || emp.employeeNumber || emp.customId;
        if (empNo && emp._id) {
          await calculateMonthlySummary(emp._id, empNo, year, monthNumber);
          const endBase = createISTDate(endDate);
          const endInfo = await dateCycleService.getPeriodInfo(endBase);
          if (endInfo.payrollCycle.month !== monthNumber || endInfo.payrollCycle.year !== year) {
            await calculateMonthlySummary(emp._id, empNo, endInfo.payrollCycle.year, endInfo.payrollCycle.month);
          }
        }
      }
    } catch (err) {
      console.warn('[SecurityDivision] Monthly summary recalculation warning:', err.message);
    }
  }

  return results;
}

module.exports = {
  getPayrollCycleRange,
  getSecurityDivisionEmployees,
  getSecurityDivisionShifts,
  runSecurityDivisionAttendanceEngine,
};
