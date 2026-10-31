/**
 * Dynamic Roster & Multi-Shift Attendance Synchronization Service
 * 
 * Provides a permanent, dynamic engine for processing manual rosters, physical attendance sheets,
 * and multi-shift schedules without hardcoding employee lists or shift arrays.
 */

const mongoose = require('mongoose');
const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const Department = require('../../departments/model/Department');
const Division = require('../../departments/model/Division');
const Shift = require('../../shifts/model/Shift');
const PreScheduledShift = require('../../shifts/model/PreScheduledShift');

/**
 * Resolve Shift Master Map dynamically for a department, division, or general system master shifts.
 * Maps short codes (A, B, C, G, etc.) and names to actual Shift documents.
 */
async function resolveDynamicShiftMap(customMapping = {}, departmentId = null, divisionId = null) {
  // Query all active shifts from DB
  const allShifts = await Shift.find({ isActive: { $ne: false } });

  const shiftCodeMap = {};

  // Standard default mappings
  allShifts.forEach(shift => {
    const shiftNameUpper = shift.name.toUpperCase();
    shiftCodeMap[shiftNameUpper] = shift;
    shiftCodeMap[shift._id.toString()] = shift;

    // Extract leading code letter (e.g., 'A-SECURITY' -> 'A', 'B-SECURITY' -> 'B', 'C-SECURITY' -> 'C')
    const match = shiftNameUpper.match(/^([A-Z0-9]+)[-_ ]/);
    if (match && !shiftCodeMap[match[1]]) {
      shiftCodeMap[match[1]] = shift;
    }
  });

  // Department-specific / Division-specific default shifts override
  if (departmentId) {
    const dept = await Department.findById(departmentId).populate('shifts.shiftId');
    dept?.shifts?.forEach(s => {
      if (s.shiftId) {
        const nameUpper = s.shiftId.name.toUpperCase();
        shiftCodeMap[nameUpper] = s.shiftId;
        const match = nameUpper.match(/^([A-Z0-9]+)[-_ ]/);
        if (match) shiftCodeMap[match[1]] = s.shiftId;
      }
    });
  }

  // Apply user custom code overrides if provided
  for (const [code, target] of Object.entries(customMapping)) {
    if (typeof target === 'string') {
      const found = allShifts.find(s => s._id.toString() === target || s.name.toUpperCase() === target.toUpperCase());
      if (found) shiftCodeMap[code.toUpperCase()] = found;
    } else if (target && target._id) {
      shiftCodeMap[code.toUpperCase()] = target;
    }
  }

  return shiftCodeMap;
}

/**
 * Ingest and Process Dynamic Roster Grid
 * 
 * @param {Array<Object>} rosterGrid Array of employee roster objects:
 *   [
 *     {
 *       empNo: "1717", // or employeeNumber / emp_no
 *       employeeName: "D. Ram Babu", // optional lookup fallback
 *       schedule: { "2026-08-26": "A", "2026-08-27": "B", "2026-08-28": "L", ... }
 *     }
 *   ]
 * @param {Object} options Configuration options:
 *   - customShiftMap: { 'A': 'A-SECURITY', 'G': 'NTS-GENERAL' }
 *   - scheduledById: User ID performing the action
 *   - syncPreScheduledShifts: Boolean (default true) - whether to write to PreScheduledShift model
 *   - syncAttendanceDaily: Boolean (default true) - whether to write/update AttendanceDaily
 */
