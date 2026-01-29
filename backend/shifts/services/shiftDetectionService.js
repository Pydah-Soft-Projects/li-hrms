/**
 * Shift Detection Service
 * Automatically detects and assigns shifts to attendance records
 * Priority: Pre-Scheduled → Designation → Department → General Shifts
 */

const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const Division = require('../../departments/model/Division');
const Shift = require('../model/Shift');
const PreScheduledShift = require('../model/PreScheduledShift');
const ConfusedShift = require('../model/ConfusedShift');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const Settings = require('../../settings/model/Settings');

/**
 * Convert time string (HH:mm) to minutes from midnight
 */
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Calculate time difference between punch time and shift start time
 * Handles overnight shifts correctly by considering date context
 * @param {Date} punchTime - The actual punch time (with date)
 * @param {String} shiftStartTime - Shift start time (HH:mm)
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date
 * @returns {Number} - Time difference in minutes (absolute value)
 */
const calculateTimeDifference = (punchTime, shiftStartTime, date) => {
  // Get punch time components
  const punchDate = new Date(punchTime);
  const punchMinutes = punchDate.getHours() * 60 + punchDate.getMinutes();

  // Get shift start time components
  const [shiftStartHour, shiftStartMin] = shiftStartTime.split(':').map(Number);

  // Create shift start time on the attendance date
  const shiftStartDate = new Date(date + 'T00:00:00'); // Parse date properly
  shiftStartDate.setHours(shiftStartHour, shiftStartMin, 0, 0);

  // Calculate difference in milliseconds, then convert to minutes
  let differenceMs = Math.abs(punchDate.getTime() - shiftStartDate.getTime());
  let differenceMinutes = differenceMs / (1000 * 60);

  // Handle overnight shifts - if shift starts late (20:00+) and punch is early morning (before 12:00)
  // Consider it might be for the shift that started the previous evening
  if (shiftStartHour >= 20 && punchDate.getHours() < 12) {
    // This is likely for a shift that started the previous evening
    const previousDayShiftStart = new Date(shiftStartDate);
    previousDayShiftStart.setDate(previousDayShiftStart.getDate() - 1);
    const prevDayDiffMs = Math.abs(punchDate.getTime() - previousDayShiftStart.getTime());
    const prevDayDiffMinutes = prevDayDiffMs / (1000 * 60);

    // For overnight shifts with early morning punch, use previous day's difference
    // This correctly handles very late arrivals (e.g., 02:50 for 20:00 shift = 6h 50m late)
    differenceMinutes = prevDayDiffMinutes;
  }

  // If difference is more than 12 hours for non-overnight shifts, consider it might be wrapping around
  // But for overnight shifts, we already handled it above
  if (differenceMinutes > 12 * 60 && !(shiftStartHour >= 20 && punchDate.getHours() < 12)) {
    differenceMinutes = 24 * 60 - differenceMinutes;
  }

  return differenceMinutes;
};

/**
 * Check if a time falls within a shift window (DEPRECATED - kept for backward compatibility)
 * Grace period is now only used for late-in calculation, not matching
 * @param {Date} punchTime - The actual punch time
 * @param {String} shiftStartTime - Shift start time (HH:mm)
 * @param {Number} gracePeriodMinutes - Grace period in minutes (not used for matching)
 * @returns {Boolean} - True if within window
 */
const isWithinShiftWindow = (punchTime, shiftStartTime, gracePeriodMinutes = 15) => {
  // This function is deprecated - matching now uses proximity, not grace period
  // Keeping for backward compatibility but it should not be used for matching
  const punchMinutes = punchTime.getHours() * 60 + punchTime.getMinutes();
  const shiftStartMinutes = timeToMinutes(shiftStartTime);
  const graceEndMinutes = shiftStartMinutes + gracePeriodMinutes;

  // Handle overnight shifts
  if (graceEndMinutes >= 24 * 60) {
    return punchMinutes >= shiftStartMinutes || punchMinutes <= (graceEndMinutes % (24 * 60));
  }

  return punchMinutes >= shiftStartMinutes && punchMinutes <= graceEndMinutes;
};

/**
 * Filter shift configurations based on employee gender
 * Handles both new config objects and legacy ID arrays
 * @param {Array} shiftConfigs - Array of shift configs ({shiftId, gender}) or IDs
 * @param {String} employeeGender - Employee's gender (Male/Female/Other)
 * @returns {Array} - Array of Shift IDs
 */
const filterShiftsByGender = (shiftConfigs, employeeGender) => {
  if (!shiftConfigs || !Array.isArray(shiftConfigs) || shiftConfigs.length === 0) {
    return [];
  }

  // Check data structure (Config Object vs Legacy ID)
  const isConfigObject = shiftConfigs[0].shiftId !== undefined;

  if (!isConfigObject) {
    // Legacy: Array of IDs -> No gender restriction (Backward Compatibility)
    return shiftConfigs;
  }

  // New Structure: Filter by gender
  return shiftConfigs
    .filter(config => {
      if (!config || !config.shiftId) return false;

      // If no gender specified or 'All', allow it
      if (!config.gender || config.gender === 'All') return true;

      // Use case-insensitive match just in case
      return config.gender.toLowerCase() === (employeeGender || '').toLowerCase();
    })
    .map(config => config.shiftId);
};

/**
 * Get shifts for employee based on priority
 * Priority: Pre-Scheduled → Designation → Department → General
 */
