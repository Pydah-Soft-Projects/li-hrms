/**
 * Extra Hours Detection Service
 * Automatically detects extra hours worked beyond shift end time (without OT request)
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const Shift = require('../../shifts/model/Shift');
const { calculateMonthlySummary } = require('./summaryCalculationService');
const { createISTDate } = require('../../shared/utils/dateUtils');

/**
 * Detect and update extra hours for an attendance record
 * @param {String} employeeNumber - Employee number
 * @param {String} date - Date (YYYY-MM-DD)
 * @returns {Object} - Result
 */
const detectExtraHours = async (employeeNumber, date) => {
  try {
    // Validate date format (should be YYYY-MM-DD)
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error(`[ExtraHours] Invalid date format: ${date}. Expected YYYY-MM-DD`);
      return {
        success: false,
        message: `Invalid date format: ${date}. Expected YYYY-MM-DD`,
      };
    }

    const attendanceRecord = await AttendanceDaily.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
    }).populate('shifts.shiftId');

    if (!attendanceRecord) {
      console.log(`[ExtraHours] Attendance record not found for ${employeeNumber} on ${date}`);
      return {
        success: false,
        message: 'Attendance record not found',
      };
    }

    // Need both shift and outTime to calculate extra hours
    // For extra hours calculation, we look at the last shift of the day
    const lastShift = attendanceRecord.shifts && attendanceRecord.shifts.length > 0
      ? attendanceRecord.shifts[attendanceRecord.shifts.length - 1]
      : null;

    if (!lastShift || !lastShift.shiftId) {
      console.log(`[ExtraHours] No shifts or no shiftId assigned for ${employeeNumber} on ${date}`);
      return {
        success: false,
        message: 'Shift not assigned',
        extraHours: 0,
      };
    }

    if (!lastShift.outTime) {
      console.log(`[ExtraHours] No out time for ${employeeNumber} on ${date}`);
      return {
        success: false,
        message: 'Out time not available',
        extraHours: 0,
      };
    }

    const shift = lastShift.shiftId;
    const outTimeDate = new Date(lastShift.outTime);

    // Use centralized helper to get shift end time in IST context

    const [startH, startM] = shift.startTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);

    // Determine if overnight: Start > End (e.g., 22:00 > 06:00)
    const isOvernight = (startH * 60 + startM) > (endH * 60 + endM);

    let shiftEndDate = createISTDate(date, shift.endTime);
    if (isOvernight) {
      shiftEndDate.setDate(shiftEndDate.getDate() + 1);
    }

    const gracePeriodMinutes = shift.gracePeriod || 15;
    const shiftEndWithGrace = new Date(shiftEndDate);
    shiftEndWithGrace.setMinutes(shiftEndWithGrace.getMinutes() + gracePeriodMinutes);

    const shiftEndWithGraceTimestamp = shiftEndWithGrace.getTime();
    const outTimeTimestamp = outTimeDate.getTime();

    console.log(`[ExtraHours] ========================================`);
    console.log(`[ExtraHours] Employee: ${employeeNumber}, Attendance Date: ${date}`);
    console.log(`[ExtraHours] Shift: ${shift.startTime} - ${shift.endTime}, Overnight: ${isOvernight}`);
    console.log(`[ExtraHours] Grace Period: ${gracePeriodMinutes} minutes`);
    console.log(`[ExtraHours] Shift End (IST Context): ${shiftEndDate.toISOString()}`);
    console.log(`[ExtraHours] Out Time: ${outTimeDate.toISOString()}`);
    console.log(`[ExtraHours] Result: ${outTimeTimestamp > shiftEndWithGraceTimestamp ? 'EXTRA HOURS DETECTED' : 'NO EXTRA HOURS'}`);
    console.log(`[ExtraHours] ========================================`);

    if (outTimeTimestamp > shiftEndWithGraceTimestamp) {
      const diffMs = outTimeTimestamp - shiftEndWithGraceTimestamp;
      let extraHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

      // SANITY CHECK: Excel 1899/2026 date mismatch can cause millions of hours
      // We cap extra hours at 16 hours. Anything more is likely a data error.
      if (extraHours > 16) {
        console.warn(`[ExtraHours] ⚠️ Absurd extra hours detected (${extraHours}). Capping to 0 to prevent data corruption. Check date mismatch.`);
        extraHours = 0;
      }

      console.log(`[ExtraHours] ✓ Extra hours calculated: ${extraHours} hours (${Math.round(diffMs / (1000 * 60))} minutes after grace period)`);
      console.log(`[ExtraHours] Current extraHours in record: ${attendanceRecord.extraHours || 0}`);
      console.log(`[ExtraHours] Current otHours in record: ${attendanceRecord.otHours || 0}`);

      // Only update if extra hours > 0 and no OT hours already set
      // (OT hours take precedence - if OT is approved, don't count as extra hours)
      if (extraHours > 0 && (!attendanceRecord.otHours || attendanceRecord.otHours === 0)) {
        const previousExtraHours = attendanceRecord.extraHours || 0;

        // Only update if the value has changed
        if (Math.abs(previousExtraHours - extraHours) > 0.01) {
          attendanceRecord.extraHours = extraHours;
          attendanceRecord.markModified('extraHours'); // Ensure Mongoose recognizes the change
          await attendanceRecord.save();

          console.log(`[ExtraHours] ✓ Updated extra hours from ${previousExtraHours} to ${extraHours}`);
        } else {
          console.log(`[ExtraHours] Extra hours unchanged: ${extraHours} (already set to ${previousExtraHours})`);
        }

        // Recalculate monthly summary
        const [year, month] = date.split('-').map(Number);

        const Employee = require('../../employees/model/Employee');
        const employee = await Employee.findOne({ emp_no: attendanceRecord.employeeNumber, is_active: { $ne: false } });

        if (employee) {
          await calculateMonthlySummary(employee._id, employee.emp_no, year, month);
        }

        return {
          success: true,
          message: 'Extra hours detected and updated',
          extraHours: extraHours,
        };
      }

      return {
        success: true,
        message: 'Extra hours detected but not updated (OT hours exist or zero)',
        extraHours: extraHours,
        updated: false,
      };
    }

    // No extra hours - outTime is before or equal to shift end + grace period
    console.log(`[ExtraHours] No extra hours: OutTime (${outTimeDate.toISOString()}) <= ShiftEnd+Grace (${shiftEndWithGrace.toISOString()})`);

    if (attendanceRecord.extraHours > 0) {
      // Clear extra hours if outTime is now before shift end + grace period
      console.log(`[ExtraHours] Clearing existing extra hours: ${attendanceRecord.extraHours}`);
      attendanceRecord.extraHours = 0;
      await attendanceRecord.save();

      // Recalculate monthly summary
      const [year, month] = date.split('-').map(Number);

      const Employee = require('../../employees/model/Employee');
      const employee = await Employee.findOne({ emp_no: attendanceRecord.employeeNumber, is_active: { $ne: false } });

      if (employee) {
        await calculateMonthlySummary(employee._id, employee.emp_no, year, month);
      }
    }

    return {
      success: true,
      message: 'No extra hours detected',
      extraHours: 0,
    };

  } catch (error) {
    console.error('Error detecting extra hours:', error);
    return {
      success: false,
      message: error.message || 'Error detecting extra hours',
    };
  }
};

