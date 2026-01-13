const PayRegisterSummary = require('../model/PayRegisterSummary');
const { populatePayRegisterFromSources } = require('./autoPopulationService');
const { calculateTotals } = require('./totalsCalculationService');

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
 * Sync pay register from leave approval
 * @param {Object} leave - Leave document
 * @returns {Promise<void>}
 */
async function syncPayRegisterFromLeave(leave) {
  try {
    if (!leave.employeeId || !leave.fromDate || !leave.toDate) {
      return;
    }

    const fromDate = new Date(leave.fromDate);
    const toDate = new Date(leave.toDate);
    const monthSet = new Set();

    // Get all months this leave spans
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(month);
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(1);
    }

    // Also check the actual dates
    currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(month);
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

      // Check if any dates in this leave were manually edited
      let hasManualEdits = false;
      currentDate = new Date(fromDate);
      while (currentDate <= toDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (dateStr.startsWith(month) && checkIfManuallyEdited(payRegister, dateStr)) {
          hasManualEdits = true;
          break;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // If manually edited, skip auto-sync
      if (hasManualEdits) {
        continue;
      }

      // Re-populate from sources
      const [year, monthNum] = month.split('-').map(Number);
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
 * Sync pay register from OD approval
 * @param {Object} od - OD document
 * @returns {Promise<void>}
 */
async function syncPayRegisterFromOD(od) {
  try {
    if (!od.employeeId || !od.fromDate || !od.toDate) {
      return;
    }

    const fromDate = new Date(od.fromDate);
    const toDate = new Date(od.toDate);
    const monthSet = new Set();

    // Get all months this OD spans
    let currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(month);
      currentDate.setMonth(currentDate.getMonth() + 1);
      currentDate.setDate(1);
    }

    // Also check the actual dates
    currentDate = new Date(fromDate);
    while (currentDate <= toDate) {
      const month = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(month);
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

      // Check if any dates were manually edited
      let hasManualEdits = false;
      currentDate = new Date(fromDate);
      while (currentDate <= toDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (dateStr.startsWith(month) && checkIfManuallyEdited(payRegister, dateStr)) {
          hasManualEdits = true;
          break;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (hasManualEdits) {
        continue;
      }

      // Re-populate from sources
      const [year, monthNum] = month.split('-').map(Number);
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
 * Sync pay register from OT approval
 * @param {Object} ot - OT document
 * @returns {Promise<void>}
 */
async function syncPayRegisterFromOT(ot) {
  try {
    if (!ot.employeeId || !ot.date) {
      return;
    }

    const dateStr = ot.date;
    const month = dateStr.substring(0, 7); // YYYY-MM

    const payRegister = await PayRegisterSummary.findOne({
      employeeId: ot.employeeId,
      month,
    });

    if (!payRegister) {
      return;
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
  } catch (error) {
    console.error('Error syncing pay register from OT:', error);
  }
}

/**
 * Manual sync trigger - re-populate entire pay register
 * @param {String} employeeId - Employee ID
 * @param {String} month - Month in YYYY-MM format
 * @returns {Promise<Object>} Updated pay register
 */
async function manualSyncPayRegister(employeeId, month) {
  try {
    let payRegister = await PayRegisterSummary.findOne({
      employeeId,
      month,
    });

    const [year, monthNum] = month.split('-').map(Number);
    const Employee = require('../../employees/model/Employee');
    const employee = await Employee.findById(employeeId);

    if (!employee) {
      throw new Error('Employee not found');
    }

    const dailyRecords = await populatePayRegisterFromSources(
      employeeId,
      employee.emp_no,
      year,
      monthNum
    );

    if (!payRegister) {
      // Create if it doesn't exist
      payRegister = new PayRegisterSummary({
        employeeId,
        emp_no: employee.emp_no,
        month,
        monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
        year,
        monthNumber: monthNum,
        totalDaysInMonth: new Date(year, monthNum, 0).getDate(),
        status: 'draft',
      });
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