const getShiftsForEmployee = async (employeeNumber, date) => {
  try {
    // Get employee details with all organizational links
    const employee = await Employee.findOne({ emp_no: employeeNumber })
      .populate('division_id')
      .populate('department_id')
      .populate('designation_id');

    if (!employee) {
      return { shifts: [], source: 'none' };
    }

    const division_id = employee.division_id?._id;
    const department_id = employee.department_id?._id;
    const designation_id = employee.designation_id?._id;
    const employeeGender = employee.gender;

    if (!division_id) {
      console.warn(`[ShiftDetection] Employee ${employeeNumber} has no division_id assigned.`);
    }

    const allCandidateShifts = new Map();
    let rosteredShift = null;
    let rosterRecordId = null;

    // 1. Check pre-scheduled shift (Tier 1 - Highest Priority)
    const preScheduled = await PreScheduledShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shiftId');

    if (preScheduled && preScheduled.shiftId) {
      rosteredShift = preScheduled.shiftId;
      rosterRecordId = preScheduled._id;
      allCandidateShifts.set(preScheduled.shiftId._id.toString(), preScheduled.shiftId);
      // Return early if rostered? No, we might want to allow matching other shifts if it's a deviation
      // But for source tracking, this wins.
    }

    // 2. Designation shifts (Context-Specific & Division Defaults)
    if (designation_id && employee.designation_id) {
      let shiftIds = [];
      const desig = employee.designation_id;

      // Tier 2: (Division + Department) Specific Override
      if (division_id && department_id && desig.departmentShifts) {
        const contextOverride = desig.departmentShifts.find(
          ds => ds.division?.toString() === division_id.toString() &&
            ds.department?.toString() === department_id.toString()
        );
        if (contextOverride && contextOverride.shifts?.length > 0) {
          shiftIds = filterShiftsByGender(contextOverride.shifts, employeeGender);
        }
      }

      // Tier 3: Division-Global Designation Default
      if (shiftIds.length === 0 && division_id && desig.divisionDefaults) {
        const divisionDefault = desig.divisionDefaults.find(
          dd => dd.division?.toString() === division_id.toString()
        );
        if (divisionDefault && divisionDefault.shifts?.length > 0) {
          shiftIds = filterShiftsByGender(divisionDefault.shifts, employeeGender);
        }
      }

      // Tier 4: Backward Compatibility Fallback (Global designation shifts)
      // Only if NO division assigned. If division exists, we expect specific rules or fall through.
      if (shiftIds.length === 0 && !division_id && desig.shifts?.length > 0) {
        shiftIds = filterShiftsByGender(desig.shifts, employeeGender);
      }

      if (shiftIds.length > 0) {
        const designationShifts = await Shift.find({ _id: { $in: shiftIds }, isActive: true });
        designationShifts.forEach(s => {
          s.sourcePriority = 2; // Designation Priority
          allCandidateShifts.set(s._id.toString(), s);
        });
      }
    }

    // 3. Department shifts (Tier 3)
    // Runs ALONGSIDE Designation (Combined Tier)
    if (department_id && employee.department_id) {
      let deptShiftIds = [];
      const dept = employee.department_id;

      if (division_id && dept.divisionDefaults) {
        const divDeptDefault = dept.divisionDefaults.find(
          dd => dd.division?.toString() === division_id.toString()
        );
        if (divDeptDefault && divDeptDefault.shifts?.length > 0) {
          deptShiftIds = filterShiftsByGender(divDeptDefault.shifts, employeeGender);
        }
      }

      // Fallback to legacy department shifts ONLY if employee has NO division assigned
      if (deptShiftIds.length === 0 && !division_id && dept.shifts?.length > 0) {
        deptShiftIds = filterShiftsByGender(dept.shifts, employeeGender);
      }

      if (deptShiftIds.length > 0) {
        const departmentShifts = await Shift.find({ _id: { $in: deptShiftIds }, isActive: true });
        departmentShifts.forEach(s => {
          // Only add if not already present (Preserve Tier 2 priority if same shift)
          if (!allCandidateShifts.has(s._id.toString())) {
            s.sourcePriority = 3; // Department Priority
            allCandidateShifts.set(s._id.toString(), s);
          }
        });
      }
    }

    // 4. Division Baseline Shifts (Tier 4) - Fallback
    if (allCandidateShifts.size === 0 && division_id && employee.division_id) {
      const division = employee.division_id;
      if (division.shifts && division.shifts.length > 0) {
        const filteredDivisionShifts = filterShiftsByGender(division.shifts, employeeGender);
        const divisionShifts = await Shift.find({ _id: { $in: filteredDivisionShifts }, isActive: true });
        divisionShifts.forEach(s => {
          s.sourcePriority = 4; // Division Priority
          allCandidateShifts.set(s._id.toString(), s);
        });
      }
    }

    // 5. Global Fallback (Tier 5)
    if (allCandidateShifts.size === 0) {
      const generalShifts = await Shift.find({ isActive: true });
      generalShifts.forEach(s => {
        s.sourcePriority = 5; // Global Priority
        allCandidateShifts.set(s._id.toString(), s);
      });
    }

    return {
      shifts: Array.from(allCandidateShifts.values()),
      source: rosteredShift ? 'pre_scheduled' : 'organizational',
      rosteredShiftId: rosteredShift?._id || null,
      rosterRecordId: rosterRecordId,
    };

  } catch (error) {
    console.error('Error getting shifts for employee:', error);
    return { shifts: [], source: 'none' };
  }
};

/**
 * Find candidate shifts based on proximity to in-time (not grace period)
 * Prioritizes shifts where start time is BEFORE log time and difference ≤ 35 minutes
 * @param {Date} inTime - Employee's in-time
 * @param {Array} shifts - Array of shift objects
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date
 * @param {Number} toleranceHours - Maximum hours difference to consider (default 3 hours)
 * @returns {Array} - Array of candidate shifts sorted by preference (preferred first)
 */
const findCandidateShifts = (inTime, shifts, date, toleranceHours = 3) => {
  const candidates = [];
  const toleranceMinutes = toleranceHours * 60;
  const preferredMaxDifference = 35; // 35 minutes max difference for preferred shifts

  const inTimeDate = new Date(inTime);
  const inMinutes = inTimeDate.getHours() * 60 + inTimeDate.getMinutes();

  for (const shift of shifts) {
    const difference = calculateTimeDifference(inTime, shift.startTime, date);

    // Only consider shifts within tolerance
    if (difference <= toleranceMinutes) {
      const shiftStartMinutes = timeToMinutes(shift.startTime);

      // Check if shift start is before log time
      let isStartBeforeLog = false;

      // Handle overnight shifts - if shift starts late (20:00+) and log is early morning
      if (shiftStartMinutes >= 20 * 60 && inMinutes < 12 * 60) {
        // This is likely for previous night's shift
        isStartBeforeLog = true;
      } else {
        // Regular same-day comparison
        isStartBeforeLog = shiftStartMinutes <= inMinutes;
      }

      // Calculate if difference is within preferred range (≤35 minutes)
      const isPreferred = isStartBeforeLog && difference <= preferredMaxDifference;

      candidates.push({
        shiftId: shift._id,
        shiftName: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        duration: shift.duration,
        gracePeriod: shift.gracePeriod || 15,
        differenceMinutes: difference,
        isStartBeforeLog: isStartBeforeLog,
        isPreferred: isPreferred,
        sourcePriority: shift.sourcePriority || 99, // Lower is better (2=Desig, 3=Dept)
        matchReason: `In-time ${inTimeDate.toLocaleTimeString()} is ${difference.toFixed(1)} minutes from shift ${shift.name} start (${shift.startTime})`,
      });
    }
  }

  // Sort by preference:
  // 1. Preferred shifts first (start before log, ≤35 min difference)
  // 2. Then by isStartBeforeLog (start before log, but >35 min)
  // 3. Then by difference (closest first)
  // 4. Then by Source Priority (Designation > Department > Division > Global)
  return candidates.sort((a, b) => {
    // Preferred shifts come first
    if (a.isPreferred && !b.isPreferred) return -1;
    if (!a.isPreferred && b.isPreferred) return 1;

    // Then shifts with start before log
    if (a.isStartBeforeLog && !b.isStartBeforeLog) return -1;
    if (!a.isStartBeforeLog && b.isStartBeforeLog) return 1;

    // Then by difference (closest first)
    // If difference is essentially equal, use priority
    if (Math.abs(a.differenceMinutes - b.differenceMinutes) > 0.1) {
      return a.differenceMinutes - b.differenceMinutes;
    }

    // Finally by Priority
    return (a.sourcePriority || 99) - (b.sourcePriority || 99);
  });
};

