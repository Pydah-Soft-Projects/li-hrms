/**
 * Attendance Sync Service
 * Handles syncing attendance logs from MSSQL to MongoDB
 * Processes raw logs and aggregates into daily records
 */

const AttendanceRawLog = require('../model/AttendanceRawLog');
const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceSettings = require('../model/AttendanceSettings');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');
const { fetchAttendanceLogsSQL } = require('../config/attendanceSQLHelper');
const Employee = require('../../employees/model/Employee');
const OD = require('../../leaves/model/OD');
const { detectAndAssignShift } = require('../../shifts/services/shiftDetectionService');
const { detectExtraHours } = require('./extraHoursService');
const Settings = require('../../settings/model/Settings');

const MAX_PAIRING_WINDOW_HOURS = 25; // Maximum allowed duration for a shift (prevents multi-day jumps)

/**
 * Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Process raw logs and aggregate into daily records
 * NEW APPROACH: Process logs chronologically to correctly pair IN/OUT across days
 * @param {Array} rawLogs - Array of raw log objects
 * @param {Boolean} previousDayLinking - Whether to enable previous day linking (deprecated, using chronological approach)
 * @returns {Object} Statistics of processed records
 */
const processAndAggregateLogs = async (rawLogs, previousDayLinking = false, skipInsertion = false) => {
  const stats = {
    rawLogsInserted: 0,
    rawLogsSkipped: 0,
    dailyRecordsCreated: 0,
    dailyRecordsUpdated: 0,
    errors: [],
  };

  try {
    // Fetch global general settings (for grace periods, etc.)
    const generalConfig = await Settings.getSettingsByCategory('general');

    // First, insert all raw logs (Duplicate prevention)
    // SKIP if explicitly requested (e.g. from RealTime Controller which already saves)
    if (!skipInsertion) {
      for (const log of rawLogs) {
        try {
          const date = formatDate(log.timestamp);
          const logData = {
            employeeNumber: log.employeeNumber,
            timestamp: new Date(log.timestamp),
            type: log.type,
            source: log.source || 'mssql',
            date: date,
            rawData: log.rawData,
          };

          // Try to insert (will fail if duplicate due to unique index)
          try {
            await AttendanceRawLog.create(logData);
            stats.rawLogsInserted++;
          } catch (error) {
            if (error.code === 11000) {
              // Duplicate - skip
              stats.rawLogsSkipped++;
            } else {
              throw error;
            }
          }
        } catch (error) {
          stats.errors.push(`Error processing log for ${log.employeeNumber}: ${error.message}`);
        }
      }
    }


    // NEW APPROACH: Group logs by employee, then process chronologically
    const logsByEmployee = {};

    // Fetch all logs for employees involved (to get complete picture across days)
    const employeeNumbers = [...new Set(rawLogs.map(log => log.employeeNumber.toUpperCase()))];

    for (const empNo of employeeNumbers) {
      // Get all logs for this employee from database (chronologically sorted)
      // We need a date range - use the dates from rawLogs
      const dates = [...new Set(rawLogs.filter(l => l.employeeNumber.toUpperCase() === empNo).map(l => formatDate(l.timestamp)))];
      const minDate = dates.sort()[0];
      const maxDate = dates.sort()[dates.length - 1];

      // Extend range by 1 day on each side to catch overnight shifts
      const minDateObj = new Date(minDate);
      minDateObj.setDate(minDateObj.getDate() - 1);
      const maxDateObj = new Date(maxDate);
      maxDateObj.setDate(maxDateObj.getDate() + 1);

      const allLogs = await AttendanceRawLog.find({
        employeeNumber: empNo,
        date: {
          $gte: formatDate(minDateObj),
          $lte: formatDate(maxDateObj),
        },
        timestamp: { $gte: new Date('2020-01-01') }, // Ignore ancient logs (1899/1900)
        type: { $in: ['IN', 'OUT'] }, // CRITICAL: Only process IN/OUT logs, exclude null-type (BREAK/OT)
      }).sort({ timestamp: 1 }); // Sort chronologically

      logsByEmployee[empNo] = allLogs.map(log => ({
        timestamp: new Date(log.timestamp),
        type: log.type,
        _id: log._id,
      }));
    }

    // NEW APPROACH: Process logs chronologically to pair IN/OUT correctly
    for (const [employeeNumber, logs] of Object.entries(logsByEmployee)) {
      try {
        // Fetch employee to get ID for OD and settings lookup
        const employee = await Employee.findOne({ emp_no: employeeNumber.toUpperCase() }).select('_id');
        const employeeId = employee ? employee._id : null;

        // Logs are already sorted chronologically
        const pairedRecords = [];
        const usedOutLogs = new Set(); // Track which OUT logs have been used

        // Process each log chronologically
        for (let i = 0; i < logs.length; i++) {
          const currentLog = logs[i];
          console.log(`[SyncDebug] Processing log ${i}: Time=${currentLog.timestamp}, Type=${currentLog.type}`);

          // Skip if this is an OUT log that's already been paired
          if (usedOutLogs.has(i)) {
            continue;
          }

          // If this is an IN log, find its matching OUT
          if (currentLog.type === 'IN') {
            const inTime = currentLog.timestamp;
            const inDate = formatDate(inTime);
            const inTimeOnly = inTime.getHours() * 60 + inTime.getMinutes();

            let outTime = null;
            let outIndex = -1;

            // Look for OUT log starting from next log
            for (let j = i + 1; j < logs.length; j++) {
              if (usedOutLogs.has(j)) {
                continue; // Skip already used OUT logs
              }

              const candidateLog = logs[j];

              // CRITICAL: Duplicate Pulse Detection
              // If timestamps are identical, treat as the same pulse (ignore)
              if (candidateLog.timestamp.getTime() === inTime.getTime()) {
                continue;
              }

              // CRITICAL: Stop-at-next-IN (Strict Serial Pairing)
              // If we encounter another IN log before finding an OUT, this means the previous IN was a partial punch (forgot to punch out)
              // We stop searching immediately to prevent "jumping" over days
              if (candidateLog.type === 'IN') {
                console.log(`[SyncDebug] Found new IN at ${candidateLog.timestamp} before OUT. Closing search for ${inTime}.`);
                break;
              }

              // CRITICAL: Max Duration Safeguard
              // If the candidate log is beyond the max window, it's too far away to be a valid pair
              const diffHours = (candidateLog.timestamp - inTime) / (1000 * 60 * 60);
              if (diffHours > MAX_PAIRING_WINDOW_HOURS) {
                console.log(`[SyncDebug] Candidate log at ${candidateLog.timestamp} is ${diffHours.toFixed(1)}h away (Max ${MAX_PAIRING_WINDOW_HOURS}h). Stopping search.`);
                break;
              }

              if (candidateLog.type === 'OUT') {
                const candidateOutTime = candidateLog.timestamp;
                const candidateOutDate = formatDate(candidateOutTime);
                const candidateOutTimeOnly = candidateOutTime.getHours() * 60 + candidateOutTime.getMinutes();

                // Check if this OUT is on same day
                if (candidateOutDate === inDate) {
                  // Same day OUT
                  if (candidateOutTimeOnly > inTimeOnly) {
                    // Valid same-day pair: OUT time > IN time
                    outTime = candidateOutTime;
                    outIndex = j;
                    console.log(`[SyncDebug] Found Same-Day Pair: IN=${inTime}, OUT=${outTime}`);
                    break;
                  } else {
                    // OUT time < IN time on same day - this is overnight, check next day
                    // Continue to next day check
                  }
                } else {
                  // OUT is on different day (next day)
                  // Check if next day has IN log
                  let nextDayHasIN = false;
                  let nextDayINTime = null;

                  for (let k = j; k < logs.length; k++) {
                    const nextLog = logs[k];
                    const nextLogDate = formatDate(nextLog.timestamp);
                    if (nextLogDate === candidateOutDate) {
                      if (nextLog.type === 'IN') {
                        nextDayHasIN = true;
                        nextDayINTime = nextLog.timestamp;
                        break;
                      }
                    } else if (nextLogDate > candidateOutDate) {
                      break; // Past the candidate date
                    }
                  }

                  // If next day has IN, check if OUT < IN
                  if (nextDayHasIN && nextDayINTime) {
                    const nextDayINTimeOnly = nextDayINTime.getHours() * 60 + nextDayINTime.getMinutes();
                    if (candidateOutTimeOnly < nextDayINTimeOnly) {
                      // OUT is before IN on next day - this OUT belongs to previous day's shift
                      outTime = candidateOutTime;
                      outIndex = j;
                      break;
                    }
                    // If OUT >= IN on next day, this OUT belongs to next day, not current IN
                    // Continue searching
                  } else {
                    // Next day has no IN - this OUT likely belongs to current IN (overnight shift)
                    outTime = candidateOutTime;
                    outIndex = j;
                    break;
                  }
                }
              }
            }

            // Create attendance record
            const shiftDate = inDate; // Shift date is always IN date

            // Calculate total hours worked
            let totalHours = null;
            if (inTime && outTime) {
              const diffMs = outTime.getTime() - inTime.getTime();
              totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
            }

            // Get approved OD hours for this day to count towards total work
            let odHours = 0;
            if (employeeId) {
              const dayStart = new Date(shiftDate);
              dayStart.setHours(0, 0, 0, 0);
              const dayEnd = new Date(shiftDate);
              dayEnd.setHours(23, 59, 59, 999);

              const approvedODs = await OD.find({
                employeeId,
                status: 'approved',
                $or: [
                  { fromDate: { $lte: dayEnd }, toDate: { $gte: dayStart } }
                ],
                isActive: true
              });

              for (const od of approvedODs) {
                if (od.odType_extended === 'hours') {
                  odHours += od.durationHours || 0;
                } else if (od.odType_extended === 'half_day' || od.isHalfDay) {
                  // If it's a half-day OD, we assume it covers 50% of a standard day (e.g. 4.5h)
                  odHours += 4.5;
                } else {
                  // Full day OD covers full shift (e.g. 9h)
                  odHours += 9;
                }
              }
            }

            // Detect and assign shift
            let shiftAssignment = null;
            if (inTime) {
              try {
                shiftAssignment = await detectAndAssignShift(employeeNumber, shiftDate, inTime, outTime, generalConfig);
              } catch (shiftError) {
                console.error(`Error detecting shift for ${employeeNumber} on ${shiftDate}:`, shiftError);
              }
            }

            // Determine status based on total hours + OD hours vs shift duration
            // Threshold: 70% of expected hours (Working + OD)
            let status = outTime ? 'PRESENT' : 'PARTIAL';
            if (outTime && shiftAssignment && shiftAssignment.success && shiftAssignment.expectedHours) {
              const effectiveHours = (totalHours || 0) + odHours;
              const threshold = shiftAssignment.expectedHours * 0.7;

              if (effectiveHours < threshold) {
                status = 'HALF_DAY';
                console.log(`[HalfDayDetection] Marked ${employeeNumber} as HALF_DAY on ${shiftDate}. Effective: ${effectiveHours}h, Threshold: ${threshold}h (70% of ${shiftAssignment.expectedHours}h)`);
              } else {
                status = 'PRESENT';
              }
            }

            // Prepare update data
            const updateData = {
              inTime,
              outTime,
              totalHours,
              odHours, // Include OD hours for status calculation in pre-save hook
              status,
              lastSyncedAt: new Date(),
            };

            // Add shift-related fields if shift was assigned
            if (shiftAssignment && shiftAssignment.success && shiftAssignment.assignedShift) {
              updateData.shiftId = shiftAssignment.assignedShift;
              updateData.lateInMinutes = shiftAssignment.lateInMinutes;
              updateData.earlyOutMinutes = shiftAssignment.earlyOutMinutes;
              updateData.isLateIn = shiftAssignment.isLateIn || false;
              updateData.isEarlyOut = shiftAssignment.isEarlyOut || false;
              updateData.expectedHours = shiftAssignment.expectedHours;
            }

            // Create or update daily record
            console.log(`[SyncDebug] Updating Daily Record: Emp=${employeeNumber}, Date=${shiftDate}, IN=${inTime}, OUT=${outTime}, Shift=${updateData.shiftId}`);
            const dailyRecord = await AttendanceDaily.findOneAndUpdate(
              { employeeNumber, date: shiftDate },
              {
                $set: updateData,
                $addToSet: { source: 'mssql' },
              },
              { upsert: true, new: true }
            );

            // Update roster tracking with attendance record link
            if (dailyRecord && shiftAssignment && shiftAssignment.rosterRecordId) {
              await PreScheduledShift.findByIdAndUpdate(shiftAssignment.rosterRecordId, {
                attendanceDailyId: dailyRecord._id
              });
            }

            // Mark OUT log as used
            if (outIndex >= 0) {
              usedOutLogs.add(outIndex);
            }

            // Clean up: If out-time is on next day, ensure next day doesn't have duplicate record
            if (outTime) {
              const outDateStr = formatDate(outTime);
              if (outDateStr !== shiftDate) {
                const nextDayRecord = await AttendanceDaily.findOne({
                  employeeNumber,
                  date: outDateStr,
                });

                // If next day has only OUT (no IN), it's a duplicate - remove it
                if (nextDayRecord && !nextDayRecord.inTime && nextDayRecord.outTime) {
                  const nextDayOutTimeStr = formatDate(nextDayRecord.outTime);
                  const currentOutTimeStr = formatDate(outTime);
                  if (nextDayOutTimeStr === currentOutTimeStr) {
                    await AttendanceDaily.deleteOne({ _id: nextDayRecord._id });
                  }
                }
              }
            }

            // IMPORTANT: Detect extra hours after creating/updating the record
            // This ensures extra hours are calculated when attendance is uploaded via Excel
            if (dailyRecord && dailyRecord.outTime && dailyRecord.shiftId) {
              try {
                console.log(`[AttendanceSync] Detecting extra hours for ${employeeNumber} on ${shiftDate}`);
                await detectExtraHours(employeeNumber, shiftDate);
              } catch (extraHoursError) {
                console.error(`[AttendanceSync] Error detecting extra hours for ${employeeNumber} on ${shiftDate}:`, extraHoursError);
                // Don't fail the entire process if extra hours detection fails
              }
            }

            if (dailyRecord.isNew) {
              stats.dailyRecordsCreated++;
            } else {
              stats.dailyRecordsUpdated++;
            }
          }
          // If this is an OUT log without preceding IN, it might belong to previous day
          // This will be handled when we process the previous day's IN
        }

      } catch (error) {
        stats.errors.push(`Error processing logs for ${employeeNumber}: ${error.message}`);
      }
    }

  } catch (error) {
    stats.errors.push(`Error in processAndAggregateLogs: ${error.message}`);
  }

  return stats;
};

