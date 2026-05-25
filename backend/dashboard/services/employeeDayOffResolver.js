/**
 * Shared logic: is today a holiday or week off for an employee?
 */
const Holiday = require('../../holidays/model/Holiday');
const HolidayGroup = require('../../holidays/model/HolidayGroup');
const { employeeMatchesMappingList } = require('../../holidays/utils/holidayScopeMapping');

function toUtcDateString(d) {
  const x = new Date(d);
  const y = x.getUTCFullYear();
  const m = String(x.getUTCMonth() + 1).padStart(2, '0');
  const day = String(x.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function resolveApplicableHolidayGroupIdsForEmployee(employee) {
  const divId = employee.division_id?.toString?.() || String(employee.division_id || '');
  const deptId = employee.department_id?.toString?.() || String(employee.department_id || '');
  const empGroupId = employee.employee_group_id?.toString?.() || String(employee.employee_group_id || '');

  const allGroups = await HolidayGroup.find({ isActive: true }).select('divisionMapping').lean();
  const applicableGroups = allGroups.filter((g) => {
    const maps = g.divisionMapping || [];
    return maps.some((m) => {
      const divMatch = m.division?.toString() === divId;
      if (!divMatch) return false;
      const deptMatch =
        !m.departments || m.departments.length === 0
          ? true
          : deptId && m.departments.some((d) => d?.toString() === deptId);
      if (!deptMatch) return false;
      const grpMatch =
        !m.employeeGroups || m.employeeGroups.length === 0
          ? true
          : empGroupId && m.employeeGroups.some((eg) => eg?.toString() === empGroupId);
      return grpMatch;
    });
  });
  return applicableGroups.map((g) => g._id);
}

async function fetchMergedHolidaysForEmployee(employee, istYear) {
  const groupIds = await resolveApplicableHolidayGroupIdsForEmployee(employee);
  const dateQuery = {
    $or: [
      { date: { $gte: new Date(`${istYear}-01-01`), $lte: new Date(`${istYear}-12-31`) } },
      { endDate: { $gte: new Date(`${istYear}-01-01`), $lte: new Date(`${istYear}-12-31`) } },
    ],
    isActive: { $ne: false },
  };

  const masterHolidays = await Holiday.find({
    ...dateQuery,
    isMaster: true,
    $or: [{ applicableTo: 'ALL' }, { applicableTo: 'SPECIFIC_GROUPS', targetGroupIds: { $in: groupIds } }],
  }).lean();

  const groupHolidays = await Holiday.find({
    ...dateQuery,
    scope: 'GROUP',
    groupId: { $in: groupIds },
  }).lean();

  const masterMap = new Map(masterHolidays.map((h) => [h._id.toString(), h]));
  const finalHolidays = [];
  for (const gh of groupHolidays) {
    if (gh.overridesMasterId) {
      masterMap.delete(gh.overridesMasterId.toString());
    }
    finalHolidays.push(gh);
  }
  finalHolidays.push(...masterMap.values());

  const mappingHolidays = await Holiday.find({
    ...dateQuery,
    scope: 'MAPPING',
  }).lean();

  if (employee) {
    for (const mh of mappingHolidays) {
      if (employeeMatchesMappingList(employee, mh.divisionMapping)) {
        finalHolidays.push(mh);
      }
    }
  }

  finalHolidays.sort((a, b) => new Date(a.date) - new Date(b.date));
  return finalHolidays;
}

function holidayCoversDateStr(h, dateStr) {
  const startStr = toUtcDateString(h.date);
  const endStr = h.endDate ? toUtcDateString(h.endDate) : startStr;
  return dateStr >= startStr && dateStr <= endStr;
}

function parseHolidayNameFromRosterNotes(notes) {
  if (!notes || typeof notes !== 'string') return null;
  const m = notes.match(/Holiday:\s*(.+)/i);
  return m ? m[1].trim() : null;
}

module.exports = {
  fetchMergedHolidaysForEmployee,
  holidayCoversDateStr,
  parseHolidayNameFromRosterNotes,
  toUtcDateString,
};
