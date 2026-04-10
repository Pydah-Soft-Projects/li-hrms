/**
 * Debug shift filtering by gender + custom employee grouping.
 *
 * Usage:
 *   node scripts/debug_shift_grouping_filter.js <EMP_NO> <YYYY-MM-DD>
 *
 * Example:
 *   node scripts/debug_shift_grouping_filter.js 5005 2026-04-07
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const Shift = require('../shifts/model/Shift');
const {
  isCustomEmployeeGroupingEnabled,
} = require('../shared/utils/customEmployeeGrouping');
const {
  getShiftsForEmployee,
} = require('../shifts/services/shiftDetectionService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

function genderMatches(configGender, employeeGender) {
  if (!configGender || configGender === 'All') return true;
  return String(configGender).toLowerCase() === String(employeeGender || '').toLowerCase();
}

function evaluateConfig(config, employee, groupingEnabled) {
  const reasons = [];
  if (!config || !config.shiftId) {
    return { pass: false, reasons: ['invalid shift config (missing shiftId)'] };
  }

  if (groupingEnabled && config.employee_group_id) {
    const cfgGroup = String(config.employee_group_id);
    const empGroup = employee.employee_group_id ? String(employee.employee_group_id) : null;
    if (!empGroup) {
      reasons.push('employee has no group but shift requires group');
    } else if (cfgGroup !== empGroup) {
      reasons.push(`group mismatch: shift=${cfgGroup} employee=${empGroup}`);
    }
  }

  if (!genderMatches(config.gender, employee.gender)) {
    reasons.push(`gender mismatch: shift=${config.gender} employee=${employee.gender || 'null'}`);
  }

  return { pass: reasons.length === 0, reasons };
}

function printSection(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function printConfigResults(label, configs, employee, groupingEnabled) {
  console.log(`\n[${label}] total configs: ${configs.length}`);
  if (!configs.length) return;

  const shiftIds = configs.map((c) => c.shiftId).filter(Boolean);
  const shiftDocs = await Shift.find({ _id: { $in: shiftIds } }).select('name').lean();
  const shiftNameById = new Map(shiftDocs.map((s) => [String(s._id), s.name]));

  for (const cfg of configs) {
    const evalResult = evaluateConfig(cfg, employee, groupingEnabled);
    const shiftId = String(cfg.shiftId);
    const shiftName = shiftNameById.get(shiftId) || 'Unknown';
    const groupText = cfg.employee_group_id ? String(cfg.employee_group_id) : 'null';
    const genderText = cfg.gender || 'All';
    if (evalResult.pass) {
      console.log(`  PASS  shift=${shiftName} (${shiftId}) gender=${genderText} group=${groupText}`);
    } else {
      console.log(`  FAIL  shift=${shiftName} (${shiftId}) gender=${genderText} group=${groupText}`);
      console.log(`        reasons: ${evalResult.reasons.join(' | ')}`);
    }
  }
}

async function main() {
  const empNo = process.argv[2];
  const date = process.argv[3];

  if (!empNo || !date) {
    console.error('Usage: node scripts/debug_shift_grouping_filter.js <EMP_NO> <YYYY-MM-DD>');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  const employee = await Employee.findOne({ emp_no: String(empNo).toUpperCase() })
    .populate('division_id')
    .populate('department_id')
    .populate('designation_id')
    .lean();

  if (!employee) {
    throw new Error(`Employee not found: ${empNo}`);
  }

  const groupingEnabled = await isCustomEmployeeGroupingEnabled();

  printSection('EMPLOYEE CONTEXT');
  console.log(`emp_no: ${employee.emp_no}`);
  console.log(`name: ${employee.employee_name}`);
  console.log(`gender: ${employee.gender || 'null'}`);
  console.log(`employee_group_id: ${employee.employee_group_id || 'null'}`);
  console.log(`groupingEnabled: ${groupingEnabled}`);
  console.log(`division: ${employee.division_id?.name || 'null'} (${employee.division_id?._id || 'null'})`);
  console.log(`department: ${employee.department_id?.name || 'null'} (${employee.department_id?._id || 'null'})`);
  console.log(`designation: ${employee.designation_id?.name || 'null'} (${employee.designation_id?._id || 'null'})`);

  const divisionId = employee.division_id?._id ? String(employee.division_id._id) : null;
  const departmentId = employee.department_id?._id ? String(employee.department_id._id) : null;

  printSection('RAW CONFIG EVALUATION');

  const desig = employee.designation_id;
  if (desig) {
    let configs = [];
    const ds = (desig.departmentShifts || []).find(
      (x) => String(x.division) === divisionId && String(x.department) === departmentId
    );
    if (ds?.shifts?.length) configs = ds.shifts;
    await printConfigResults('Designation.departmentShifts', configs, employee, groupingEnabled);

    configs = [];
    const dd = (desig.divisionDefaults || []).find((x) => String(x.division) === divisionId);
    if (dd?.shifts?.length) configs = dd.shifts;
    await printConfigResults('Designation.divisionDefaults', configs, employee, groupingEnabled);
  }

  const dept = employee.department_id;
  if (dept) {
    let configs = [];
    const dd = (dept.divisionDefaults || []).find((x) => String(x.division) === divisionId);
    if (dd?.shifts?.length) configs = dd.shifts;
    await printConfigResults('Department.divisionDefaults', configs, employee, groupingEnabled);

    await printConfigResults('Department.shifts (legacy/global)', dept.shifts || [], employee, groupingEnabled);
  }

  const div = employee.division_id;
  if (div) {
    await printConfigResults('Division.shifts', div.shifts || [], employee, groupingEnabled);
  }

  printSection('FINAL DETECTION POOL');
  const finalResult = await getShiftsForEmployee(employee.emp_no, date, {});
  console.log(`source=${finalResult.source}, count=${(finalResult.shifts || []).length}`);
  for (const s of finalResult.shifts || []) {
    console.log(`  - ${s.name} (${s._id}) [priority=${s.sourcePriority || 99}]`);
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\nERROR:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});

