const Employee = require('../model/Employee');
const Settings = require('../../settings/model/Settings');
const EmployeeApplicationFormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
const { resolveQualificationLabels } = require('../../employee-applications/services/fieldMappingService');
const { compareEmpNo, EMP_NO_SORT, EMP_NO_COLLATION } = require('../../shared/utils/employeeSort');
const {
  parseOverallStatusOptions,
  overallQualificationStatusLabel,
  rowQualificationStatusLabel,
} = require('../../shared/utils/qualificationStatusUtils');
const {
  buildSettingsWithResolvedQualifications,
  buildProfileResolverForEmployees,
  getQualFieldLabelsFromConfig,
} = require('../../employee-applications/services/qualificationProfileService');

const RESERVED_QUAL_KEYS = new Set([
  'status',
  'certificateurl',
  'certificatefile',
  '_legacytext',
]);

function resolveEmployeeQualifications(emp) {
  if (
    emp.dynamicFields?.qualifications &&
    Array.isArray(emp.dynamicFields.qualifications) &&
    emp.dynamicFields.qualifications.length > 0
  ) {
    return emp.dynamicFields.qualifications;
  }
  if (emp.qualifications && Array.isArray(emp.qualifications) && emp.qualifications.length > 0) {
    return emp.qualifications;
  }
  if (emp.qualifications && typeof emp.qualifications === 'string' && emp.qualifications.trim()) {
    return [{ _legacyText: emp.qualifications.trim() }];
  }
  return [];
}

function applyMultiIdFilter(filters, field, raw) {
  if (!raw || raw === 'all') return;
  const ids = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter((id) => id && id !== 'all');
  if (ids.length === 1) {
    filters[field] = ids[0];
  } else if (ids.length > 1) {
    filters[field] = { $in: ids };
  }
}

function buildCertificationFilters(scopeFilter, query) {
  const {
    division_id: divisionIdSnake,
    divisionId,
    department_id,
    department_ids,
    designation_id,
    employee_group_id,
    qualificationStatus,
    includeLeft,
    search,
    is_active,
  } = query;

  const queryFilters = {};

  if (is_active !== undefined) {
    queryFilters.is_active = is_active === 'true';
  }

  applyMultiIdFilter(queryFilters, 'division_id', divisionIdSnake || divisionId);
  applyMultiIdFilter(queryFilters, 'department_id', department_ids || department_id);
  applyMultiIdFilter(queryFilters, 'designation_id', designation_id);
  applyMultiIdFilter(queryFilters, 'employee_group_id', employee_group_id);

  if (qualificationStatus && qualificationStatus !== 'all') {
    const statuses = String(qualificationStatus)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'all');
    if (statuses.length === 1) {
      queryFilters.qualificationStatus = statuses[0];
    } else if (statuses.length > 1) {
      queryFilters.qualificationStatus = { $in: statuses };
    }
  }

  applyMultiIdFilter(queryFilters, '_id', query.employeeId);

  if (search && String(search).trim()) {
    const searchRegex = new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    queryFilters.$or = [
      { emp_no: searchRegex },
      { employee_name: searchRegex },
      { phone_number: searchRegex },
      { email: searchRegex },
    ];
  }

  if (includeLeft !== 'true') {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    queryFilters.$and = queryFilters.$and || [];
    queryFilters.$and.push({ $or: [{ leftDate: null }, { leftDate: { $gte: startOfToday } }] });
  }

  const scope = scopeFilter && typeof scopeFilter === 'object' ? scopeFilter : {};
  const hasScope = Object.keys(scope).length > 0;
  const hasQuery = Object.keys(queryFilters).length > 0;

  if (hasScope && hasQuery) return { $and: [scope, queryFilters] };
  if (hasScope) return { ...scope };
  return queryFilters;
}

function getQualFieldLabels(formSettings, qualConfig) {
  if (qualConfig) return getQualFieldLabelsFromConfig(qualConfig);
  return getQualFieldLabelsFromConfig(formSettings?.qualifications);
}