/**
 * Check if arrival time is ambiguous (could match multiple shifts)
 * @param {Date} inTime - Employee's in-time
 * @param {Array} candidateShifts - Array of candidate shifts (already sorted by proximity)
 * @param {Number} ambiguityThresholdMinutes - If difference between top candidates is less than this, it's ambiguous (default 30 minutes)
 * @returns {Boolean} - True if arrival is ambiguous
 */
const isAmbiguousArrival = (inTime, candidateShifts, ambiguityThresholdMinutes = 30) => {
  if (candidateShifts.length <= 1) {
    return false; // Single or no candidates - not ambiguous
  }

  // IMPORTANT: If top candidate is preferred (start before log, ≤35 min), it's NOT ambiguous
  // Even if distances are close, preferred shift should win
  if (candidateShifts[0].isPreferred) {
    return false; // Top candidate is preferred - not ambiguous
  }

  // Check if top two candidates are too close in distance
  const topDistance = candidateShifts[0].differenceMinutes;
  const secondDistance = candidateShifts[1].differenceMinutes;

  // If the difference between distances is less than threshold, it's ambiguous
  // BUT only if neither is clearly preferred
  if (Math.abs(secondDistance - topDistance) < ambiguityThresholdMinutes) {
    // If top candidate has start before log and second doesn't, top wins (not ambiguous)
    if (candidateShifts[0].isStartBeforeLog && !candidateShifts[1].isStartBeforeLog) {
      return false; // Top candidate clearly preferred
    }
    return true;
  }

  // Also check if arrival time is roughly equidistant between two shifts
  // Example: 8:40 arrival with 8:00 and 9:00 shifts (40 min late vs 20 min early)
  // BUT: If one shift has start before log and is within 35 min, it's NOT ambiguous
  if (candidateShifts.length >= 2) {
    // If top candidate is preferred, not ambiguous
    if (candidateShifts[0].isPreferred) {
      return false;
    }

    const shift1Start = timeToMinutes(candidateShifts[0].startTime);
    const shift2Start = timeToMinutes(candidateShifts[1].startTime);
    const inMinutes = inTime.getHours() * 60 + inTime.getMinutes();

    // Check if arrival is between two shifts
    const minStart = Math.min(shift1Start, shift2Start);
    const maxStart = Math.max(shift1Start, shift2Start);

    // Handle overnight case
    if (maxStart - minStart > 12 * 60) {
      // Overnight - check if arrival is in the gap
      if ((inMinutes >= minStart && inMinutes <= 23 * 60) || (inMinutes >= 0 && inMinutes <= maxStart)) {
        const distToMin = Math.min(
          Math.abs(inMinutes - minStart),
          24 * 60 - Math.abs(inMinutes - minStart)
        );
        const distToMax = Math.min(
          Math.abs(inMinutes - maxStart),
          24 * 60 - Math.abs(inMinutes - maxStart)
        );

        // If distances are similar AND neither is clearly preferred, it's ambiguous
        if (Math.abs(distToMin - distToMax) < ambiguityThresholdMinutes) {
          // Check if one is clearly preferred
          if (candidateShifts[0].isStartBeforeLog && !candidateShifts[1].isStartBeforeLog) {
            return false; // Top candidate clearly preferred
          }
          return true;
        }
      }
    } else {
      // Same day - check if arrival is between shifts
      if (inMinutes > minStart && inMinutes < maxStart) {
        const distToMin = inMinutes - minStart;
        const distToMax = maxStart - inMinutes;

        // If distances are similar AND neither is clearly preferred, it's ambiguous
        if (Math.abs(distToMin - distToMax) < ambiguityThresholdMinutes) {
          // Check if one is clearly preferred
          if (candidateShifts[0].isStartBeforeLog && !candidateShifts[1].isStartBeforeLog) {
            return false; // Top candidate clearly preferred
          }
          return true;
        }
      }
    }
  }

  return false;
};

/**
 * Use out-time to disambiguate between candidate shifts
 * @param {Date} inTime - Employee's in-time
 * @param {Date} outTime - Employee's out-time
 * @param {Array} candidateShifts - Array of candidate shifts
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date
 * @param {Number} toleranceMinutes - Tolerance for out-time matching (default 60 minutes)
 * @returns {Object|null} - Best matching shift or null if still ambiguous
 */
const disambiguateWithOutTime = (inTime, outTime, candidateShifts, date, toleranceMinutes = 60) => {
  if (!outTime || candidateShifts.length === 0) {
    return null;
  }

  if (candidateShifts.length === 1) {
    return candidateShifts[0]; // Only one candidate - return it
  }

  // Calculate combined score for each candidate (in-time proximity + out-time proximity)
  const scoredCandidates = candidateShifts.map(candidate => {
    const inTimeScore = candidate.differenceMinutes; // Lower is better

    // Calculate out-time proximity to shift end time
    const [shiftEndHour, shiftEndMin] = candidate.endTime.split(':').map(Number);
    const shiftEndDate = new Date(date);
    shiftEndDate.setHours(shiftEndHour, shiftEndMin, 0, 0);

    // Handle overnight shifts - if end time is next day
    const shiftStartMinutes = timeToMinutes(candidate.startTime);
    const shiftEndMinutes = timeToMinutes(candidate.endTime);
    if (shiftEndMinutes < shiftStartMinutes) {
      // Overnight shift - end time is next day
      shiftEndDate.setDate(shiftEndDate.getDate() + 1);
    }

    // Calculate difference between out-time and shift end time
    const outTimeDiffMs = Math.abs(outTime.getTime() - shiftEndDate.getTime());
    const outTimeScore = outTimeDiffMs / (1000 * 60); // Convert to minutes

    // Combined score (weighted: 60% in-time, 40% out-time)
    const combinedScore = (inTimeScore * 0.6) + (outTimeScore * 0.4);

    return {
      ...candidate,
      outTimeScore: outTimeScore,
      combinedScore: combinedScore,
    };
  });

  // Sort by combined score (lower is better)
  scoredCandidates.sort((a, b) => a.combinedScore - b.combinedScore);

  // Check if top candidate is clearly better than second
  if (scoredCandidates.length >= 2) {
    const topScore = scoredCandidates[0].combinedScore;
    const secondScore = scoredCandidates[1].combinedScore;

    // If top candidate is significantly better (more than tolerance difference), use it
    if (secondScore - topScore > toleranceMinutes * 0.5) {
      return scoredCandidates[0];
    }

    // If scores are too close, still ambiguous
    return null;
  }

  return scoredCandidates[0];
};

