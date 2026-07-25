/**
 * Live Attendance Report Controller
 * Handles real-time attendance reporting with user-scope awareness
 */

const AttendanceDaily = require('../model/AttendanceDaily');
const AttendanceRawLog = require('../model/AttendanceRawLog');
const Employee = require('../../employees/model/Employee');
const Shift = require('../../shifts/model/Shift');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const Division = require('../../departments/model/Division');
const { parseQueryIdList } = require('../../pay-register/services/payRegisterEmployeeFilter');
const mongoose = require('mongoose');

function parseIdStringList(raw) {
  return parseQueryIdList(raw).map((id) => String(id));
}

/**
 * Build a MongoDB employee query that constrains results to the requesting
 * user's division/department scope (derived from req.scopedUser set by
 * applyScopeFilter middleware).  Super-admins and sub-admins with scope=all
 * are unrestricted.
 *
 * @param {Object} scopedUser  - user object from req.scopedUser
 * @param {string[]} divisionIds - explicit division filter from query params
 * @param {string[]} departmentIds - explicit department filter from query params
 * @returns {Object} MongoDB query fragment safe to merge into the Employee.find() call
 */
function buildScopedEmployeeQuery(scopedUser, divisionIds, departmentIds) {
  const role = scopedUser?.role;
  const scope = scopedUser?.dataScope || (role === 'super_admin' || role === 'sub_admin' ? 'all' : 'division');

  const isSuperAdmin = role === 'super_admin';
  const isFullScope = isSuperAdmin || scope === 'all';

  const query = { is_active: { $ne: false } };

  // ── Apply explicit UI filters first ───────────────────────────────────────
  if (divisionIds.length)   query.division_id   = { $in: divisionIds.map(id => new mongoose.Types.ObjectId(id)) };
  if (departmentIds.length) query.department_id = { $in: departmentIds.map(id => new mongoose.Types.ObjectId(id)) };

  // ── Super-admin / full-scope: no further restriction ─────────────────────
  if (isFullScope) return query;

  // ── Scoped user: restrict to their divisionMapping ────────────────────────
  const mapping = scopedUser?.divisionMapping;
  if (!mapping || !Array.isArray(mapping) || mapping.length === 0) {
    // No mapping → no data
    return { _id: null };
  }

  const orConditions = mapping.map((m) => {
    const divId = (typeof m.division === 'string' ? m.division : m.division?._id)?.toString();
    if (!divId) return null;

    const depts = (m.departments || [])
      .map(d => (typeof d === 'string' ? d : d?._id)?.toString())
      .filter(Boolean);

    const divCond = { division_id: new mongoose.Types.ObjectId(divId) };
    if (depts.length) {
      return { ...divCond, department_id: { $in: depts.map(id => new mongoose.Types.ObjectId(id)) } };
    }
    return divCond;
  }).filter(Boolean);

  if (orConditions.length === 0) return { _id: null };

  // Merge scope restriction with any explicit UI filters already in `query`
  // We do this by wrapping the existing division/department filters in an $and
  // together with the scope $or, so both constraints must be satisfied.
  const scopeCondition = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };

  // Remove the explicit filters from the top-level query (they'll be part of $and)
  delete query.division_id;
  delete query.department_id;

  const andClauses = [scopeCondition];
  if (divisionIds.length)   andClauses.push({ division_id:   { $in: divisionIds.map(id => new mongoose.Types.ObjectId(id)) } });
  if (departmentIds.length) andClauses.push({ department_id: { $in: departmentIds.map(id => new mongoose.Types.ObjectId(id)) } });

  query.$and = andClauses;
  return query;
}

/**
 * Return the set of division IDs the requesting user is allowed to see.
 * Used to gate the filter-options endpoint.
 */
function getAllowedDivisionIds(scopedUser) {
  const role = scopedUser?.role;
  const scope = scopedUser?.dataScope || (role === 'super_admin' || role === 'sub_admin' ? 'all' : 'division');
  if (role === 'super_admin' || scope === 'all') return null; // null = unrestricted

  const mapping = scopedUser?.divisionMapping;
  if (!mapping || !Array.isArray(mapping) || mapping.length === 0) return [];

  return mapping
    .map(m => (typeof m.division === 'string' ? m.division : m.division?._id)?.toString())
    .filter(Boolean);
}

function matchesShiftFilter(shiftIds, shiftId) {
  if (!shiftIds.length) return true;
  if (!shiftId) return false;
  return shiftIds.includes(String(shiftId));
}