function extractQualificationFieldValues(qual, qualFieldLabels) {
  const values = {};
  qualFieldLabels.forEach((label) => {
    values[label] = '';
  });

  if (!qual || typeof qual !== 'object') return values;

  if (qual._legacyText) {
    values['Qualifications (Legacy)'] = qual._legacyText;
    return values;
  }

  Object.keys(qual).forEach((key) => {
    if (RESERVED_QUAL_KEYS.has(key.toLowerCase())) return;
    const val = qual[key];
    if (val === undefined || val === null) return;
    if (typeof val === 'object') {
      values[key] = JSON.stringify(val);
    } else {
      values[key] = String(val);
    }
    if (!qualFieldLabels.includes(key)) {
      values[key] = values[key] || String(val);
    }
  });

  qualFieldLabels.forEach((label) => {
    if (qual[label] !== undefined && qual[label] !== null) {
      values[label] = String(qual[label]);
    }
  });

  return values;
}

function hasCertificate(qual) {
  if (!qual || typeof qual !== 'object') return false;
  const url = qual.certificateUrl || qual.certificateurl;
  const file = qual.certificateFile || qual.certificatefile;
  return Boolean((url && String(url).trim()) || file);
}

function mapOrgName(ref) {
  if (!ref) return '';
  if (typeof ref === 'object' && ref.name) return ref.name;
  return '';
}

async function fetchEmployeesForReport(filters) {
  // Ensure populate refs are registered (same as employee list routes)
  require('../../departments/model/Division');
  require('../../departments/model/Department');
  require('../../departments/model/Designation');

  return Employee.find(filters)
    .select(
      'emp_no employee_name division_id department_id designation_id qualificationStatus qualifications dynamicFields is_active leftDate'
    )
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .lean();
}

async function buildRowsFromEmployees(employees, formSettings, overallStatusOptions) {
  const resolveProfile = await buildProfileResolverForEmployees(employees);
  const labelUnion = new Set();
  let hasLegacy = false;

  employees.forEach((emp) => {
    const raw = resolveEmployeeQualifications(emp);
    if (raw.some((q) => q && q._legacyText)) hasLegacy = true;
    const qualConfig = resolveProfile(emp.division_id, emp.department_id, emp.designation_id);
    getQualFieldLabels(formSettings, qualConfig).forEach((label) => labelUnion.add(label));
  });

  const exportQualLabels = [...labelUnion];
  if (hasLegacy && !exportQualLabels.includes('Qualifications (Legacy)')) {
    exportQualLabels.push('Qualifications (Legacy)');
  }

  const rows = [];
  const stats = {
    totalEmployees: employees.length,
    totalQualificationRows: 0,
    employeesWithQualifications: 0,
    employeesWithoutQualifications: 0,
    byOverallStatus: {},
  };

  employees.forEach((emp) => {
    const overallRaw = emp.qualificationStatus || 'not_submitted';
    const overallLabel = overallQualificationStatusLabel(overallRaw, overallStatusOptions);
    stats.byOverallStatus[overallLabel] = (stats.byOverallStatus[overallLabel] || 0) + 1;

    const qualConfig = resolveProfile(emp.division_id, emp.department_id, emp.designation_id);
    const scopedSettings = buildSettingsWithResolvedQualifications(formSettings, qualConfig);
    const empQualLabels = getQualFieldLabels(formSettings, qualConfig);

    const base = {
      emp_no: emp.emp_no || '',
      employee_name: emp.employee_name || '',
      division: mapOrgName(emp.division_id),
      department: mapOrgName(emp.department_id),
      designation: mapOrgName(emp.designation_id),
      overallCertificationStatus: overallLabel,
      overallCertificationStatusValue: overallRaw,
      qualificationProfileSource: qualConfig.source || 'global',
    };

    const rawQuals = resolveEmployeeQualifications(emp);
    const resolvedQuals = resolveQualificationLabels(rawQuals, scopedSettings);

    if (!resolvedQuals.length) {
      stats.employeesWithoutQualifications += 1;
      rows.push({
        ...base,
        qualificationRow: '',
        qualificationFields: exportQualLabels.reduce((acc, label) => {
          acc[label] = '';
          return acc;
        }, {}),
        rowStatus: '',
        hasCertificate: 'No',
        certificateUrl: '',
      });
      return;
    }

    stats.employeesWithQualifications += 1;
    resolvedQuals.forEach((qual, index) => {
      stats.totalQualificationRows += 1;
      const fieldValues = extractQualificationFieldValues(qual, empQualLabels.length ? empQualLabels : exportQualLabels);
      exportQualLabels.forEach((label) => {
        if (!(label in fieldValues)) fieldValues[label] = '';
      });

      const certUrl = qual.certificateUrl || qual.certificateurl || '';
      rows.push({
        ...base,
        qualificationRow: index + 1,
        qualificationFields: fieldValues,
        rowStatus: rowQualificationStatusLabel(qual.status),
        hasCertificate: hasCertificate(qual) ? 'Yes' : 'No',
        certificateUrl: certUrl ? String(certUrl) : '',
      });
    });
  });

  rows.sort((a, b) => {
    const empCmp = compareEmpNo(a.emp_no, b.emp_no);
    if (empCmp !== 0) return empCmp;
    const rowA = Number(a.qualificationRow) || 0;
    const rowB = Number(b.qualificationRow) || 0;
    return rowA - rowB;
  });

  rows.forEach((row, index) => {
    row.sNo = index + 1;
  });

  return { rows, qualFieldLabels: exportQualLabels, stats };
}