/**
 * Find matching shifts based on in-time proximity (DEPRECATED - use findCandidateShifts instead)
 * @param {Date} inTime - Employee's in-time
 * @param {Array} shifts - Array of shift objects
 * @returns {Array} - Array of matching shifts with match details
 */
const findMatchingShifts = (inTime, shifts) => {
  // This function is deprecated - use findCandidateShifts instead
  // Keeping for backward compatibility
  const matches = [];

  for (const shift of shifts) {
    const gracePeriod = shift.gracePeriod || 15;

    if (isWithinShiftWindow(inTime, shift.startTime, gracePeriod)) {
      matches.push({
        shiftId: shift._id,
        shiftName: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        gracePeriod: gracePeriod,
        matchReason: `In-time ${inTime.toLocaleTimeString()} matches shift ${shift.name} (${shift.startTime}) with ${gracePeriod}min grace`,
      });
    }
  }

  return matches;
};

/**
 * Find matching shifts based on out-time (for secondary matching)
 * @param {Date} outTime - Employee's out-time
 * @param {Array} shifts - Array of shift objects (already matched by inTime)
 * @param {Number} toleranceMinutes - Tolerance in minutes for matching end time (default 30)
 * @returns {Array} - Array of matching shifts with match details
 */
const findMatchingShiftsByOutTime = (outTime, shifts, toleranceMinutes = 30) => {
  if (!outTime) return [];

  const matches = [];
  const outMinutes = outTime.getHours() * 60 + outTime.getMinutes();

  for (const shift of shifts) {
    const shiftEndMinutes = timeToMinutes(shift.endTime);

    // Calculate difference (handle overnight shifts)
    let difference = Math.abs(outMinutes - shiftEndMinutes);

    // If difference is more than 12 hours, consider it might be next day
    if (difference > 12 * 60) {
      difference = 24 * 60 - difference;
    }

    // If within tolerance, it's a match
    if (difference <= toleranceMinutes) {
      matches.push({
        shiftId: shift._id,
        shiftName: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        differenceMinutes: difference,
        matchReason: `Out-time ${outTime.toLocaleTimeString()} matches shift ${shift.name} end time (${shift.endTime}) with ${difference}min difference`,
      });
    }
  }

  // Sort by closest match (smallest difference)
  return matches.sort((a, b) => a.differenceMinutes - b.differenceMinutes);
};

/**
 * Calculate late-in minutes
 * Handles overnight shifts correctly by considering date context
 * @param {Date} inTime - Actual in-time
 * @param {String} shiftStartTime - Shift start time (HH:mm)
 * @param {Number} gracePeriodMinutes - Grace period in minutes
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date (shift date)
 * @returns {Number} - Minutes late (0 if on time or within grace)
 */
/**
 * Calculate late-in minutes (handles overnight shifts correctly)
 * @param {Date} inTime - Actual in-time
 * @param {String} shiftStartTime - Shift start time (HH:mm)
 * @param {Number} shiftGracePeriod - Grace period from shift definition
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date (shift start date)
 * @param {Number} globalGracePeriod - Global grace period from settings
 * @returns {Number} - Minutes late (0 if on time or within grace period)
 */
const calculateLateIn = (inTime, shiftStartTime, shiftGracePeriod = 15, date = null, globalGracePeriod = null) => {
  if (!inTime) return 0;

  // Priority: Global Settings (dynamic) > Shift Setting > Default 15
  const effectiveGrace = globalGracePeriod !== null ? globalGracePeriod : (shiftGracePeriod || 15);

  const inTimeDate = new Date(inTime);
  const [shiftStartHour, shiftStartMin] = shiftStartTime.split(':').map(Number);
  const shiftStartMinutes = shiftStartHour * 60 + shiftStartMin;

  // Create shift start date based on the attendance date
  let shiftStartDate;
  if (date) {
    // Use the provided date (attendance date = shift start date)
    shiftStartDate = new Date(date + 'T00:00:00');
    shiftStartDate.setHours(shiftStartHour, shiftStartMin, 0, 0);
  } else {
    // Fallback: use in-time's date
    shiftStartDate = new Date(inTimeDate);
    shiftStartDate.setHours(shiftStartHour, shiftStartMin, 0, 0);
  }

  // Check if this is an overnight shift (starts at 20:00 or later)
  const isOvernightShift = shiftStartMinutes >= 20 * 60;
  const inTimeOnly = inTimeDate.getHours() * 60 + inTimeDate.getMinutes();
  const isEarlyMorningInTime = inTimeOnly < 12 * 60; // Before noon

  // Calculate difference from shift start date
  let diffMs = inTimeDate.getTime() - shiftStartDate.getTime();
  let diffMinutes = diffMs / (1000 * 60);

  // Handle overnight shifts - in-time might be on next day
  if (isOvernightShift && date) {
    // For overnight shifts, if in-time is early morning (next day scenario)
    // and difference is negative or very large, adjust calculation
    if (isEarlyMorningInTime && diffMinutes < 0) {
      // In-time is before shift start on same day - this is unusual for overnight shifts
      // Check if in-time is actually for previous day's shift
      const previousDayShiftStart = new Date(shiftStartDate);
      previousDayShiftStart.setDate(previousDayShiftStart.getDate() - 1);
      const prevDayDiffMs = inTimeDate.getTime() - previousDayShiftStart.getTime();
      const prevDayDiffMinutes = prevDayDiffMs / (1000 * 60);

      // Use previous day's calculation if it makes more sense (positive and reasonable)
      if (prevDayDiffMinutes >= 0 && prevDayDiffMinutes < 12 * 60) {
        diffMinutes = prevDayDiffMinutes;
      } else {
        // In-time is before shift start - no late-in
        diffMinutes = 0;
      }
    } else if (isEarlyMorningInTime && diffMinutes > 12 * 60) {
      // Very large difference - might be calculation error, but use as is
      // This handles cases where in-time is way after shift start
    }

    // Apply grace period
    if (diffMinutes <= effectiveGrace) {
      return 0; // On time or within grace period
    }

    const lateIn = Math.round((diffMinutes - effectiveGrace) * 100) / 100;
    console.log(`[LateIn] Overnight: Start=${shiftStartTime}, InTime=${inTimeDate.toISOString()}, Date=${date}, Diff=${diffMinutes.toFixed(2)}min, LateIn=${lateIn}min`);
    return lateIn;
  }

  // Regular same-day shift (or no date provided)
  // If difference is negative, in-time is before shift start - no late-in
  if (diffMinutes < 0) {
    // For overnight shifts without date, check previous day
    if (isOvernightShift) {
      const previousDayShiftStart = new Date(shiftStartDate);
      previousDayShiftStart.setDate(previousDayShiftStart.getDate() - 1);
      const prevDayDiffMs = inTimeDate.getTime() - previousDayShiftStart.getTime();
      const prevDayDiffMinutes = prevDayDiffMs / (1000 * 60);

      if (prevDayDiffMinutes >= 0 && prevDayDiffMinutes < Math.abs(diffMinutes)) {
        diffMinutes = prevDayDiffMinutes;
      } else {
        diffMinutes = 0; // No late-in
      }
    } else {
      diffMinutes = 0; // No late-in
    }
  }

  // Apply grace period
  if (diffMinutes <= effectiveGrace) {
    return 0; // On time or within grace period
  }

  return Math.round((diffMinutes - effectiveGrace) * 100) / 100; // Round to 2 decimals
};