// Helper function to format date to YYYY-MM-DD
const formatDate = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper function to calculate hours worked from in_time
const calculateHoursWorked = (inTime) => {
  if (!inTime) return 0;
  const now = new Date();
  const inDateTime = new Date(inTime);
  const diffMs = now - inDateTime;
  const hours = diffMs / (1000 * 60 * 60);
  return Math.max(0, hours);
};

// @desc    Get live attendance report
// @route   GET /api/attendance/reports/live
// @access  Private (Super Admin, Sub Admin, HR)
exports.getLiveAttendanceReport = async (req, res) => {
  try {
    const { date, division, department, shift } = req.query;

    // Use current date if not provided
    const targetDate = date ? date : formatDate(new Date());

    const divisionIds = parseQueryIdList(division);
    const departmentIds = parseQueryIdList(department);
    const shiftIds = parseIdStringList(shift);

    // ── Scope-aware employee query (uses req.scopedUser set by applyScopeFilter) ──
    const scopedUser = req.scopedUser || req.user;
    const employeeQuery = buildScopedEmployeeQuery(scopedUser, divisionIds.map(String), departmentIds.map(String));

    // Prefer org-history as-of target date when filtering by division/department
    let activeEmployees;
    if (divisionIds.length || departmentIds.length) {
      const { resolveEmployeesForOrgFilter } = require('../services/attendanceOrgFilterService');
      const resolved = await resolveEmployeesForOrgFilter({
        divisionIds: divisionIds.map(String),
        departmentIds: departmentIds.map(String),
        asOf: targetDate,
        extraFilter: { ...employeeQuery, is_active: { $ne: false } },
        select: '_id emp_no employee_name division_id department_id designation_id orgHistory',
      });
      const ids = resolved.employeeIds;
      activeEmployees = await Employee.find({ _id: { $in: ids } })
        .select('_id emp_no employee_name division_id department_id designation_id')
        .populate({ path: 'division_id', select: 'name' })
        .populate({ path: 'department_id', select: 'name' })
        .populate({ path: 'designation_id', select: 'name' })
        .lean();
    } else {
      activeEmployees = await Employee.find(employeeQuery)
        .select('_id emp_no employee_name division_id department_id designation_id')
        .populate({ path: 'division_id', select: 'name' })
        .populate({ path: 'department_id', select: 'name' })
        .populate({ path: 'designation_id', select: 'name' })
        .lean();
    }

    // ── Detect processing mode (per-employee: division override → org default) ──
    const {
      getOrgAttendanceContext,
      buildDivisionProcessingModeMap,
      resolveProcessingModeFromDivisionMap,
    } = require('../services/processingModeResolutionService');
    const { processingMode: orgProcessingMode } = await getOrgAttendanceContext();
    const divisionIdsForMode = activeEmployees
      .map((e) => e.division_id?._id || e.division_id)
      .filter(Boolean);
    const divisionModeMap = await buildDivisionProcessingModeMap(divisionIdsForMode);
    const defaultIsMultiShift = orgProcessingMode.mode === 'multi_shift';

    const empNos = activeEmployees.map(e => e.emp_no);
    const employeeMap = activeEmployees.reduce((acc, e) => {
      const key = e.emp_no ? String(e.emp_no).trim().toUpperCase() : null;
      if (key) acc[key] = e;
      return acc;
    }, {});

    // 2. Fetch attendance records for target date
    const attendanceRecords = await AttendanceDaily.find({
      date: targetDate,
      employeeNumber: { $in: empNos }
    })
      .populate({
        path: 'shifts.shiftId',
        select: 'name startTime endTime'
      })
      .lean();

    // 3. Departmental Stats aggregation — restrict to scoped employees only
    const aggMatch = { ...employeeQuery };

    const divDeptStats = await Employee.aggregate([
      { $match: aggMatch },
      {
        $group: {
          _id: { division: '$division_id', department: '$department_id' },
          total: { $sum: 1 }
        }
      },
      {
        $lookup: { from: 'divisions', localField: '_id.division', foreignField: '_id', as: 'divisionDoc' }
      },
      {
        $lookup: { from: 'departments', localField: '_id.department', foreignField: '_id', as: 'departmentDoc' }
      },
      {
        $project: {
          divisionId: '$_id.division',
          id: '$_id.department',
          divisionName: { $ifNull: [{ $arrayElemAt: ['$divisionDoc.name', 0] }, 'No Division'] },
          name: { $ifNull: [{ $arrayElemAt: ['$departmentDoc.name', 0] }, 'No Department'] },
          totalEmployees: '$total'
        }
      }
    ]);

    const departmentStats = divDeptStats.reduce((acc, item) => {
      const key = `${item.divisionId}_${item.id}`;
      acc[key] = { ...item, working: 0, completed: 0, present: 0, absent: 0 };
      return acc;
    }, {});

    // 4. Categorize employees
    const currentlyWorking = [];
    const completedShift = [];
    const shiftStats = {}; // { shiftId: { name, working, completed } }

    attendanceRecords.forEach(record => {
      const empNo = record.employeeNumber ? String(record.employeeNumber).trim().toUpperCase() : null;
      const employee = empNo ? employeeMap[empNo] : null;
      if (!employee) return;

      const divId = employee.division_id?._id?.toString() || 'null';
      const deptId = employee.department_id?._id?.toString() || 'null';
      const dKey = `${divId}_${deptId}`;

      const empProcessingMode = resolveProcessingModeFromDivisionMap(employee, divisionModeMap, orgProcessingMode);
      const isMultiShift = empProcessingMode.mode === 'multi_shift';

      // ────────────────────────────────────────────────────────────────────────
      // MULTI-SHIFT MODE: iterate over every shift segment
      // ────────────────────────────────────────────────────────────────────────
      if (isMultiShift && record.shifts && record.shifts.length > 0) {
        const segments = record.shifts;

        // Shift-level filter: if user filtered by specific shift(s), only include records
        // where at least one segment matches
        if (shiftIds.length) {
          const hasMatchingShift = segments.some((seg) =>
            matchesShiftFilter(shiftIds, seg.shiftId?._id?.toString())
          );
          if (!hasMatchingShift) return;
        }

        // Mark the employee as present in dept stats (once)
        if (departmentStats[dKey]) departmentStats[dKey].present++;

        // Build per-segment data
        // Note: segmentDetails is built from the (possibly filtered) list, so we store
        // the computed sId on each item to avoid re-indexing into record.shifts later.
        const segmentDetails = segments
          .filter((seg) => matchesShiftFilter(shiftIds, seg.shiftId?._id?.toString()))
          .map((seg, idx) => {
            const shiftDoc = seg.shiftId; // populated Shift doc (or null)
            const hasIn = !!seg.inTime;
            const hasOut = !!seg.outTime;
            let hoursWorked = 0;
            if (hasIn && hasOut) {
              hoursWorked = (new Date(seg.outTime) - new Date(seg.inTime)) / (1000 * 60 * 60);
            } else if (hasIn) {
              hoursWorked = calculateHoursWorked(seg.inTime);
            }

            // sId computed here so we can reference it in the shiftStats update below
            const sId = shiftDoc?._id?.toString() || 'manual';
            // Fall back to seg.shiftName (stored directly on the model) when populate didn't resolve
            const shiftName = shiftDoc?.name || seg.shiftName || `Shift ${seg.shiftNumber || idx + 1}`;
            if (!shiftStats[sId]) {
              shiftStats[sId] = { name: shiftName, working: 0, completed: 0 };
            }

            return {
              // Use shiftNumber from the model (1-indexed, reliable) rather than filtered-array position
              segmentIndex: seg.shiftNumber || idx + 1,
              shift: shiftName,
              shiftStartTime: shiftDoc?.startTime || seg.shiftStartTime || null,
              shiftEndTime: shiftDoc?.endTime || seg.shiftEndTime || null,
              inTime: seg.inTime || null,
              outTime: seg.outTime || null,
              hoursWorked,
              isActive: hasIn && !hasOut,
              isComplete: hasIn && hasOut,
              // Keep sId so the shiftStats loop below can use it directly
              _sId: sId,
              isLate: seg.isLateIn || false,
              lateMinutes: seg.lateInMinutes || 0,
              isEarlyOut: seg.isEarlyOut || false,
              earlyOutMinutes: seg.earlyOutMinutes || 0,
            };
          });

        // Build the composite employee entry
        const hasActiveSegment = segmentDetails.some(s => s.isActive);
        const hasCompletedSegment = segmentDetails.some(s => s.isComplete);
        const allComplete = segmentDetails.every(s => s.isComplete) && !hasActiveSegment;

        const totalHours = segmentDetails.reduce((sum, s) => sum + s.hoursWorked, 0);

        // For the first/primary IN-time (used for sorting), use first segment that has inTime
        const firstSegmentWithIn = segmentDetails.find(s => s.inTime);
        const lastSegmentWithOut = [...segmentDetails].reverse().find(s => s.outTime);

        // Update shift stats – use each segment's own _sId, NOT record.shifts[i]
        segmentDetails.forEach(seg => {
          const sIdKey = seg._sId;
          if (!shiftStats[sIdKey]) shiftStats[sIdKey] = { name: seg.shift, working: 0, completed: 0 };
          if (seg.isActive) shiftStats[sIdKey].working++;
          if (seg.isComplete) shiftStats[sIdKey].completed++;
        });

        const employeeData = {
          id: employee._id,
          empNo: employee.emp_no,
          name: employee.employee_name,
          department: employee.department_id?.name || 'N/A',
          designation: employee.designation_id?.name || 'N/A',
          division: employee.division_id?.name || 'N/A',
          shift: segmentDetails.map(s => s.shift).join(' → '),
          inTime: firstSegmentWithIn?.inTime || null,
          outTime: lastSegmentWithOut?.outTime || null,
          hoursWorked: totalHours,
          status: record.status,
          date: record.date,
          isLate: record.isLateIn || false,
          lateMinutes: record.lateInMinutes || 0,
          isEarlyOut: record.isEarlyOut || false,
          earlyOutMinutes: record.earlyOutMinutes || 0,
          otHours: record.extraHours || 0,
          // Multi-shift specific
          isMultiShift: true,
          shiftCount: segmentDetails.length,
          segments: segmentDetails,
        };

        if (hasActiveSegment && !allComplete) {
          currentlyWorking.push(employeeData);
          if (departmentStats[dKey]) departmentStats[dKey].working++;
        } else if (allComplete || hasCompletedSegment) {
          completedShift.push(employeeData);
          if (departmentStats[dKey]) departmentStats[dKey].completed++;
        }

      } else {
        // ────────────────────────────────────────────────────────────────────
        // SINGLE-SHIFT MODE (original logic)
        // ────────────────────────────────────────────────────────────────────
        const lastSegment = record.shifts && record.shifts.length > 0 ? record.shifts[record.shifts.length - 1] : null;
        const shiftDoc = lastSegment?.shiftId;

        // Filter by shift if requested
        if (shiftIds.length && !matchesShiftFilter(shiftIds, shiftDoc?._id?.toString())) return;

        const employeeData = {
          id: employee._id,
          empNo: employee.emp_no,
          name: employee.employee_name,
          department: employee.department_id?.name || 'N/A',
          designation: employee.designation_id?.name || 'N/A',
          division: employee.division_id?.name || 'N/A',
          shift: shiftDoc?.name || 'Manual/Unknown',
          shiftStartTime: shiftDoc?.startTime || null,
          shiftEndTime: shiftDoc?.endTime || null,
          inTime: lastSegment?.inTime || record.inTime || null,
          outTime: lastSegment?.outTime || record.outTime || null,
          status: record.status,
          date: record.date,
          isLate: record.isLateIn || false,
          lateMinutes: record.lateInMinutes || 0,
          isEarlyOut: record.isEarlyOut || false,
          earlyOutMinutes: record.earlyOutMinutes || 0,
          otHours: record.extraHours || 0,
          hoursWorked: 0,
          isMultiShift: false,
          segments: null,
        };

        const hasIn = !!employeeData.inTime;
        const hasOut = !!employeeData.outTime;

        const sId = shiftDoc?._id?.toString() || 'manual';
        if (!shiftStats[sId]) shiftStats[sId] = { name: shiftDoc?.name || 'Manual/Unknown', working: 0, completed: 0 };

        if (departmentStats[dKey]) departmentStats[dKey].present++;

        if (hasIn && !hasOut) {
          employeeData.hoursWorked = calculateHoursWorked(employeeData.inTime);
          currentlyWorking.push(employeeData);
          shiftStats[sId].working++;
          if (departmentStats[dKey]) departmentStats[dKey].working++;
        } else if (hasIn && hasOut) {
          const diff = new Date(employeeData.outTime) - new Date(employeeData.inTime);
          employeeData.hoursWorked = diff / (1000 * 60 * 60);
          completedShift.push(employeeData);
          shiftStats[sId].completed++;
          if (departmentStats[dKey]) departmentStats[dKey].completed++;
        } else if (!hasIn && hasOut && record.status === 'PARTIAL') {
          // Single-shift checkout-only partial (OUT recorded, IN missing) — same bucket as incomplete day
          employeeData.hoursWorked = 0;
          currentlyWorking.push(employeeData);
          shiftStats[sId].working++;
          if (departmentStats[dKey]) departmentStats[dKey].working++;
        }
      }
    });

    // 5. Finalize summaries
    const totalPresent = currentlyWorking.length + completedShift.length;

    const finalDepartmentBreakdown = Object.values(departmentStats).map(dept => ({
      ...dept,
      absent: Math.max(0, dept.totalEmployees - dept.present)
    })).sort((a, b) => {
      const divCmp = (a.divisionName || '').localeCompare(b.divisionName || '');
      return divCmp !== 0 ? divCmp : (a.name || '').localeCompare(b.name || '');
    });

    res.status(200).json({
      success: true,
      data: {
        date: targetDate,
        isMultiShift: defaultIsMultiShift,
        processingMode: orgProcessingMode.mode,
        summary: {
          currentlyWorking: currentlyWorking.length,
          completedShift: completedShift.length,
          totalPresent,
          totalActiveEmployees: activeEmployees.length,
          absentEmployees: Math.max(0, activeEmployees.length - totalPresent),
          shiftBreakdown: Object.values(shiftStats),
          departmentBreakdown: finalDepartmentBreakdown
        },
        currentlyWorking: currentlyWorking.sort(
          (a, b) => new Date(b.inTime || b.outTime || 0) - new Date(a.inTime || a.outTime || 0)
        ),
        completedShift: completedShift.sort((a, b) => new Date(b.outTime || b.inTime) - new Date(a.outTime || a.inTime))
      }
    });

  } catch (error) {
    console.error('Error fetching live attendance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching live attendance report',
      error: error.message
    });
  }
};