async function processDynamicRosterGrid(rosterGrid = [], options = {}) {
  const {
    customShiftMap = {},
    scheduledById = null,
    syncPreScheduledShifts = true,
    syncAttendanceDaily = true,
    notesPrefix = 'Dynamic Roster Import'
  } = options;

  if (!Array.isArray(rosterGrid) || rosterGrid.length === 0) {
    throw new Error('Roster grid must be a non-empty array of employee schedules');
  }

  // 1. Gather all unique Employee Numbers & lookup Employees
  const rawEmpIdentifiers = rosterGrid.map(r => String(r.empNo || r.employeeNumber || r.emp_no || '').trim()).filter(Boolean);
  
  const employees = await Employee.find({
    $or: [
      { emp_no: { $in: rawEmpIdentifiers } },
      { employee_name: { $in: rosterGrid.map(r => r.employeeName).filter(Boolean) } }
    ]
  }).populate('department_id division_id');

  const empMapByNo = {};
  employees.forEach(emp => {
    empMapByNo[emp.emp_no] = emp;
  });

  // 2. Resolve Shift Code Map
  const masterShiftMap = await resolveDynamicShiftMap(customShiftMap);

  const results = {
    totalEmployees: rosterGrid.length,
    processedEntries: 0,
    preScheduledUpdated: 0,
    attendanceDailyUpdated: 0,
    errors: []
  };

  // 3. Iterate over each employee in the dynamic grid
  for (const row of rosterGrid) {
    const empNo = String(row.empNo || row.employeeNumber || row.emp_no || '').trim();
    let emp = empMapByNo[empNo];

    if (!emp && row.employeeName) {
      emp = employees.find(e => e.employee_name.toLowerCase().includes(row.employeeName.toLowerCase()));
    }

    if (!emp) {
      results.errors.push(`Employee not found for identifier: ${empNo || row.employeeName}`);
      continue;
    }

    const schedule = row.schedule || row.dates || {};
    const dates = Object.keys(schedule).sort();

    for (const date of dates) {
      const rawCode = String(schedule[date] || '').trim().toUpperCase();
      if (!rawCode) continue;

      results.processedEntries++;

      const isLeave = (rawCode === 'L' || rawCode === 'LEAVE');
      const isWeekOff = (rawCode === 'WO' || rawCode === 'WEEK_OFF');
      const isHoliday = (rawCode === 'HOL' || rawCode === 'HOLIDAY');
      const isAbsent = (rawCode === 'A' && !masterShiftMap['A'] && !masterShiftMap['A-SECURITY']);

      const matchedShift = masterShiftMap[rawCode] || null;

      // A. Update / Upsert PreScheduledShift (Official Calendar Roster)
      if (syncPreScheduledShifts) {
        try {
          const preScheduledPayload = {
            employeeNumber: emp.emp_no,
            date,
            shiftId: matchedShift ? matchedShift._id : null,
            status: isWeekOff ? 'WO' : (isHoliday ? 'HOL' : null),
            scheduledBy: scheduledById || emp._id,
            notes: `${notesPrefix} - Code: ${rawCode}`
          };

          await PreScheduledShift.findOneAndUpdate(
            { employeeNumber: emp.emp_no, date },
            { $set: preScheduledPayload },
            { upsert: true, new: true, runValidators: false }
          );
          results.preScheduledUpdated++;
        } catch (err) {
          results.errors.push(`PreScheduledShift error for ${emp.emp_no} on ${date}: ${err.message}`);
        }
      }

      // B. Update / Upsert AttendanceDaily (Daily Aggregate & Multi-shift calculation)
      if (syncAttendanceDaily) {
        try {
          let status = 'PRESENT';
          if (isLeave) status = 'LEAVE';
          else if (isWeekOff) status = 'WEEK_OFF';
          else if (isHoliday) status = 'HOLIDAY';
          else if (isAbsent || (!matchedShift && rawCode === '-')) status = 'ABSENT';

          const startTimeStr = matchedShift?.startTime || '09:00';
          const endTimeStr = matchedShift?.endTime || '17:30';
          const durationHrs = matchedShift?.duration || 8;
          const payableVal = (status === 'PRESENT') ? (matchedShift?.payableShifts || 1) : 0;

          let inTimeDate = null;
          let outTimeDate = null;

          if (status === 'PRESENT' && matchedShift) {
            const [sH, sM] = startTimeStr.split(':').map(Number);
            const [eH, eM] = endTimeStr.split(':').map(Number);

            inTimeDate = new Date(`${date}T${startTimeStr}:00.000Z`);
            outTimeDate = new Date(`${date}T${endTimeStr}:00.000Z`);
            if (eH < sH) {
              const nextDay = new Date(inTimeDate);
              nextDay.setDate(nextDay.getDate() + 1);
              const nextDayStr = nextDay.toISOString().split('T')[0];
              outTimeDate = new Date(`${nextDayStr}T${endTimeStr}:00.000Z`);
            }
          }

          const shiftData = (status === 'PRESENT' && matchedShift) ? [{
            shiftNumber: 1,
            inTime: inTimeDate,
            outTime: outTimeDate,
            duration: durationHrs * 60,
            workingHours: durationHrs,
            punchHours: durationHrs,
            odHours: 0,
            edgePermissionHours: 0,
            otHours: 0,
            shiftId: matchedShift._id,
            shiftName: matchedShift.name,
            shiftStartTime: startTimeStr,
            shiftEndTime: endTimeStr,
            lateInMinutes: 0,
            earlyOutMinutes: 0,
            isLateIn: false,
            isEarlyOut: false,
            status: 'PRESENT',
            payableShift: payableVal,
            basePayable: payableVal,
            expectedHours: durationHrs,
            extraHours: 0
          }] : [];

          const attendancePayload = {
            employee_id: emp._id,
            employeeNumber: emp.emp_no,
            date,
            shifts: shiftData,
            totalShifts: status === 'PRESENT' ? 1 : 0,
            totalWorkingHours: status === 'PRESENT' ? durationHrs : 0,
            totalOTHours: 0,
            payableShifts: payableVal,
            totalLateInMinutes: 0,
            totalEarlyOutMinutes: 0,
            totalExpectedHours: status === 'PRESENT' ? durationHrs : 0,
            status,
            isEdited: false,
            source: ['roster-sync'],
            lastSyncedAt: new Date(),
            notes: `${notesPrefix} - Code: ${rawCode}`
          };

          await AttendanceDaily.findOneAndUpdate(
            { employeeNumber: emp.emp_no, date },
            { $set: attendancePayload },
            { upsert: true, new: true }
          );
          results.attendanceDailyUpdated++;
        } catch (err) {
          results.errors.push(`AttendanceDaily error for ${emp.emp_no} on ${date}: ${err.message}`);
        }
      }
    }
  }

  return results;
}

module.exports = {
  resolveDynamicShiftMap,
  processDynamicRosterGrid
};