/**
 * Add or subtract days from YYYY-MM-DD (local date, no timezone shift)
 * @param {String} dateStr - YYYY-MM-DD
 * @param {Number} delta - days to add (positive) or subtract (negative)
 * @returns {String} YYYY-MM-DD
 */
function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dObj = new Date(y, m - 1, d);
  dObj.setDate(dObj.getDate() + delta);
  return `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
}

/**
 * Run extra hours detection only for the given (employeeNumber, date) pairs.
 * Optionally includes yesterday and tomorrow for each date (e.g. for overnight shifts).
 * Use this after sync/upload so only affected employees and dates are processed (faster).
 * @param {Array<{ employeeNumber: string, date: string }>} entries - e.g. from rawLogs: { employeeNumber, date }
 * @param {Object} options - { includeAdjacentDays: boolean } - if true, also run for date-1 and date+1 per entry
 * @returns {Object} - Statistics
 */
const detectExtraHoursForEmployeeDates = async (entries, options = {}) => {
  const { includeAdjacentDays = true } = options;
  const stats = {
    success: false,
    processed: 0,
    updated: 0,
    errors: [],
    message: '',
  };

  if (!entries || entries.length === 0) {
    stats.success = true;
    stats.message = 'No entries to process';
    return stats;
  }

  const set = new Set();
  for (const e of entries) {
    const emp = (e.employeeNumber || '').toUpperCase();
    const date = e.date || (e.timestamp ? new Date(e.timestamp).toISOString().slice(0, 10) : null);
    if (!emp || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    set.add(`${emp}|${date}`);
    if (includeAdjacentDays) {
      set.add(`${emp}|${addDays(date, -1)}`);
      set.add(`${emp}|${addDays(date, 1)}`);
    }
  }

  const pairs = [...set].map(key => {
    const [employeeNumber, date] = key.split('|');
    return { employeeNumber, date };
  });
  stats.processed = pairs.length;

  try {
    for (const { employeeNumber, date } of pairs) {
      try {
        const result = await detectExtraHours(employeeNumber, date);
        if (result.success && result.updated !== false) {
          stats.updated++;
        }
      } catch (error) {
        stats.errors.push(`Error processing ${employeeNumber} on ${date}: ${error.message}`);
        console.error(`[ExtraHours] Error processing ${employeeNumber} on ${date}:`, error);
      }
    }
    stats.success = true;
    stats.message = `Processed ${stats.processed} records: ${stats.updated} updated with extra hours`;
  } catch (error) {
    console.error('Error in detectExtraHoursForEmployeeDates:', error);
    stats.errors.push(error.message);
    stats.message = 'Error detecting extra hours for employee dates';
  }

  return stats;
};

/**
 * Batch detect extra hours for multiple records (all employees in date range).
 * Prefer detectExtraHoursForEmployeeDates when you only have specific employees/dates.
 * @param {String} startDate - Start date (optional)
 * @param {String} endDate - End date (optional)
 * @returns {Object} - Statistics
 */
const batchDetectExtraHours = async (startDate = null, endDate = null) => {
  const stats = {
    success: false,
    processed: 0,
    updated: 0,
    errors: [],
    message: '',
  };

  try {
    const query = {
      outTime: { $exists: true, $ne: null },
      shiftId: { $exists: true, $ne: null },
    };

    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const records = await AttendanceDaily.find(query)
      .populate('shifts.shiftId')
      .sort({ date: -1 });

    stats.processed = records.length;

    for (const record of records) {
      try {
        const result = await detectExtraHours(record.employeeNumber, record.date);
        if (result.success && result.updated !== false) {
          stats.updated++;
        }
      } catch (error) {
        stats.errors.push(`Error processing ${record.employeeNumber} on ${record.date}: ${error.message}`);
        console.error(`Error processing record ${record._id}:`, error);
      }
    }

    stats.success = true;
    stats.message = `Processed ${stats.processed} records: ${stats.updated} updated with extra hours`;

  } catch (error) {
    console.error('Error in batch detect extra hours:', error);
    stats.errors.push(error.message);
    stats.message = 'Error batch detecting extra hours';
  }

  return stats;
};

module.exports = {
  detectExtraHours,
  detectExtraHoursForEmployeeDates,
  batchDetectExtraHours,
};

