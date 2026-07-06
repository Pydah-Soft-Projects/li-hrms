const Employee = require('../../employees/model/Employee');
const { extractISTComponents } = require('../../shared/utils/dateUtils');
const { getPayrollPeriodForMonth } = require('../../shared/utils/payrollPeriodCache');
const dateCycleService = require('../../leaves/services/dateCycleService');
const { buildLeftDuringPeriodOrClause, mergeScopeWithEmployeeClauses } = require('./attendanceEmployeeQuery');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');

const VALID_VIEW_MODES = new Set([
  'complete',
  'present_absent',
  'in_out',
  'leaves',
  'od',
  'ot',
  'export',
]);

const EMPLOYEE_LIST_SELECT =
  'emp_no employee_name doj leftDate is_active profilePhoto division_id department_id designation_id';

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeViewMode(mode) {
  const m = String(mode || 'complete').trim().toLowerCase();
  return VALID_VIEW_MODES.has(m) ? m : 'complete';
}

async function resolveMonthlyPeriod(targetYear, targetMonth, startDate, endDate) {
  let periodStartStr = startDate;
  let periodEndStr = endDate;
  if (!periodStartStr || !periodEndStr) {
    const period = await getPayrollPeriodForMonth(targetYear, targetMonth, dateCycleService);
    periodStartStr = period.startDateStr;
    periodEndStr = period.endDateStr;
  }
  const periodStart = new Date(`${periodStartStr}T00:00:00.000Z`);
  const periodEnd = new Date(`${periodEndStr}T23:59:59.999Z`);
  return { periodStartStr, periodEndStr, periodStart, periodEnd };
}

function buildMonthlyEmployeeFilter(scopeFilter, query, periodStart, periodEnd) {
  const { search, divisionId, departmentId, designationId } = query;
  const rosterVisibility = buildLeftDuringPeriodOrClause(
    periodStart.toISOString().slice(0, 10),
    periodEnd.toISOString().slice(0, 10)
  );

  const extraClauses = [rosterVisibility];
  if (search) {
    const safeSearch = escapeRegex(search);
    extraClauses.push({
      $or: [
        { employee_name: { $regex: safeSearch, $options: 'i' } },
        { emp_no: { $regex: safeSearch, $options: 'i' } },
      ],
    });
  }
  if (divisionId) extraClauses.push({ division_id: divisionId });
  if (departmentId) extraClauses.push({ department_id: departmentId });
  if (designationId) extraClauses.push({ designation_id: designationId });

  return mergeScopeWithEmployeeClauses(scopeFilter, extraClauses);
}

function buildEmployeeListQuery(filter, { skip, limit } = {}) {
  let q = Employee.find(filter)
    .select(EMPLOYEE_LIST_SELECT)
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name title code')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .lean();

  if (limit != null && limit !== -1) {
    q = q.skip(skip || 0).limit(limit);
  }
  return q;
}

async function fetchMonthlyEmployees(scopeFilter, query, options = {}) {
  const targetYear = parseInt(query.year, 10);
  const targetMonth = parseInt(query.month, 10);
  const { periodStartStr, periodEndStr, periodStart, periodEnd } = await resolveMonthlyPeriod(
    targetYear,
    targetMonth,
    query.startDate,
    query.endDate
  );

  const filter = buildMonthlyEmployeeFilter(scopeFilter, query, periodStart, periodEnd);
  const pageNum = parseInt(query.page, 10) || 1;
  const limitNum =
    options.forceLimit != null
      ? options.forceLimit
      : query.limit != null
        ? parseInt(query.limit, 10) || 20
        : 20;
  const skip = limitNum === -1 ? 0 : (pageNum - 1) * limitNum;

  const [employees, totalEmployees] = await Promise.all([
    buildEmployeeListQuery(filter, { skip, limit: limitNum }),
    Employee.countDocuments(filter),
  ]);

  return {
    employees,
    filter,
    targetYear,
    targetMonth,
    periodStartStr,
    periodEndStr,
    pageNum,
    limitNum,
    totalEmployees,
    mode: normalizeViewMode(query.mode),
  };
}

module.exports = {
  VALID_VIEW_MODES,
  normalizeViewMode,
  resolveMonthlyPeriod,
  buildMonthlyEmployeeFilter,
  fetchMonthlyEmployees,
  buildEmployeeListQuery,
  EMPLOYEE_LIST_SELECT,
};
