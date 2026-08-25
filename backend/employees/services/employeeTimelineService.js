/**
 * Effective-dated org & salary timeline for employees.
 * Employee.division_id / department_id / gross_salary remain the as-of-today cache.
 */

const mongoose = require('mongoose');

const ORG_SOURCES = [
  'hire',
  'transfer',
  'promotion',
  'demotion',
  'increment',
  'manual_superadmin',
  'backfill',
  'rejoin',
];

const SALARY_SOURCES = [
  'hire',
  'promotion',
  'demotion',
  'increment',
  'manual_superadmin',
  'backfill',
  'rejoin',
];

function startOfUtcDay(d) {
  const x = d instanceof Date ? new Date(d) : new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function endOfUtcDay(d) {
  const x = startOfUtcDay(d);
  if (!x) return null;
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

function addDaysUtc(d, n) {
  const x = startOfUtcDay(d);
  if (!x) return null;
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function idStr(v) {
  if (v == null) return null;
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
}

function sameId(a, b) {
  const as = idStr(a);
  const bs = idStr(b);
  if (!as && !bs) return true;
  return as === bs;
}

const ORG_DYNAMIC_KEYS = [
  'division',
  'division_name',
  'department',
  'department_name',
  'designation',
  'designation_name',
];

function toOrgLabelRef(doc) {
  if (!doc) return null;
  const id = doc._id || doc.id;
  if (!id) return null;
  return {
    _id: id,
    name: doc.name || '',
    code: doc.code || '',
    id: String(id),
  };
}

function overlayOrgDynamicFields(target, source) {
  if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
    return target;
  }
  for (const key of ORG_DYNAMIC_KEYS) {
    if (source[key] !== undefined) target[key] = source[key];
  }
  return target;
}

/**
 * Keep denormalized dynamicFields.division / department / designation in sync with master ids.
 * Transfer/timeline updates master fields but historically left these labels stale.
 */
function applyOrgLabelsToDynamicFields(employee, { division, department, designation } = {}) {
  if (!employee) return false;
  if (!employee.dynamicFields || typeof employee.dynamicFields !== 'object') {
    employee.dynamicFields = {};
  }
  const df = employee.dynamicFields;
  let changed = false;

  const applyOne = (doc, objectKey, nameKey) => {
    const next = toOrgLabelRef(doc);
    if (!next) return;
    if (df[nameKey] !== next.name || !sameId(df[objectKey], next._id)) {
      df[objectKey] = next;
      df[nameKey] = next.name;
      changed = true;
    }
  };

  applyOne(division, 'division', 'division_name');
  applyOne(department, 'department', 'department_name');
  applyOne(designation, 'designation', 'designation_name');

  if (changed && typeof employee.markModified === 'function') {
    employee.markModified('dynamicFields');
  }
  return changed;
}

function orgDocFromRef(value) {
  if (!value || typeof value !== 'object') return null;
  if (value.name && (value._id || value.id)) return value;
  return null;
}

async function loadOrgLabelDocs(employee) {
  const Division = require('../../departments/model/Division');
  const Department = require('../../departments/model/Department');
  const Designation = require('../../departments/model/Designation');

  const [division, department, designation] = await Promise.all([
    orgDocFromRef(employee.division_id)
      ? Promise.resolve(orgDocFromRef(employee.division_id))
      : employee.division_id
        ? Division.findById(employee.division_id).select('name code').lean()
        : null,
    orgDocFromRef(employee.department_id)
      ? Promise.resolve(orgDocFromRef(employee.department_id))
      : employee.department_id
        ? Department.findById(employee.department_id).select('name code').lean()
        : null,
    orgDocFromRef(employee.designation_id)
      ? Promise.resolve(orgDocFromRef(employee.designation_id))
      : employee.designation_id
        ? Designation.findById(employee.designation_id).select('name code').lean()
        : null,
  ]);

  return { division, department, designation };
}

async function syncEmployeeOrgDynamicFields(employee) {
  if (!employee) return false;
  const docs = await loadOrgLabelDocs(employee);
  return applyOrgLabelsToDynamicFields(employee, docs);
}

function segmentCoversDate(seg, date) {
  const d = startOfUtcDay(date);
  if (!d || !seg?.effectiveFrom) return false;
  const from = startOfUtcDay(seg.effectiveFrom);
  const to = seg.effectiveTo ? endOfUtcDay(seg.effectiveTo) : null;
  if (d < from) return false;
  if (to && d > to) return false;
  return true;
}

function segmentsOverlapRange(seg, rangeStart, rangeEnd) {
  const rs = startOfUtcDay(rangeStart);
  const re = endOfUtcDay(rangeEnd);
  if (!rs || !re || !seg?.effectiveFrom) return false;
  const from = startOfUtcDay(seg.effectiveFrom);
  const to = seg.effectiveTo ? endOfUtcDay(seg.effectiveTo) : re;
  return from <= re && to >= rs;
}

function getOrgAsOfFromEmployee(employee, date = new Date()) {
  const list = Array.isArray(employee?.orgHistory) ? employee.orgHistory : [];
  if (list.length) {
    const hit = list.find((s) => segmentCoversDate(s, date));
    if (hit) {
      return {
        division_id: hit.division_id || null,
        department_id: hit.department_id || null,
        designation_id: hit.designation_id || null,
        effectiveFrom: hit.effectiveFrom,
        effectiveTo: hit.effectiveTo || null,
        source: hit.source,
      };
    }
  }
  // Fallback to master
  return {
    division_id: employee?.division_id || null,
    department_id: employee?.department_id || null,
    designation_id: employee?.designation_id || null,
    effectiveFrom: null,
    effectiveTo: null,
    source: 'master',
  };
}

function getSalaryAsOfFromEmployee(employee, date = new Date()) {
  const list = Array.isArray(employee?.salaryHistory) ? employee.salaryHistory : [];
  if (list.length) {
    const hit = list.find((s) => segmentCoversDate(s, date));
    if (hit) {
      return {
        gross_salary: Number(hit.gross_salary) || 0,
        effectiveFrom: hit.effectiveFrom,
        effectiveTo: hit.effectiveTo || null,
        source: hit.source,
      };
    }
  }
  return {
    gross_salary: Number(employee?.gross_salary) || 0,
    effectiveFrom: null,
    effectiveTo: null,
    source: 'master',
  };
}

/**
 * Ensure employee has at least one open org + salary segment (from doj or today).
 */
function ensureInitialTimeline(employee) {
  if (!employee) return { orgAdded: false, salaryAdded: false };
  const from = startOfUtcDay(employee.doj || employee.createdAt || new Date()) || startOfUtcDay(new Date());
  let orgAdded = false;
  let salaryAdded = false;

  if (!Array.isArray(employee.orgHistory)) employee.orgHistory = [];
  if (!Array.isArray(employee.salaryHistory)) employee.salaryHistory = [];

  if (employee.orgHistory.length === 0 && (employee.division_id || employee.department_id)) {
    employee.orgHistory.push({
      division_id: employee.division_id || null,
      department_id: employee.department_id || null,
      designation_id: employee.designation_id || null,
      effectiveFrom: from,
      effectiveTo: null,
      source: 'backfill',
      requestId: null,
    });
    orgAdded = true;
  }

  if (employee.salaryHistory.length === 0) {
    employee.salaryHistory.push({
      gross_salary: Number(employee.gross_salary) || 0,
      effectiveFrom: from,
      effectiveTo: null,
      source: 'backfill',
      requestId: null,
    });
    salaryAdded = true;
  }

  return { orgAdded, salaryAdded };
}

/**
 * Close open org segment and open a new one from effectiveFrom.
 * Does not mutate master fields unless applyMaster=true and effectiveFrom <= today.
 */
function applyOrgChange(employee, {
  division_id,
  department_id,
  designation_id,
  effectiveFrom,
  source = 'transfer',
  requestId = null,
  applyMaster = true,
}) {
  ensureInitialTimeline(employee);
  const D = startOfUtcDay(effectiveFrom);
  if (!D) throw new Error('Invalid effectiveFrom for org change');

  const today = startOfUtcDay(new Date());
  const list = employee.orgHistory;
  // Close any segment that covers D or is open and starts before D
  for (const seg of list) {
    if (!seg.effectiveTo && startOfUtcDay(seg.effectiveFrom) < D) {
      seg.effectiveTo = addDaysUtc(D, -1);
    } else if (
      seg.effectiveTo &&
      startOfUtcDay(seg.effectiveFrom) < D &&
      endOfUtcDay(seg.effectiveTo) >= D
    ) {
      seg.effectiveTo = addDaysUtc(D, -1);
    }
  }
  // Remove segments that start on/after D (replace future pending)
  employee.orgHistory = list.filter((seg) => startOfUtcDay(seg.effectiveFrom) < D);

  const resolvedDivision =
    division_id || employee.division_id || null;

  employee.orgHistory.push({
    division_id: resolvedDivision,
    department_id: department_id || null,
    designation_id: designation_id != null ? designation_id : employee.designation_id || null,
    effectiveFrom: D,
    effectiveTo: null,
    source,
    requestId: requestId || null,
  });

  if (applyMaster && D <= today) {
    // Prefer explicit division; if omitted, keep current master division (depts may be multi-div).
    if (division_id) employee.division_id = division_id;
    if (department_id) employee.department_id = department_id;
    if (designation_id) employee.designation_id = designation_id;
  }

  return { effectiveFrom: D, appliedMaster: applyMaster && D <= today };
}

function applySalaryChange(employee, {
  gross_salary,
  effectiveFrom,
  source = 'promotion',
  requestId = null,
  applyMaster = true,
}) {
  ensureInitialTimeline(employee);
  const D = startOfUtcDay(effectiveFrom);
  if (!D) throw new Error('Invalid effectiveFrom for salary change');
  const today = startOfUtcDay(new Date());
  const list = employee.salaryHistory;

  for (const seg of list) {
    if (!seg.effectiveTo && startOfUtcDay(seg.effectiveFrom) < D) {
      seg.effectiveTo = addDaysUtc(D, -1);
    } else if (
      seg.effectiveTo &&
      startOfUtcDay(seg.effectiveFrom) < D &&
      endOfUtcDay(seg.effectiveTo) >= D
    ) {
      seg.effectiveTo = addDaysUtc(D, -1);
    }
  }
  employee.salaryHistory = list.filter((seg) => startOfUtcDay(seg.effectiveFrom) < D);

  const gross = Number(gross_salary);
  employee.salaryHistory.push({
    gross_salary: Number.isFinite(gross) ? gross : 0,
    effectiveFrom: D,
    effectiveTo: null,
    source,
    requestId: requestId || null,
  });

  if (applyMaster && D <= today && Number.isFinite(gross)) {
    employee.gross_salary = gross;
  }

  return { effectiveFrom: D, appliedMaster: applyMaster && D <= today };
}

/**
 * Apply any org/salary segments whose effectiveFrom is today or earlier but master is stale.
 */
function applyDueTimelineToMaster(employee, asOf = new Date()) {
  ensureInitialTimeline(employee);
  const org = getOrgAsOfFromEmployee(employee, asOf);
  const sal = getSalaryAsOfFromEmployee(employee, asOf);
  let changed = false;
  if (org.division_id && !sameId(employee.division_id, org.division_id)) {
    employee.division_id = org.division_id;
    changed = true;
  }
  if (org.department_id && !sameId(employee.department_id, org.department_id)) {
    employee.department_id = org.department_id;
    changed = true;
  }
  if (org.designation_id && !sameId(employee.designation_id, org.designation_id)) {
    employee.designation_id = org.designation_id;
    changed = true;
  }
  if (Number(employee.gross_salary) !== Number(sal.gross_salary)) {
    employee.gross_salary = sal.gross_salary;
    changed = true;
  }
  return changed;
}

/**
 * Build payroll calculation windows for a pay cycle from org + salary timeline change points.
 */
function listPayrollSegmentsForRange(employee, rangeStart, rangeEnd) {
  ensureInitialTimeline(employee);
  const rs = startOfUtcDay(rangeStart);
  const re = startOfUtcDay(rangeEnd);
  if (!rs || !re || rs > re) return [];

  const boundaries = new Set([rs.getTime(), addDaysUtc(re, 1).getTime()]);
  for (const seg of employee.orgHistory || []) {
    const f = startOfUtcDay(seg.effectiveFrom);
    if (f && f > rs && f <= re) boundaries.add(f.getTime());
  }
  for (const seg of employee.salaryHistory || []) {
    const f = startOfUtcDay(seg.effectiveFrom);
    if (f && f > rs && f <= re) boundaries.add(f.getTime());
  }

  const sorted = [...boundaries].sort((a, b) => a - b);
  const windows = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = new Date(sorted[i]);
    const to = addDaysUtc(new Date(sorted[i + 1]), -1);
    if (from > re || to < rs) continue;
    const wFrom = from < rs ? rs : from;
    const wTo = to > re ? re : to;
    if (wFrom > wTo) continue;
    const org = getOrgAsOfFromEmployee(employee, wFrom);
    const sal = getSalaryAsOfFromEmployee(employee, wFrom);
    windows.push({
      segmentIndex: windows.length,
      startDate: wFrom,
      endDate: wTo,
      division_id: org.division_id,
      department_id: org.department_id,
      designation_id: org.designation_id,
      gross_salary: sal.gross_salary,
    });
  }
  return windows;
}

/**
 * Find employees whose org history overlaps division/department filters in [rangeStart, rangeEnd].
 * Falls back to master fields when orgHistory empty.
 */
async function findEmployeesMatchingOrgInRange(Employee, {
  divisionIds = [],
  departmentIds = [],
  rangeStart,
  rangeEnd,
  extraFilter = {},
  select = '_id emp_no employee_name division_id department_id designation_id orgHistory leftDate is_active doj',
}) {
  const divSet = (divisionIds || []).map(String).filter(Boolean);
  const deptSet = (departmentIds || []).map(String).filter(Boolean);
  const rs = startOfUtcDay(rangeStart) || startOfUtcDay(new Date());
  const re = endOfUtcDay(rangeEnd) || endOfUtcDay(new Date());

  const employees = await Employee.find(extraFilter).select(select).lean();
  return employees.filter((emp) => {
    const hist = Array.isArray(emp.orgHistory) ? emp.orgHistory : [];
    if (hist.length === 0) {
      const divOk = !divSet.length || divSet.includes(idStr(emp.division_id));
      const deptOk = !deptSet.length || deptSet.includes(idStr(emp.department_id));
      return divOk && deptOk;
    }
    return hist.some((seg) => {
      if (!segmentsOverlapRange(seg, rs, re)) return false;
      const divOk = !divSet.length || divSet.includes(idStr(seg.division_id));
      const deptOk = !deptSet.length || deptSet.includes(idStr(seg.department_id));
      return divOk && deptOk;
    });
  });
}

async function getOrgAsOf(empNoOrEmployee, date, EmployeeModel) {
  let emp = empNoOrEmployee;
  if (!emp || !emp.orgHistory) {
    const Employee = EmployeeModel || mongoose.model('Employee');
    emp = await Employee.findOne({ emp_no: String(empNoOrEmployee).toUpperCase() })
      .select('division_id department_id designation_id orgHistory doj gross_salary')
      .lean();
  }
  if (!emp) return null;
  return getOrgAsOfFromEmployee(emp, date);
}

async function getSalaryAsOf(empNoOrEmployee, date, EmployeeModel) {
  let emp = empNoOrEmployee;
  if (!emp || !emp.salaryHistory) {
    const Employee = EmployeeModel || mongoose.model('Employee');
    emp = await Employee.findOne({ emp_no: String(empNoOrEmployee).toUpperCase() })
      .select('gross_salary salaryHistory doj')
      .lean();
  }
  if (!emp) return null;
  return getSalaryAsOfFromEmployee(emp, date);
}

module.exports = {
  ORG_SOURCES,
  SALARY_SOURCES,
  startOfUtcDay,
  endOfUtcDay,
  addDaysUtc,
  idStr,
  sameId,
  segmentCoversDate,
  segmentsOverlapRange,
  getOrgAsOfFromEmployee,
  getSalaryAsOfFromEmployee,
  ensureInitialTimeline,
  applyOrgChange,
  applySalaryChange,
  applyDueTimelineToMaster,
  listPayrollSegmentsForRange,
  findEmployeesMatchingOrgInRange,
  getOrgAsOf,
  getSalaryAsOf,
  ORG_DYNAMIC_KEYS,
  toOrgLabelRef,
  overlayOrgDynamicFields,
  applyOrgLabelsToDynamicFields,
  syncEmployeeOrgDynamicFields,
};
