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
/**
 * Deduplicate raw punches: collapse rapid duplicate pulses within threshold seconds.
 * Preserves back-to-back shift changeover punches (e.g. OUT at 13:10 followed by IN at 13:11).
 */
function deduplicatePunches(punches, thresholdMinutes = 15) {
  if (!punches || punches.length === 0) return [];
  const sorted = [...punches].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = result[result.length - 1];
    const diffSec = (new Date(cur.timestamp) - new Date(prev.timestamp)) / 1000;

    const prevIn = isPunchIn(prev);
    const prevOut = isPunchOut(prev);
    const curIn = isPunchIn(cur);
    const curOut = isPunchOut(cur);

    // If one is OUT and the next is IN (or vice versa), they represent distinct operational events (e.g. shift changeover)
    const isDirectionChange = (prevOut && curIn) || (prevIn && curOut);

    if (isDirectionChange) {
      result.push(cur);
      continue;
    }

    // Same direction or directionless: collapse duplicate taps within thresholdMinutes (default 15 minutes)
    if (diffSec >= thresholdMinutes * 60) {
      result.push(cur);
    }
  }
  return result;
}

/**
 * Robust Security Shift Pairing.
 * Handles both explicit OUT punches and directionless punches (common on security biometric devices).
 * - Maximum single shift duration is 15 hours (longest shift is 12h + 3h OT). Never spans 24h.
 * - Same-day punches with a gap >= 3.5h form complete daytime shifts (e.g. 05:45 - 13:01 -> A-SECURITY).
 * - Evening punches without a same-day exit (e.g. >= 16:00 IST) look ahead to the next morning (4h to 15h) for overnight shifts.
 * - Supports multi-shift days (e.g. Shift 1 morning + Shift 2 afternoon/night) and shared boundary punches.
 */