// @desc    Get filter options for live attendance report
// @route   GET /api/attendance/reports/live/filters
// @access  Private (Super Admin, Sub Admin, HR)
exports.getFilterOptions = async (req, res) => {
  try {
    const scopedUser = req.scopedUser || req.user;
    const allowedDivisionIds = getAllowedDivisionIds(scopedUser);

    // ── Divisions ────────────────────────────────────────────────────────────
    const divisionQuery = { isActive: true };
    if (allowedDivisionIds !== null) {
      // Scoped user: only show their assigned divisions
      divisionQuery._id = { $in: allowedDivisionIds.map(id => new mongoose.Types.ObjectId(id)) };
    }
    const divisions = await Division.find(divisionQuery)
      .select('name')
      .sort({ name: 1 })
      .lean();

    // ── Departments — only those belonging to allowed divisions ───────────────
    const departmentQuery = { isActive: true };
    if (allowedDivisionIds !== null) {
      const mapping = scopedUser?.divisionMapping || [];
      const deptOrConditions = mapping.map((m) => {
        const divId = (typeof m.division === 'string' ? m.division : m.division?._id)?.toString();
        if (!divId) return null;
        const depts = (m.departments || [])
          .map(d => (typeof d === 'string' ? d : d?._id)?.toString())
          .filter(Boolean);
        if (depts.length) {
          return {
            divisions: new mongoose.Types.ObjectId(divId),
            _id: { $in: depts.map(id => new mongoose.Types.ObjectId(id)) },
          };
        }
        return { divisions: new mongoose.Types.ObjectId(divId) };
      }).filter(Boolean);

      departmentQuery.$or = deptOrConditions.length ? deptOrConditions : [{ _id: null }];
    }
    const departments = await Department.find(departmentQuery)
      .select('name')
      .sort({ name: 1 })
      .lean();

    // ── Shifts — always show all active shifts (no division scope on shifts) ──
    const shifts = await Shift.find({ isActive: true })
      .select('name startTime endTime')
      .sort({ name: 1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        divisions: divisions.map(d => ({ id: d._id, name: d.name })),
        departments: departments.map(dept => ({ id: dept._id, name: dept.name })),
        shifts: shifts.map(shift => ({
          id: shift._id,
          name: shift.name,
          startTime: shift.startTime,
          endTime: shift.endTime
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching filter options:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching filter options',
      error: error.message
    });
  }
};