/**
 * Apply previous day linking heuristic
 * If previous day has 1 log and current day has 1 log, link them
 */
const applyPreviousDayLinking = async (logsByEmployeeAndDate) => {
  // This is a simplified version - can be enhanced
  // For now, we'll mark these for admin review if needed
  // The actual linking logic can be more complex based on shift times
  // TODO: Implement full previous day linking logic
};

/**
 * Sync attendance from MSSQL to MongoDB
 * @param {Date} fromDate - Start date (optional, defaults to last 7 days)
 * @param {Date} toDate - End date (optional, defaults to today)
 * @returns {Object} Sync statistics
 */
const syncAttendanceFromMSSQL = async (fromDate = null, toDate = null) => {
  const stats = {
    success: false,
    rawLogsFetched: 0,
    rawLogsInserted: 0,
    rawLogsSkipped: 0,
    dailyRecordsCreated: 0,
    dailyRecordsUpdated: 0,
    errors: [],
    message: '',
  };

  try {
    // Get settings
    const settings = await AttendanceSettings.getSettings();

    if (settings.dataSource !== 'mssql') {
      throw new Error('Data source is not set to MSSQL');
    }

    if (!settings.mssqlConfig.databaseName || !settings.mssqlConfig.tableName) {
      throw new Error('MSSQL configuration is incomplete');
    }

    // Set default date range if not provided
    if (!fromDate) {
      fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7); // Last 7 days
    }
    if (!toDate) {
      toDate = new Date();
    }

    // Fetch logs from MSSQL
    const rawLogs = await fetchAttendanceLogsSQL(settings, fromDate, toDate);
    stats.rawLogsFetched = rawLogs.length;

    if (rawLogs.length === 0) {
      stats.message = 'No logs found in MSSQL for the specified date range';
      stats.success = true;
      return stats;
    }

    // Process and aggregate
    const processStats = await processAndAggregateLogs(
      rawLogs,
      settings.previousDayLinking?.enabled || false
    );

    stats.rawLogsInserted = processStats.rawLogsInserted;
    stats.rawLogsSkipped = processStats.rawLogsSkipped;
    stats.dailyRecordsCreated = processStats.dailyRecordsCreated;
    stats.dailyRecordsUpdated = processStats.dailyRecordsUpdated;
    stats.errors = processStats.errors;

    // Update sync status in settings
    await AttendanceSettings.findOneAndUpdate(
      {},
      {
        $set: {
          'syncSettings.lastSyncAt': new Date(),
          'syncSettings.lastSyncStatus': stats.errors.length > 0 ? 'failed' : 'success',
          'syncSettings.lastSyncMessage': stats.errors.length > 0
            ? `Sync completed with ${stats.errors.length} errors`
            : `Successfully synced ${stats.rawLogsInserted} logs`,
        },
      }
    );

    stats.success = true;
    stats.message = `Successfully synced ${stats.rawLogsInserted} logs, created ${stats.dailyRecordsCreated} daily records, updated ${stats.dailyRecordsUpdated} records`;

    // NEW: Run Absenteeism Check (Auto-deactivation)
    try {
      const { ensureDailyRecordsExist, checkConsecutiveAbsences } = require('./absenteeismService');
      const checkDate = toDate instanceof Date ? toDate : new Date(toDate);
      const checkDateStr = formatDate(checkDate);

      console.log(`[AttendanceSync] Running absenteeism check for ${checkDateStr}...`);

      // 1. Ensure records exist for today (or sync end date)
      // We also check previous few days just in case, but primary focus is current sync window
      await ensureDailyRecordsExist(checkDateStr);

      // 2. Check for 3 consecutive absences
      await checkConsecutiveAbsences(checkDateStr);

    } catch (absentError) {
      console.error('[AttendanceSync] Error in absenteeism check:', absentError);
      // We don't fail the sync stats if this auxiliary task fails, but we log it
    }

  } catch (error) {
    stats.success = false;
    stats.errors.push(error.message);
    stats.message = `Sync failed: ${error.message}`;

    // Update sync status
    try {
      await AttendanceSettings.findOneAndUpdate(
        {},
        {
          $set: {
            'syncSettings.lastSyncAt': new Date(),
            'syncSettings.lastSyncStatus': 'failed',
            'syncSettings.lastSyncMessage': error.message,
          },
        }
      );
    } catch (updateError) {
      // Ignore update error
    }
  }

  return stats;
};

module.exports = {
  syncAttendanceFromMSSQL,
  processAndAggregateLogs,
  formatDate,
};