/**
 * Calculate early-out minutes (handles overnight shifts correctly)
 * @param {Date} outTime - Actual out-time
 * @param {String} shiftEndTime - Shift end time (HH:mm)
 * @param {String} shiftStartTime - Shift start time (HH:mm) - needed to detect overnight
 * @param {String} date - Date string (YYYY-MM-DD) - the attendance date (shift start date)
 * @param {Number} globalGracePeriod - Global grace period from settings
 * @returns {Number} - Minutes early (0 if on time or late), null if outTime not provided
 */
const calculateEarlyOut = (outTime, shiftEndTime, shiftStartTime = null, date = null, globalGracePeriod = 15) => {
  if (!outTime) return null;

  const effectiveGrace = globalGracePeriod !== null ? globalGracePeriod : 15;

  const outTimeDate = new Date(outTime);
  const [shiftEndHour, shiftEndMin] = shiftEndTime.split(':').map(Number);
  const shiftEndMinutes = shiftEndHour * 60 + shiftEndMin;
  const shiftStartMinutes = shiftStartTime ? timeToMinutes(shiftStartTime) : null;

  // Check if this is an overnight shift (end time < start time)
  const isOvernight = shiftStartMinutes !== null && shiftEndMinutes < shiftStartMinutes;

  // Create shift end date based on the attendance date
  let shiftEndDate;
  if (date) {
    // Use the provided date (attendance date = shift start date)
    const shiftDate = new Date(date + 'T00:00:00');
    shiftEndDate = new Date(shiftDate);

    if (isOvernight) {
      // For overnight shifts, end time is on the next day relative to shift start
      // Example: Shift starts Dec 6 20:00, ends Dec 7 04:00
      shiftEndDate.setDate(shiftEndDate.getDate() + 1);
    }
    shiftEndDate.setHours(shiftEndHour, shiftEndMin, 0, 0);
  } else {
    // Fallback: use out-time's date
    shiftEndDate = new Date(outTimeDate);
    shiftEndDate.setHours(shiftEndHour, shiftEndMin, 0, 0);

    // For overnight shifts without date, determine if shift end is on same day or next day
    if (isOvernight) {
      const outTimeOnly = outTimeDate.getHours() * 60 + outTimeDate.getMinutes();
      // If out-time is early morning and shift end is also early morning,
      // they might be on the same calendar day
      if (outTimeOnly < 12 * 60 && shiftEndMinutes < 12 * 60) {
        // Both are early morning - if out-time is before shift end, it's early out
        // shiftEndDate is already on same day as out-time
        if (outTimeOnly >= shiftEndMinutes) {
          // Out-time is after shift end on same day - shift end must be next day
          shiftEndDate.setDate(shiftEndDate.getDate() + 1);
        }
      } else {
        // Shift end is early morning, out-time might be on previous day
        // For overnight shifts, shift end is typically next day
        shiftEndDate.setDate(shiftEndDate.getDate() + 1);
      }
    }
  }

  // Calculate difference in milliseconds
  const diffMs = shiftEndDate.getTime() - outTimeDate.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  // Apply grace period
  if (diffMinutes <= effectiveGrace) {
    return 0; // On time or within grace
  }

  const earlyOut = Math.round((diffMinutes - effectiveGrace) * 100) / 100;
  if (isOvernight && date) {
    console.log(`[EarlyOut] Overnight: Start=${shiftStartTime}, End=${shiftEndTime}, OutTime=${outTimeDate.toISOString()}, ShiftEndDate=${shiftEndDate.toISOString()}, Date=${date}, Diff=${diffMinutes.toFixed(2)}min, EarlyOut=${earlyOut}min`);
  }
  return earlyOut;
};

/**
 * Check for out-time on next day for night shifts
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Current date (YYYY-MM-DD)
 * @param {Object} shift - Shift object
 * @returns {Date|null} - Out-time if found on next day
 */
const checkNextDayOutTime = async (employeeNumber, date, shift) => {
  try {
    // Check if shift is overnight (starts at night, ends next morning)
    const [shiftStartHour] = shift.startTime.split(':').map(Number);
    const [shiftEndHour] = shift.endTime.split(':').map(Number);
    const isOvernight = shiftStartHour >= 20 || (shiftStartHour >= 0 && shiftEndHour < shiftStartHour);

    if (!isOvernight) {
      return null; // Not an overnight shift
    }

    // Calculate next day
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;

    // Check next day's attendance record for early out-time
    const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
    const nextDayRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: nextDateStr,
    });

    if (nextDayRecord && nextDayRecord.outTime) {
      const outTime = new Date(nextDayRecord.outTime);
      const outTimeHour = outTime.getHours();

      // If out-time is early morning (before 12 PM), it likely belongs to the night shift
      if (outTimeHour < 12) {
        // Check if this out-time hasn't been assigned to a shift yet or belongs to this night shift
        // We'll return it so it can be used for the night shift calculation
        return outTime;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking next day out-time:', error);
    return null;
  }
};