function groupRowsByEmployee(rows) {
  const ordered = [];
  const map = new Map();

  rows.forEach((row) => {
    const key = String(row.emp_no || row.employee_name || row.sNo);
    if (!map.has(key)) {
      const employee = {
        emp_no: row.emp_no,
        employee_name: row.employee_name,
        division: row.division,
        department: row.department,
        designation: row.designation,
        overallCertificationStatus: row.overallCertificationStatus,
        overallCertificationStatusValue: row.overallCertificationStatusValue,
        qualifications: [],
      };
      map.set(key, employee);
      ordered.push(employee);
    }

    const employee = map.get(key);
    const hasQualRow = row.qualificationRow !== '' && row.qualificationRow != null;
    const hasQualData = Object.values(row.qualificationFields || {}).some(
      (v) => v != null && String(v).trim() !== ''
    );

    if (hasQualRow || hasQualData) {
      employee.qualifications.push({
        rowNum: hasQualRow ? row.qualificationRow : employee.qualifications.length + 1,
        qualificationFields: row.qualificationFields || {},
        rowStatus: row.rowStatus,
        hasCertificate: row.hasCertificate,
        certificateUrl: row.certificateUrl,
      });
    }
  });

  ordered.forEach((employee, index) => {
    employee.sNo = index + 1;
  });

  return ordered;
}

async function buildCertificationReport(scopeFilter, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit, 10) || 50));

  const filters = buildCertificationFilters(scopeFilter || {}, query);

  const [formSettings, statusSetting, employees] = await Promise.all([
    EmployeeApplicationFormSettings.getActiveSettings(),
    Settings.findOne({ key: 'qualification_statuses' }).lean(),
    fetchEmployeesForReport(filters),
  ]);

  const overallStatusOptions = parseOverallStatusOptions(statusSetting?.value);
  const { rows, qualFieldLabels, stats } = await buildRowsFromEmployees(
    employees,
    formSettings,
    overallStatusOptions
  );

  const groupedEmployees = groupRowsByEmployee(rows);
  const total = groupedEmployees.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const start = (page - 1) * limit;
  const pagedEmployees = groupedEmployees.slice(start, start + limit);

  return {
    employees: pagedEmployees,
    rows: pagedEmployees,
    allRows: rows,
    allEmployees: groupedEmployees,
    qualFieldLabels,
    overallStatusOptions,
    stats,
    total,
    page,
    limit,
    totalPages,
  };
}

function rowsToExportObjects(rows, qualFieldLabels) {
  return rows.map((row) => {
    const obj = {
      'S.No': row.sNo,
      'Employee Code': row.emp_no,
      'Employee Name': row.employee_name,
      Division: row.division,
      Department: row.department,
      Designation: row.designation,
      'Overall Certification Status': row.overallCertificationStatus,
      'Qualification Row': row.qualificationRow === '' ? '' : row.qualificationRow,
    };

    qualFieldLabels.forEach((label) => {
      obj[label] = row.qualificationFields?.[label] ?? '';
    });

    obj['Row Certificate Status'] = row.rowStatus;
    obj.Certificate = row.hasCertificate;
    if (row.certificateUrl) {
      obj['Certificate URL'] = row.certificateUrl;
    }

    return obj;
  });
}

module.exports = {
  buildCertificationReport,
  buildCertificationFilters,
  rowsToExportObjects,
};