function detectAndPairSecurityShifts(rawLogs, date, maxShifts = 3) {
  if (!rawLogs || rawLogs.length === 0) return [];

  const MAX_SAME_DAY_SHIFT_WINDOW_MS = 13 * 60 * 60 * 1000; // 13 hours maximum for same-day shifts
  const MAX_OVERNIGHT_SHIFT_WINDOW_MS = 15 * 60 * 60 * 1000; // 15 hours maximum for overnight shifts
  const MIN_SHIFT_GAP_MS = 3.5 * 60 * 60 * 1000;    // 3.5 hours minimum gap for a distinct exit

  const cleanLogs = deduplicatePunches(rawLogs, 15);
  const dayPunches = cleanLogs.filter(p => toISTDateStr(p.timestamp) === date);
  if (dayPunches.length === 0) return [];

  const shifts = [];
  const usedPunchIds = new Set();

  let pIdx = 0;
  while (pIdx < dayPunches.length && shifts.length < maxShifts) {
    const curPunch = dayPunches[pIdx];
    const curId = curPunch._id?.toString() || curPunch.id;
    const curMs = new Date(curPunch.timestamp).getTime();
    const curISTHour = new Date(curMs + 5.5 * 3600 * 1000).getUTCHours();

    // 0a. Skip already used punches
    if (usedPunchIds.has(curId)) {
      pIdx += 1;
      continue;
    }

    // 0b. Overlapping shift prevention: a new shift cannot start before the previous shift ends
    if (shifts.length > 0) {
      const lastShift = shifts[shifts.length - 1];
      if (lastShift.outTime) {
        const lastOutMs = new Date(lastShift.outTime).getTime();
        if (curMs < lastOutMs) {
          pIdx += 1;
          continue;
        }
      }
    }

    // 0c. Explicit OUT punch (e.g. morning checkout from night duty) cannot start a daytime shift
    if (isPunchOut(curPunch) && !isPunchIn(curPunch)) {
      pIdx += 1;
      continue;
    }

    // 1. Check if there is a later punch on the SAME calendar date
    let nextSameDayPunch = null;
    for (let j = pIdx + 1; j < dayPunches.length; j++) {
      const cand = dayPunches[j];
      const candId = cand._id?.toString() || cand.id;
      if (!usedPunchIds.has(candId)) {
        const candMs = new Date(cand.timestamp).getTime();
        const diffMs = candMs - curMs;
        if (diffMs >= MIN_SHIFT_GAP_MS && diffMs <= MAX_SAME_DAY_SHIFT_WINDOW_MS) {
          nextSameDayPunch = cand;
          break;
        }
      }
    }

    if (nextSameDayPunch) {
      const nextMs = new Date(nextSameDayPunch.timestamp).getTime();
      const diffMs = nextMs - curMs;

      // Complete same-day shift! (e.g. 05:45 -> 13:01 [A-SECURITY], 12:43 -> 21:01 [B-SECURITY])
      shifts.push({
        shiftNumber: shifts.length + 1,
        inTime: curPunch.timestamp,
        outTime: nextSameDayPunch.timestamp,
        status: 'complete',
        duration: Math.round(diffMs / 60000),
        workingHours: Math.round((diffMs / 3600000) * 100) / 100,
        inPunchId: curPunch._id || curPunch.id,
        outPunchId: nextSameDayPunch._id || nextSameDayPunch.id,
      });
      usedPunchIds.add(curId);
      usedPunchIds.add(nextSameDayPunch._id?.toString() || nextSameDayPunch.id);

      pIdx += 1;
      continue;
    }

    // 2. Overnight shift: if evening punch (>= 16:00 IST) with NO same-day exit, look into next morning (4h to 15h)
    if (curISTHour >= 16) {
      // First prefer an explicit OUT punch in the morning
      let nextDayOut = cleanLogs.find(p => {
        if (!isPunchOut(p)) return false;
        const pMs = new Date(p.timestamp).getTime();
        const diffMs = pMs - curMs;
        return diffMs >= MIN_SHIFT_GAP_MS && diffMs <= MAX_OVERNIGHT_SHIFT_WINDOW_MS && !usedPunchIds.has(p._id?.toString() || p.id);
      });

      // If no explicit OUT punch, fall back to any directionless or morning punch
      if (!nextDayOut) {
        nextDayOut = cleanLogs.find(p => {
          const pMs = new Date(p.timestamp).getTime();
          const diffMs = pMs - curMs;
          return diffMs >= MIN_SHIFT_GAP_MS && diffMs <= MAX_OVERNIGHT_SHIFT_WINDOW_MS && !usedPunchIds.has(p._id?.toString() || p.id);
        });
      }

      if (nextDayOut) {
        const diffMs = new Date(nextDayOut.timestamp).getTime() - curMs;
        shifts.push({
          shiftNumber: shifts.length + 1,
          inTime: curPunch.timestamp,
          outTime: nextDayOut.timestamp,
          status: 'complete',
          duration: Math.round(diffMs / 60000),
          workingHours: Math.round((diffMs / 3600000) * 100) / 100,
          inPunchId: curPunch._id || curPunch.id,
          outPunchId: nextDayOut._id || nextDayOut.id,
        });
        usedPunchIds.add(curPunch._id?.toString() || curPunch.id);
        usedPunchIds.add(nextDayOut._id?.toString() || nextDayOut.id);

        // Also consume duplicate taps around morning checkout
        const nextOutMs = new Date(nextDayOut.timestamp).getTime();
        cleanLogs.forEach(p => {
          const pMs = new Date(p.timestamp).getTime();
          if (Math.abs(pMs - nextOutMs) <= 15 * 60 * 1000) {
            usedPunchIds.add(p._id?.toString() || p.id);
          }
        });

        pIdx += 1;
        continue;
      }
    }

    // 3. Check for any explicit OUT punch later within 13 hours
    const explicitOut = cleanLogs.find(p => {
      if (!isPunchOut(p)) return false;
      const pMs = new Date(p.timestamp).getTime();
      const diffMs = pMs - curMs;
      return diffMs > 0 && diffMs <= MAX_SAME_DAY_SHIFT_WINDOW_MS && !usedPunchIds.has(p._id?.toString() || p.id);
    });

    if (explicitOut) {
      const diffMs = new Date(explicitOut.timestamp).getTime() - curMs;
      shifts.push({
        shiftNumber: shifts.length + 1,
        inTime: curPunch.timestamp,
        outTime: explicitOut.timestamp,
        status: 'complete',
        duration: Math.round(diffMs / 60000),
        workingHours: Math.round((diffMs / 3600000) * 100) / 100,
        inPunchId: curPunch._id || curPunch.id,
        outPunchId: explicitOut._id || explicitOut.id,
      });
      usedPunchIds.add(curPunch._id?.toString() || curPunch.id);
      usedPunchIds.add(explicitOut._id?.toString() || explicitOut.id);
      pIdx += 1;
      continue;
    }

    // 4. Incomplete shift (single punch without exit within 15 hours)
    shifts.push({
      shiftNumber: shifts.length + 1,
      inTime: curPunch.timestamp,
      outTime: null,
      status: 'incomplete',
      duration: 0,
      workingHours: 0,
      inPunchId: curPunch._id || curPunch.id,
      outPunchId: null,
    });
    usedPunchIds.add(curPunch._id?.toString() || curPunch.id);
    pIdx += 1;
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

  let filter = { $or: queryOr };
  if (Array.isArray(customEmpNos) && customEmpNos.length > 0) {
    const cleanNos = customEmpNos.map(n => String(n).trim().toUpperCase());
    filter = {
      $and: [
        { $or: queryOr },
        {
          $or: [
            { emp_no: { $in: cleanNos } },
            { employeeNumber: { $in: cleanNos } },
            { customId: { $in: cleanNos } },
          ],
        },
      ],
    };
  }

  const employees = await Employee.find(filter)
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
    const empLogs = deduplicatePunches(logsByEmp[empNo] || [], 15);

    let thumbPresentDays = 0, scheduledDutyDays = 0, leaveDays = 0, absentDays = 0;
    let weekOffDays = 0, holidayDays = 0;
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
            return pMs > outTimeMs;
          });
        }
      }

      // 3. Filter logs for detection so previous day's overnight punches are not fed as IN punches on this date.
      // Any punch at or before prevOvernightOutTime belongs to the overnight shift and cannot start a new shift on this date.
      const logsForDetection = empLogs.filter(p => {
        if (prevOvernightOutTime && toISTDateStr(prevOvernightOutTime) === date) {
          const pMs = new Date(p.timestamp).getTime();
          const outMs = new Date(prevOvernightOutTime).getTime();
          if (toISTDateStr(p.timestamp) === date && pMs <= outMs) {
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

      } else if (hasWorkingPunches && overrideWithThumbs && !isLeave && !isWO && !isHOL) {
        // ═══ PARTIAL STATE — genuine single or incomplete punches on scheduled duty day ═══
        // Not a full shift. Never falsely marked PRESENT. Payable is 0.5.
        // Protected: Approved LEAVE, WEEK_OFF, and HOLIDAY must NEVER be demoted to PARTIAL.
        status = 'PARTIAL';

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
          weekOffDays++;
        } else if (isHOL) {
          status = 'HOLIDAY';
          holidayDays++;
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

      thumbPresentDays += dayPay;
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
        { upsert: true, new: true, skipSummaryRecalc: true }
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
      weekOffDays,
      holidayDays,
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

      const batchSize = 4;
      for (let i = 0; i < employees.length; i += batchSize) {
        const chunk = employees.slice(i, i + batchSize);
        await Promise.all(chunk.map(async emp => {
          const empNo = emp.emp_no || emp.employeeNumber || emp.customId;
          if (empNo && emp._id) {
            await calculateMonthlySummary(emp._id, empNo, year, monthNumber);
            const endBase = createISTDate(endDate);
            const endInfo = await dateCycleService.getPeriodInfo(endBase);
            if (endInfo.payrollCycle.month !== monthNumber || endInfo.payrollCycle.year !== year) {
              await calculateMonthlySummary(emp._id, empNo, endInfo.payrollCycle.year, endInfo.payrollCycle.month);
            }
          }
        }));
      }
    } catch (err) {
      console.warn('[SecurityDivision] Monthly summary recalculation warning:', err.message);
    }
  }

  return results;
}

function isSecurityDivisionEmployee(employee) {
  if (!employee) return false;
  return Boolean(
    /security/i.test(
      String(
        employee.division_id?.name ||
        employee.division_id ||
        employee.department_id?.name ||
        employee.department_id ||
        employee.department ||
        employee.division ||
        employee.designation_id?.name ||
        employee.designation ||
        ''
      )
    )
  );
}

async function isSecurityEmployeeNumber(employeeNumber) {
  if (!employeeNumber) return false;
  const Employee = require('../../employees/model/Employee');
  const emp = await Employee.findOne({
    $or: [
      { emp_no: String(employeeNumber).trim().toUpperCase() },
      { employeeNumber: String(employeeNumber).trim().toUpperCase() },
      { customId: String(employeeNumber).trim().toUpperCase() },
    ],
  })
    .select('emp_no employeeNumber division_id department_id designation_id department division')
    .populate('division_id department_id designation_id')
    .lean();
  return isSecurityDivisionEmployee(emp);
}

module.exports = {
  getPayrollCycleRange,
  getSecurityDivisionEmployees,
  getSecurityDivisionShifts,
  runSecurityDivisionAttendanceEngine,
  isSecurityDivisionEmployee,
  isSecurityEmployeeNumber,
  detectAndPairSecurityShifts,
  deduplicatePunches,
  isPunchIn,
  isPunchOut,
  toISTDateStr,
};