/**
 * Detect and assign shift to attendance record
 * NEW LOGIC: Always match to closest shift unless ambiguous
 * ConfusedShift only when: same start time with no out-time, or ambiguous arrival
 * @param {String} employeeNumber - Employee number
 * @param {Date} inTime - In-time
 * @param {Date} outTime - Out-time (optional)
 * @param {Object} globalConfig - Global settings (optional)
 * @returns {Object} - Detection result
 */
const detectAndAssignShift = async (employeeNumber, date, inTime, outTime = null, globalConfig = {}) => {
  const globalLateInGrace = globalConfig.late_in_grace_time ?? null;
  const globalEarlyOutGrace = globalConfig.early_out_grace_time ?? null;
  try {
    if (!inTime) {
      return {
        success: false,
        message: 'In-time is required for shift detection',
      };
    }

    // Get shifts for employee
    const { shifts, source, rosteredShiftId, rosterRecordId } = await getShiftsForEmployee(employeeNumber, date);

    // If no out-time provided, check for overnight shift and look for out-time on next day
    if (!outTime && shifts.length > 0) {
      // Check if any shift is a night shift and look for out-time on next day
      for (const shift of shifts) {
        const [shiftStartHour] = shift.startTime.split(':').map(Number);
        if (shiftStartHour >= 20) {
          // This is likely a night shift, check next day for out-time
          const nextDayOutTime = await checkNextDayOutTime(employeeNumber, date, shift);
          if (nextDayOutTime) {
            outTime = nextDayOutTime;
            break; // Use the first found out-time
          }
        }
      }
    }

    if (shifts.length === 0) {
      return {
        success: false,
        message: 'No shifts found for employee',
        assignedShift: null,
      };
    }

    // Helper to update roster record with discipline tracking
    const updateRosterTracking = async (detectedShiftId) => {
      if (rosterRecordId) {
        const PreScheduledShift = require('../model/PreScheduledShift');
        const isDeviation = rosteredShiftId && rosteredShiftId.toString() !== detectedShiftId.toString();
        await PreScheduledShift.findByIdAndUpdate(rosterRecordId, {
          actualShiftId: detectedShiftId,
          isDeviation: !!isDeviation,
          // Note: attendanceDailyId will be updated by the caller after saving the record
        });
      }
    };

    // Step 1: Find candidate shifts by proximity (within 3 hours tolerance)
    const candidateShifts = findCandidateShifts(inTime, shifts, date, 3);

    // Step 2: If no candidates found, still try to match to nearest shift (fallback)
    if (candidateShifts.length === 0) {
      // Find nearest shift regardless of tolerance
      let nearestShift = null;
      let minDifference = Infinity;

      for (const shift of shifts) {
        const difference = calculateTimeDifference(inTime, shift.startTime, date);
        if (difference < minDifference) {
          minDifference = difference;
          nearestShift = shift;
        }
      }

      if (nearestShift) {
        // If no out-time and this is a night shift, check next day
        let actualOutTime = outTime;
        if (!actualOutTime) {
          const [shiftStartHour] = nearestShift.startTime.split(':').map(Number);
          if (shiftStartHour >= 20) {
            const nextDayOutTime = await checkNextDayOutTime(employeeNumber, date, nearestShift);
            if (nextDayOutTime) {
              actualOutTime = nextDayOutTime;
            }
          }
        }

        const lateInMinutes = calculateLateIn(inTime, nearestShift.startTime, nearestShift.gracePeriod || 15, date, globalLateInGrace);
        const earlyOutMinutes = actualOutTime ? calculateEarlyOut(actualOutTime, nearestShift.endTime, nearestShift.startTime, date, globalEarlyOutGrace) : null;

        await updateRosterTracking(nearestShift._id);

        return {
          success: true,
          assignedShift: nearestShift._id,
          shiftName: nearestShift.name,
          shiftStartTime: nearestShift.startTime,
          shiftEndTime: nearestShift.endTime,
          source: `${source}_nearest_fallback`,
          lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
          earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
          isLateIn: lateInMinutes > 0,
          isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
          expectedHours: nearestShift.duration,
          matchMethod: 'nearest_fallback',
          rosterRecordId: rosterRecordId,
        };
      }
    }

    // Step 3: Single candidate - always match it
    if (candidateShifts.length === 1) {
      const candidate = candidateShifts[0];
      const shift = shifts.find(s => s._id.toString() === candidate.shiftId.toString());

      if (!shift) {
        return {
          success: false,
          message: 'Shift not found',
        };
      }

      // If no out-time and this is a night shift, check next day again
      if (!outTime) {
        const [shiftStartHour] = shift.startTime.split(':').map(Number);
        if (shiftStartHour >= 20) {
          const nextDayOutTime = await checkNextDayOutTime(employeeNumber, date, shift);
          if (nextDayOutTime) {
            outTime = nextDayOutTime;
          }
        }
      }

      const lateInMinutes = calculateLateIn(inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
      const earlyOutMinutes = outTime ? calculateEarlyOut(outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace) : null;

      await updateRosterTracking(shift._id);

      return {
        success: true,
        assignedShift: shift._id,
        shiftName: shift.name,
        shiftStartTime: shift.startTime,
        shiftEndTime: shift.endTime,
        source: source,
        lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
        earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
        isLateIn: lateInMinutes > 0,
        isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
        expectedHours: shift.duration,
        matchMethod: 'proximity_single',
        outTimeFoundOnNextDay: outTime && outTime !== inTime, // Flag if we found out-time on next day
        rosterRecordId: rosterRecordId,
      };
    }

    // Step 4: Multiple candidates - check for ambiguity
    if (candidateShifts.length > 1) {
      // Check if all candidates have the same start time
      const allSameStartTime = candidateShifts.every(c => c.startTime === candidateShifts[0].startTime);

      if (allSameStartTime) {
        // Multiple shifts with same start time
        if (!outTime) {
          // No out-time available - create ConfusedShift
          const confusedShiftData = {
            employeeNumber: employeeNumber.toUpperCase(),
            date: date,
            inTime: inTime,
            outTime: outTime,
            possibleShifts: candidateShifts.map(c => ({
              shiftId: c.shiftId,
              shiftName: c.shiftName,
              startTime: c.startTime,
              endTime: c.endTime,
              matchReason: c.matchReason,
            })),
            status: 'pending',
            requiresManualSelection: true,
          };

          await ConfusedShift.findOneAndUpdate(
            { employeeNumber: employeeNumber.toUpperCase(), date: date },
            confusedShiftData,
            { upsert: true, new: true }
          );

          return {
            success: false,
            confused: true,
            message: 'Multiple shifts with same start time - out-time needed to distinguish',
            possibleShifts: candidateShifts,
            requiresManualSelection: true,
          };
        } else {
          // Out-time available - try to disambiguate
          const bestMatch = disambiguateWithOutTime(inTime, outTime, candidateShifts, date);

          if (bestMatch) {
            const shift = shifts.find(s => s._id.toString() === bestMatch.shiftId.toString());
            if (shift) {
              const lateInMinutes = calculateLateIn(inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
              const earlyOutMinutes = calculateEarlyOut(outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace);

              await updateRosterTracking(shift._id);

              return {
                success: true,
                assignedShift: shift._id,
                shiftName: shift.name,
                shiftStartTime: shift.startTime,
                shiftEndTime: shift.endTime,
                source: `${source}_outtime_disambiguated`,
                lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
                earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
                isLateIn: lateInMinutes > 0,
                isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
                expectedHours: shift.duration,
                matchMethod: 'outtime_disambiguated',
                rosterRecordId: rosterRecordId,
              };
            }
          }

          // Still ambiguous even with out-time - create ConfusedShift
          const confusedShiftData = {
            employeeNumber: employeeNumber.toUpperCase(),
            date: date,
            inTime: inTime,
            outTime: outTime,
            possibleShifts: candidateShifts.map(c => ({
              shiftId: c.shiftId,
              shiftName: c.shiftName,
              startTime: c.startTime,
              endTime: c.endTime,
              matchReason: c.matchReason,
            })),
            status: 'pending',
            requiresManualSelection: true,
          };

          await ConfusedShift.findOneAndUpdate(
            { employeeNumber: employeeNumber.toUpperCase(), date: date },
            confusedShiftData,
            { upsert: true, new: true }
          );

          return {
            success: false,
            confused: true,
            message: 'Multiple shifts with same start time - out-time did not help distinguish',
            possibleShifts: candidateShifts,
            requiresManualSelection: true,
          };
        }
      } else {
        // Different start times - check if arrival is ambiguous
        const isAmbiguous = isAmbiguousArrival(inTime, candidateShifts);

        if (isAmbiguous) {
          // Ambiguous arrival - try to use out-time to disambiguate
          if (outTime) {
            const bestMatch = disambiguateWithOutTime(inTime, outTime, candidateShifts, date);

            if (bestMatch) {
              const shift = shifts.find(s => s._id.toString() === bestMatch.shiftId.toString());
              if (shift) {
                const lateInMinutes = calculateLateIn(inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
                const earlyOutMinutes = calculateEarlyOut(outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace);

                await updateRosterTracking(shift._id);

                return {
                  success: true,
                  assignedShift: shift._id,
                  shiftName: shift.name,
                  shiftStartTime: shift.startTime,
                  shiftEndTime: shift.endTime,
                  source: `${source}_outtime_disambiguated`,
                  lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
                  earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
                  isLateIn: lateInMinutes > 0,
                  isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
                  expectedHours: shift.duration,
                  matchMethod: 'outtime_disambiguated_ambiguous',
                  rosterRecordId: rosterRecordId,
                };
              }
            }
          }

          // Still ambiguous - create ConfusedShift
          const confusedShiftData = {
            employeeNumber: employeeNumber.toUpperCase(),
            date: date,
            inTime: inTime,
            outTime: outTime,
            possibleShifts: candidateShifts.map(c => ({
              shiftId: c.shiftId,
              shiftName: c.shiftName,
              startTime: c.startTime,
              endTime: c.endTime,
              matchReason: c.matchReason,
            })),
            status: 'pending',
            requiresManualSelection: true,
          };

          await ConfusedShift.findOneAndUpdate(
            { employeeNumber: employeeNumber.toUpperCase(), date: date },
            confusedShiftData,
            { upsert: true, new: true }
          );

          return {
            success: false,
            confused: true,
            message: outTime
              ? 'Ambiguous arrival time - out-time did not help distinguish'
              : 'Ambiguous arrival time - out-time needed to distinguish',
            possibleShifts: candidateShifts,
            requiresManualSelection: true,
          };
        } else {
          // Not ambiguous - match to closest shift
          const bestMatch = candidateShifts[0];
          const shift = shifts.find(s => s._id.toString() === bestMatch.shiftId.toString());

          if (shift) {
            const lateInMinutes = calculateLateIn(inTime, shift.startTime, shift.gracePeriod || 15, date, globalLateInGrace);
            const earlyOutMinutes = outTime ? calculateEarlyOut(outTime, shift.endTime, shift.startTime, date, globalEarlyOutGrace) : null;

            await updateRosterTracking(shift._id);

            return {
              success: true,
              assignedShift: shift._id,
              shiftName: shift.name,
              shiftStartTime: shift.startTime,
              shiftEndTime: shift.endTime,
              source: source,
              lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
              earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
              isLateIn: lateInMinutes > 0,
              isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
              expectedHours: shift.duration,
              matchMethod: 'proximity_closest',
              rosterRecordId: rosterRecordId,
            };
          }
        }
      }
    }

    // Fallback: Should not reach here, but if we do, return error
    return {
      success: false,
      message: 'Unexpected error in shift detection',
    };

  } catch (error) {
    console.error('Error in shift detection:', error);
    return {
      success: false,
      message: error.message || 'Error detecting shift',
    };
  }
};

/**
 * Manually assign shift to confused record
 * @param {String} confusedShiftId - Confused shift record ID
 * @param {String} shiftId - Shift ID to assign
 * @param {String} userId - User ID who is assigning
 * @param {String} comments - Optional comments
 * @returns {Object} - Result
 */
const resolveConfusedShift = async (confusedShiftId, shiftId, userId, comments = null) => {
  try {
    const confusedShift = await ConfusedShift.findById(confusedShiftId);
    if (!confusedShift) {
      return {
        success: false,
        message: 'Confused shift record not found',
      };
    }

    if (confusedShift.status !== 'pending') {
      return {
        success: false,
        message: 'This record has already been resolved',
      };
    }

    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return {
        success: false,
        message: 'Shift not found',
      };
    }

    // Update confused shift
    confusedShift.assignedShiftId = shiftId;
    confusedShift.status = 'resolved';
    confusedShift.reviewedBy = userId;
    confusedShift.reviewedAt = new Date();
    confusedShift.reviewComments = comments;

    await confusedShift.save();

    // Update attendance record
    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: confusedShift.employeeNumber,
      date: confusedShift.date,
    });

    if (attendanceRecord) {
      // Fetch global general settings
      const generalConfig = await Settings.getSettingsByCategory('general');
      const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
      const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

      const lateInMinutes = calculateLateIn(confusedShift.inTime, shift.startTime, shift.gracePeriod || 15, confusedShift.date, globalLateInGrace);
      const earlyOutMinutes = confusedShift.outTime
        ? calculateEarlyOut(confusedShift.outTime, shift.endTime, shift.startTime, confusedShift.date, globalEarlyOutGrace)
        : null;

      attendanceRecord.shiftId = shiftId;
      attendanceRecord.lateInMinutes = lateInMinutes > 0 ? lateInMinutes : null;
      attendanceRecord.earlyOutMinutes = earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null;
      attendanceRecord.isLateIn = lateInMinutes > 0;
      attendanceRecord.isEarlyOut = earlyOutMinutes && earlyOutMinutes > 0;
      attendanceRecord.expectedHours = shift.duration;

      await attendanceRecord.save();
    }

    return {
      success: true,
      message: 'Shift assigned successfully',
      data: confusedShift,
    };

  } catch (error) {
    console.error('Error resolving confused shift:', error);
    return {
      success: false,
      message: error.message || 'Error resolving confused shift',
    };
  }
};

