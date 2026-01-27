const PayRegisterSummary = require('../model/PayRegisterSummary');
const { populatePayRegisterFromSources } = require('./autoPopulationService');
const { calculateTotals } = require('./totalsCalculationService');
const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
const { syncAttendanceFromMSSQL } = require('../../attendance/services/attendanceSyncService');

/**
 * Auto Sync Service
 * Updates pay register when source data changes
 */

/**
 * Check if a date was manually edited
 * @param {Object} payRegister - PayRegisterSummary document
 * @param {String} date - Date in YYYY-MM-DD format
 * @returns {Boolean} True if date was manually edited
 */
function checkIfManuallyEdited(payRegister, date) {
  if (!payRegister.editHistory || payRegister.editHistory.length === 0) {
    return false;
  }

  // Check if there are any manual edits for this date
  const editsForDate = payRegister.editHistory.filter((edit) => edit.date === date);

  // If there are edits, consider it manually edited
  // We can add more sophisticated logic here (e.g., ignore auto-sync edits)
  return editsForDate.length > 0;
}

/**
 * Auto-sync affected payroll months' pay registers when a leave is approved.
 *
 * Determines payroll months that overlap the leave period, skips any month containing manually edited dates,
 * repopulates daily records for remaining months, recalculates totals, and updates auto-sync tracking metadata.
 * @param {Object} leave - Leave document containing identifiers and date range.
 * @param {string|ObjectId} leave.employeeId - Employee identifier.
 * @param {string} leave.fromDate - Leave start date (ISO string or YYYY-MM-DD).
 * @param {string} leave.toDate - Leave end date (ISO string or YYYY-MM-DD).
 * @param {string} [leave.emp_no] - Employee number used when populating sources.
 */