/**
 * Sync shifts for existing attendance records that don't have shifts assigned
 * @param {String} startDate - Start date (optional)
 * @param {String} endDate - End date (optional)
 * @returns {Object} - Sync statistics
 */
const syncShiftsForExistingRecords = async (startDate = null, endDate = null) => {
  const stats = {
    success: false,
    processed: 0,
    assigned: 0,
    confused: 0,
    errors: [],
    message: '',
  };

  try {
    // Build query for records without shiftId
    const query = { shiftId: { $exists: false } };

    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    // Get all attendance records without shifts
    const records = await AttendanceDaily.find(query).sort({ date: -1 });

    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');

    stats.processed = records.length;

    for (const record of records) {
      try {
        if (!record.inTime) {
          // No in-time, skip
          continue;
        }

        // Detect and assign shift
        const result = await detectAndAssignShift(
          record.employeeNumber,
          record.date,
          record.inTime,
          record.outTime || null,
          generalConfig
        );

        if (result.success && result.assignedShift) {
          // Update record with shift assignment
          record.shiftId = result.assignedShift;
          record.lateInMinutes = result.lateInMinutes;
          record.earlyOutMinutes = result.earlyOutMinutes;
          record.isLateIn = result.isLateIn || false;
          record.isEarlyOut = result.isEarlyOut || false;
          record.expectedHours = result.expectedHours;

          await record.save();
          stats.assigned++;
        } else if (result.confused) {
          // Confused shift record already created by detectAndAssignShift
          stats.confused++;
        }

      } catch (error) {
        stats.errors.push(`Error processing ${record.employeeNumber} on ${record.date}: ${error.message}`);
        console.error(`Error processing record ${record._id}:`, error);
      }
    }

    stats.success = true;
    stats.message = `Processed ${stats.processed} records: ${stats.assigned} assigned, ${stats.confused} flagged for review`;

  } catch (error) {
    console.error('Error in syncShiftsForExistingRecords:', error);
    stats.errors.push(error.message);
    stats.message = 'Error syncing shifts';
  }

  return stats;
};

/**
 * Auto-assign nearest shift based on in-time
 * This is a separate function that finds the shift with start time closest to the in-time
 * Used for confused shifts auto-assignment
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @param {Date} inTime - In-time
 * @param {Date} outTime - Out-time (optional)
 * @returns {Object} - Assignment result
 */
const autoAssignNearestShift = async (employeeNumber, date, inTime, outTime = null) => {
  try {
    if (!inTime) {
      return {
        success: false,
        message: 'In-time is required for auto-assignment',
      };
    }

    // Get all available shifts (not just possible ones)
    const { shifts } = await getShiftsForEmployee(employeeNumber, date);

    if (shifts.length === 0) {
      return {
        success: false,
        message: 'No shifts available for auto-assignment',
      };
    }

    // Use the existing findCandidateShifts logic which handles:
    // 1. Proximity matching (preferred shifts within 35 min)
    // 2. Start-before-log preference
    // 3. Source priority tie-breaking (Designation > Department > Division > Global)
    const candidates = findCandidateShifts(inTime, shifts, date);

    if (candidates.length === 0) {
      return {
        success: false,
        message: 'No matching shifts found within tolerance',
      };
    }

    // Get the best candidate (already sorted by preference + priority)
    const bestCandidate = candidates[0];
    const nearestShift = shifts.find(s => s._id.toString() === bestCandidate.shiftId.toString());

    if (!nearestShift) {
      return {
        success: false,
        message: 'Could not find nearest shift',
      };
    }

    // Fetch global general settings
    const generalConfig = await Settings.getSettingsByCategory('general');
    const globalLateInGrace = generalConfig.late_in_grace_time ?? null;
    const globalEarlyOutGrace = generalConfig.early_out_grace_time ?? null;

    // Calculate late-in and early-out
    const lateInMinutes = calculateLateIn(inTime, nearestShift.startTime, nearestShift.gracePeriod || 15, date, globalLateInGrace);
    const earlyOutMinutes = outTime ? calculateEarlyOut(outTime, nearestShift.endTime, nearestShift.startTime, date, globalEarlyOutGrace) : null;

    return {
      success: true,
      assignedShift: nearestShift._id,
      shiftName: nearestShift.name,
      shiftStartTime: nearestShift.startTime,
      shiftEndTime: nearestShift.endTime,
      source: 'auto_assign_nearest',
      sourcePriority: nearestShift.sourcePriority || 99,
      lateInMinutes: lateInMinutes > 0 ? lateInMinutes : null,
      earlyOutMinutes: earlyOutMinutes && earlyOutMinutes > 0 ? earlyOutMinutes : null,
      isLateIn: lateInMinutes > 0,
      isEarlyOut: earlyOutMinutes && earlyOutMinutes > 0,
      expectedHours: nearestShift.duration,
      differenceMinutes: bestCandidate.differenceMinutes,
      isPreferred: bestCandidate.isPreferred,
    };

  } catch (error) {
    console.error('Error in auto-assign nearest shift:', error);
    return {
      success: false,
      message: error.message || 'Error auto-assigning nearest shift',
    };
  }
};

module.exports = {
  detectAndAssignShift,
  resolveConfusedShift,
  getShiftsForEmployee,
  findMatchingShifts,
  findMatchingShiftsByOutTime,
  findCandidateShifts,
  isAmbiguousArrival,
  disambiguateWithOutTime,
  calculateTimeDifference,
  calculateLateIn,
  calculateEarlyOut,
  isWithinShiftWindow,
  syncShiftsForExistingRecords,
  syncShiftsForExistingRecords,
  autoAssignNearestShift,
  timeToMinutes
};