async function syncPayRegisterFromLeave(leave) {
  try {
    if (!leave.employeeId || !leave.fromDate || !leave.toDate) {
      return;
    }

    const fromDate = new Date(leave.fromDate);
    const toDate = new Date(leave.toDate);
    const monthSet = new Set();

    // Get all calendar months this leave spans, plus overlap potential (current and next)
    // A more robust approach for dynamic cycles:
    // Any date D belongs to payroll month M if D falls in [M.startDate, M.endDate]
    // Since startDay is usually between 1 and 31, a date D can only belong to 
    // payroll month of (current calendar month) or (next calendar month).
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const calYear = currentDate.getFullYear();
      const calMonthZero = currentDate.getMonth(); // 0-indexed

      // Add previous calendar month
      const prevMonth = new Date(calYear, calMonthZero - 1, 1);
      monthSet.add(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);

      // Add current calendar month
      monthSet.add(`${calYear}-${String(calMonthZero + 1).padStart(2, '0')}`);

      // Add next calendar month
      const nextMonth = new Date(calYear, calMonthZero + 1, 1);
      monthSet.add(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Update pay register for each affected month
    for (const month of monthSet) {
      const payRegister = await PayRegisterSummary.findOne({
        employeeId: leave.employeeId,
        month,
      });

      if (!payRegister) {
        // Pay register doesn't exist yet, skip (will be created when accessed)
        continue;
      }

      // Fetch the actual range for this payroll month
      const [year, monthNum] = month.split('-').map(Number);
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

      // Check if any dates in this leave fall within this payroll month and were manually edited
      let hasManualEdits = false;
      let currentDateCheck = new Date(fromDate);
      while (currentDateCheck <= toDate) {
        const dateStr = currentDateCheck.toISOString().split('T')[0];
        if (dateStr >= startDate && dateStr <= endDate && checkIfManuallyEdited(payRegister, dateStr)) {
          hasManualEdits = true;
          break;
        }
        currentDateCheck.setDate(currentDateCheck.getDate() + 1);
      }

      // If manually edited, skip auto-sync
      if (hasManualEdits) {
        continue;
      }

      // Re-populate from sources
      const dailyRecords = await populatePayRegisterFromSources(
        leave.employeeId,
        leave.emp_no,
        year,
        monthNum
      );

      // Update dailyRecords
      payRegister.dailyRecords = dailyRecords;

      // Recalculate totals
      payRegister.totals = calculateTotals(dailyRecords);

      // Update sync tracking
      payRegister.lastAutoSyncedAt = new Date();
      payRegister.lastAutoSyncedFrom.leaves = new Date();

      await payRegister.save();
    }
  } catch (error) {
    console.error('Error syncing pay register from leave:', error);
    // Don't throw - this is a background operation
  }
}

/**
 * Auto-syncs monthly pay register entries affected by an OD approval.
 *
 * For each payroll month that overlaps the OD date range, repopulates the month's
 * daily records and recalculates totals unless any date within that payroll month
 * was manually edited; updates sync metadata on successful updates.
 * @param {Object} od - OD document with required properties:
 *   - {string|ObjectId} employeeId - Employee identifier.
 *   - {string} fromDate - Start date of the OD span in YYYY-MM-DD (or ISO) format.
 *   - {string} toDate - End date of the OD span in YYYY-MM-DD (or ISO) format.
 *   - {string|number} [emp_no] - Employee number used when populating sources.
 */
async function syncPayRegisterFromOD(od) {
  try {
    if (!od.employeeId || !od.fromDate || !od.toDate) {
      return;
    }

    const fromDate = new Date(od.fromDate);
    const toDate = new Date(od.toDate);
    const monthSet = new Set();

    // Get all calendar months this OD spans, plus overlap potential (current and next)
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const calYear = currentDate.getFullYear();
      const calMonthZero = currentDate.getMonth();

      // Add previous calendar month
      const prevMonth = new Date(calYear, calMonthZero - 1, 1);
      monthSet.add(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);

      // Add current calendar month
      monthSet.add(`${calYear}-${String(calMonthZero + 1).padStart(2, '0')}`);

      // Add next calendar month
      const nextMonth = new Date(calYear, calMonthZero + 1, 1);
      monthSet.add(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);

      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Update pay register for each affected month
    for (const month of monthSet) {
      const payRegister = await PayRegisterSummary.findOne({
        employeeId: od.employeeId,
        month,
      });

      if (!payRegister) {
        continue;
      }

      // Fetch the actual range for this payroll month
      const [year, monthNum] = month.split('-').map(Number);
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

      // Check if any dates were manually edited within this payroll month
      let hasManualEdits = false;
      let currentDateCheck = new Date(fromDate);
      while (currentDateCheck <= toDate) {
        const dateStr = currentDateCheck.toISOString().split('T')[0];
        if (dateStr >= startDate && dateStr <= endDate && checkIfManuallyEdited(payRegister, dateStr)) {
          hasManualEdits = true;
          break;
        }
        currentDateCheck.setDate(currentDateCheck.getDate() + 1);
      }

      if (hasManualEdits) {
        continue;
      }

      // Re-populate from sources
      const dailyRecords = await populatePayRegisterFromSources(
        od.employeeId,
        od.emp_no,
        year,
        monthNum
      );

      payRegister.dailyRecords = dailyRecords;
      payRegister.totals = calculateTotals(dailyRecords);
      payRegister.lastAutoSyncedAt = new Date();
      payRegister.lastAutoSyncedFrom.ods = new Date();

      await payRegister.save();
    }
  } catch (error) {
    console.error('Error syncing pay register from OD:', error);
  }
}

/**
 * Synchronizes the affected payroll month's pay register for an approved OT entry.
 * Updates the day's OT hours and OT IDs and recalculates totals unless the date was manually edited.
 * @param {Object} ot - OT document; must include `employeeId` and `date` (YYYY-MM-DD).
 */
async function syncPayRegisterFromOT(ot) {
  try {
    if (!ot.employeeId || !ot.date) {
      return;
    }

    const dateStr = ot.date;
    const dateObj = new Date(dateStr);
    const calYear = dateObj.getFullYear();
    const calMonthZero = dateObj.getMonth();

    const monthSet = new Set();
    // Add current month and prev/next to cover dynamic cycle spanning
    monthSet.add(`${calYear}-${String(calMonthZero + 1).padStart(2, '0')}`);
    const prevMonth = new Date(calYear, calMonthZero - 1, 1);
    monthSet.add(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);
    const nextMonth = new Date(calYear, calMonthZero + 1, 1);
    monthSet.add(`${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`);

    for (const month of monthSet) {
      const payRegister = await PayRegisterSummary.findOne({
        employeeId: ot.employeeId,
        month,
      });

      if (!payRegister) {
        continue;
      }

      // Fetch actual range to verify if date belongs to this payroll month
      const [year, monthNum] = month.split('-').map(Number);
      const { startDate, endDate } = await getPayrollDateRange(year, monthNum);

      if (dateStr < startDate || dateStr > endDate) {
        continue;
      }

      // Check if date was manually edited
      if (checkIfManuallyEdited(payRegister, dateStr)) {
        return;
      }

      // Find the daily record
      const dailyRecord = payRegister.dailyRecords.find((r) => r.date === dateStr);

      if (dailyRecord) {
        // Update OT hours
        // Sum all approved OT hours for this date
        const OT = require('../../overtime/model/OT');
        const ots = await OT.find({
          employeeId: ot.employeeId,
          date: dateStr,
          status: 'approved',
        });

        const totalOTHours = ots.reduce((sum, o) => sum + (o.otHours || 0), 0);
        dailyRecord.otHours = totalOTHours;
        dailyRecord.otIds = ots.map((o) => o._id);

        // Recalculate totals
        payRegister.totals = calculateTotals(payRegister.dailyRecords);
        payRegister.lastAutoSyncedAt = new Date();
        payRegister.lastAutoSyncedFrom.ot = new Date();

        await payRegister.save();
      }
    }
  } catch (error) {
    console.error('Error syncing pay register from OT:', error);
  }
}

/**
 * Re-populates and saves the pay register for a given employee and payroll month.
 *
 * @param {string} employeeId - ID of the employee.
 * @param {string} month - Payroll month in `YYYY-MM` format.
 * @returns {Promise<PayRegisterSummary>} The updated PayRegisterSummary document.
 * @throws {Error} If the employee with the provided ID is not found.
 * @throws {Error} Propagates other errors encountered during synchronization or saving.
 */
async function manualSyncPayRegister(employeeId, month) {
  try {
    let payRegister = await PayRegisterSummary.findOne({
      employeeId,
      month,
    });

    const [year, monthNum] = month.split('-').map(Number);
    const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

    const Employee = require('../../employees/model/Employee');
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    // CRITICAL: First trigger attendance sync from biometric source for THIS specific payroll range
    // This ensures any spanned dates (e.g. 26th-31st) are updated in MongoDB before we read them
    try {
      const from = new Date(startDate);
      const to = new Date(endDate);
      await syncAttendanceFromMSSQL(from, to);
    } catch (syncErr) {
      console.warn(`[SyncAll] MSSQL sync failed for range ${startDate} to ${endDate}:`, syncErr.message);
      // Continue anyway, maybe data is already in MongoDB or sync is not available
    }

    const dailyRecords = await populatePayRegisterFromSources(
      employeeId,
      employee.emp_no,
      year,
      monthNum
    );

    if (!payRegister) {
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);

      // Create if it doesn't exist
      payRegister = new PayRegisterSummary({
        employeeId,
        emp_no: employee.emp_no,
        month,
        monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        year,
        monthNumber: monthNum,
        totalDaysInMonth: totalDays,
        startDate,
        endDate,
        status: 'draft',
      });
    } else {
      const { getPayrollDateRange } = require('../../shared/utils/dateUtils');
      const { startDate, endDate, totalDays } = await getPayrollDateRange(year, monthNum);
      payRegister.totalDaysInMonth = totalDays;
      payRegister.startDate = startDate;
      payRegister.endDate = endDate;
    }

    payRegister.dailyRecords = dailyRecords;
    payRegister.totals = calculateTotals(dailyRecords);
    payRegister.lastAutoSyncedAt = new Date();
    payRegister.lastAutoSyncedFrom.attendance = new Date();
    payRegister.lastAutoSyncedFrom.leaves = new Date();
    payRegister.lastAutoSyncedFrom.ods = new Date();
    payRegister.lastAutoSyncedFrom.ot = new Date();
    payRegister.lastAutoSyncedFrom.shifts = new Date();

    await payRegister.save();

    return payRegister;
  } catch (error) {
    console.error('Error in manual sync:', error);
    throw error;
  }
}

module.exports = {
  syncPayRegisterFromLeave,
  syncPayRegisterFromOD,
  syncPayRegisterFromOT,
  manualSyncPayRegister,
  checkIfManuallyEdited,
};
