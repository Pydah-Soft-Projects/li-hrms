/**
 * Resolve the shift pool exactly as shift detection does (getShiftsForEmployee),
 * for employees in a given division + department + employee group.
 *
 * INTERACTIVE (default): run with no args — numbered lists for division → department → group
 *   → date (Enter = today IST). If employees match: optional pick; if none: designation + gender for hypothetical pool.
 * CLI: pass all three --division= --department= --group= (names, ids, or unique substrings).
 *
 * Usage:
 *   node scripts/resolve_shift_pool_by_div_dept_group.js
 *   node scripts/resolve_shift_pool_by_div_dept_group.js --division="Pydah" --department="CSE" --group="Admission Cell"
 *
 * Flags (CLI):
 *   --date=YYYY-MM-DD
 *   --emp-no=EMP123
 *   --include-inactive
 *   --ignore-context-mismatch
 *   --designation=   When no Employee matches: designation name or _id (must belong to department)
 *   --gender=Male|Female|Other   Optional with hypothetical pool
 *   --help
 */

const path = require('path');
const readline = require('readline');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const Division = require('../departments/model/Division');
const Department = require('../departments/model/Department');
const EmployeeGroup = require('../employees/model/EmployeeGroup');
const Employee = require('../employees/model/Employee');
const { isCustomEmployeeGroupingEnabled } = require('../shared/utils/customEmployeeGrouping');
const {
  getShiftsForEmployee,
  getOrganizationalShiftsForContext,
} = require('../shifts/services/shiftDetectionService');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hrms';

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (raw === '--help' || raw === '-h') out.help = true;
    const m = /^--([^=]+)=(.*)$/.exec(raw);
    if (m) out[m[1]] = m[2];
    else if (raw === '--include-inactive') out.includeInactive = true;
    else if (raw === '--ignore-context-mismatch') out.ignoreContextMismatch = true;
  }
  return out;
}

function todayISTDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

/** Prompt until user enters an integer in [1, max] or empty when allowEmpty */
async function askChoice(rl, prompt, max, { allowEmpty = false, emptyLabel = 'default' } = {}) {
  const hint = allowEmpty ? `1–${max}, or Enter for ${emptyLabel}` : `1–${max}`;
  for (;;) {
    const raw = (await ask(rl, `${prompt} [${hint}]: `)).trim();
    if (!raw && allowEmpty) return null;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= max) return n;
    console.log(`  Please enter a valid number ${allowEmpty ? `(or Enter for ${emptyLabel})` : ''}.`);
  }
}

/** Inclusive range [0, max] when allowZero; otherwise [1, max]. */
async function askChoiceInclusive(rl, prompt, max, { allowZero = false } = {}) {
  const min = allowZero ? 0 : 1;
  const hint = `${min}–${max}`;
  for (;;) {
    const raw = (await ask(rl, `${prompt} [${hint}]: `)).trim();
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    console.log(`  Please enter an integer from ${hint}.`);
  }
}

async function resolveDesignationInDepartment(departmentId, value) {
  const dept = await Department.findById(departmentId).populate('designations', 'name code').lean();
  const list = (dept.designations || []).filter(Boolean);
  const v = String(value).trim();
  if (mongoose.Types.ObjectId.isValid(v) && new mongoose.Types.ObjectId(v).toString() === v) {
    const d = list.find((x) => String(x._id) === v);
    if (d) return d._id;
    throw new Error(`Designation _id ${v} is not linked to this department.`);
  }
  const rx = new RegExp(escapeRegex(v), 'i');
  const hits = list.filter((d) => d.name && rx.test(d.name));
  if (hits.length === 1) return hits[0]._id;
  if (hits.length === 0) {
    throw new Error(`No designation name match "${v}" among this department's designations.`);
  }
  throw new Error(
    `Ambiguous designation "${v}" (${hits.length} matches): ${hits.map((h) => h.name).join(', ')}`
  );
}

async function askGender(rl) {
  console.log('\nGender (shift rows marked Male/Female only match that gender; "All" matches everyone):');
  console.log('  1  Male   2  Female   3  Other   4  Unspecified');
  const g = await askChoice(rl, 'Your choice', 4, {});
  if (g === 1) return 'Male';
  if (g === 2) return 'Female';
  if (g === 3) return 'Other';
  return null;
}

async function pickSyntheticContextInteractive(rl, departmentDoc) {
  const dept = await Department.findById(departmentDoc._id).populate('designations', 'name code').lean();
  const list = (dept.designations || []).filter(Boolean);

  console.log(
    '\nNo employee in MongoDB has this exact division + department + employee group.\n' +
      'You can still see the organizational shift pool (same rules as shift detection,\n' +
      'without roster / join date / exit date — those need a real emp_no).'
  );

  if (list.length === 0) {
    console.log('\n(No designations on this department — designation tier is skipped.)');
    const gender = await askGender(rl);
    return { designationId: null, gender };
  }

  console.log('\nDESIGNATION (optional — many org rules are per designation)');
  console.log('-'.repeat(72));
  console.log(`${String(0).padStart(4)}  Skip — do not use designation-level shift rows`);
  list.forEach((d, i) => {
    console.log(`${String(i + 1).padStart(4)}  ${d.name}${d.code ? ` (${d.code})` : ''}`);
  });
  console.log('-'.repeat(72));
  const choice = await askChoiceInclusive(rl, 'Your choice', list.length, { allowZero: true });
  const designationId = choice === 0 ? null : list[choice - 1]._id;
  const gender = await askGender(rl);
  return { designationId, gender };
}

function printNumberedList(title, rows, labelFn) {
  console.log(`\n${title}`);
  console.log('-'.repeat(72));
  rows.forEach((row, i) => {
    console.log(`  ${String(i + 1).padStart(3)}  ${labelFn(row)}`);
  });
  console.log('-'.repeat(72));
}

async function resolveByIdOrName(Model, label, value, extraFilter = {}) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing --${label}=...`);
  }
  const v = String(value).trim();
  if (mongoose.Types.ObjectId.isValid(v) && new mongoose.Types.ObjectId(v).toString() === v) {
    const doc = await Model.findOne({ _id: v, ...extraFilter }).lean();
    if (!doc) throw new Error(`${label}: no document for _id=${v}`);
    return doc;
  }
  const rx = new RegExp(escapeRegex(v), 'i');
  const hits = await Model.find({ ...extraFilter, name: rx }).limit(25).lean();
  if (hits.length === 0) {
    throw new Error(`${label}: no name match for "${v}"`);
  }
  if (hits.length > 1) {
    const lines = hits.map((h) => `  - ${h._id}  ${h.name}`).join('\n');
    throw new Error(`${label}: ambiguous name "${v}" (${hits.length} matches). Use _id or a longer substring:\n${lines}`);
  }
  return hits[0];
}

function departmentLinkedToDivision(dept, div) {
  const divId = String(div._id);
  const onDivision = (div.departments || []).some((d) => String(d) === String(dept._id));
  const onDepartment = (dept.divisions || []).some((d) => String(d) === divId);
  return onDivision || onDepartment;
}

async function departmentsForDivision(division) {
  const div = await Division.findById(division._id).select('departments').lean();
  const fromDiv = (div.departments || []).map(String);
  const fromDeptField = await Department.find({ divisions: division._id }).select('_id').lean();
  const ids = [...new Set([...fromDiv, ...fromDeptField.map((d) => String(d._id))])];
  if (ids.length === 0) return [];
  return Department.find({ _id: { $in: ids } })
    .sort({ name: 1 })
    .lean();
}

function printSection(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function interactiveFlow(rl) {
  const divisions = await Division.find({ isActive: { $ne: false } })
    .sort({ name: 1 })
    .select('name code')
    .lean();

  if (!divisions.length) {
    throw new Error('No active divisions in database.');
  }

  printNumberedList('DIVISIONS — enter the number of your division', divisions, (d) => `${d.name}  (${d.code || 'no code'})`);
  const divIdx = await askChoice(rl, 'Your choice', divisions.length, {});
  const division = await Division.findById(divisions[divIdx - 1]._id).lean();

  const departments = await departmentsForDivision(division);
  if (!departments.length) {
    throw new Error(`No departments linked to division "${division.name}".`);
  }

  printNumberedList(
    `DEPARTMENTS in "${division.name}" — enter the number of your department`,
    departments,
    (d) => `${d.name}${d.code ? `  (${d.code})` : ''}`
  );
  const deptIdx = await askChoice(rl, 'Your choice', departments.length, {});
  const department = departments[deptIdx - 1];

  if (!departmentLinkedToDivision(department, division)) {
    throw new Error(
      `Department "${department.name}" is not linked to division "${division.name}" in master data.`
    );
  }

  const groups = await EmployeeGroup.find({ isActive: { $ne: false } })
    .sort({ name: 1 })
    .select('name code')
    .lean();

  let group;
  if (!groups.length) {
    const allGroups = await EmployeeGroup.find({}).sort({ name: 1 }).lean();
    if (!allGroups.length) throw new Error('No employee groups in database.');
    printNumberedList(
      'EMPLOYEE GROUPS (including inactive) — enter the number of your group',
      allGroups,
      (g) => `${g.name}${g.code ? `  (${g.code})` : ''}${g.isActive === false ? '  [inactive]' : ''}`
    );
    const gIdx = await askChoice(rl, 'Your choice', allGroups.length, {});
    group = allGroups[gIdx - 1];
  } else {
    printNumberedList('EMPLOYEE GROUPS — enter the number of your group', groups, (g) => `${g.name}${g.code ? `  (${g.code})` : ''}`);
    const gIdx = await askChoice(rl, 'Your choice', groups.length, {});
    group = groups[gIdx - 1];
  }

  const defaultDate = todayISTDateStr();
  const dateRaw = (await ask(rl, `Attendance date YYYY-MM-DD [${defaultDate}]: `)).trim();
  const date = dateRaw || defaultDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}". Use YYYY-MM-DD.`);
  }

  return { division, department, group, date };
}

async function pickEmployeeInteractively(rl, employees) {
  if (employees.length <= 1) return employees;

  printNumberedList(
    'MATCHING EMPLOYEES — pick one employee number, or 0 / Enter for auto (one pool per designation)',
    employees,
    (e) => `${e.emp_no}  ${e.employee_name || ''}  (${e.designation_id?.name || 'no designation'})`
  );
  console.log(`  ${String(0).padStart(3)}  Auto (one sample per designation)`);

  const max = employees.length;
  for (;;) {
    const raw = (await ask(rl, `Your choice [0–${max}, Enter = 0]: `)).trim();
    if (!raw || raw === '0') return employees;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= max) return [employees[n - 1]];
    console.log(`  Enter 0 or Enter for auto, or a number 1–${max}.`);
  }
}

function parseGenderCli(value) {
  if (!value || !String(value).trim()) return null;
  const x = String(value).trim();
  const cap = x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  if (['Male', 'Female', 'Other'].includes(cap)) return cap;
  throw new Error('--gender must be Male, Female, or Other (or omit for unspecified)');
}

async function printPoolResult(result, titleExtra = '') {
  printSection(`SHIFT POOL${titleExtra}`);
  console.log(`source:           ${result.source}${result.synthetic ? ' (synthetic / no Employee)' : ''}`);
  console.log(`rosteredShiftId:  ${result.rosteredShiftId || 'null'}`);
  console.log(`rosterRecordId:   ${result.rosterRecordId || 'null'}`);
  console.log(`shift count:      ${(result.shifts || []).length}`);
  console.log('shifts (name, _id, sourcePriority):');
  for (const s of result.shifts || []) {
    console.log(`  - ${s.name}  (${s._id})  priority=${s.sourcePriority ?? '?'}`);
  }
  if (!result.shifts || result.shifts.length === 0) {
    console.log('  (empty — no matching org configs for this gender/group, or no active shifts)');
  }
}

async function executePools({
  division,
  department,
  group,
  date,
  args,
  rl,
  interactiveEmployeePick,
}) {
  const includeInactive = !!args.includeInactive;
  const ignoreMismatch = !!args.ignoreContextMismatch;

  if (!departmentLinkedToDivision(department, division)) {
    throw new Error(
      `Department "${department.name}" is not linked to division "${division.name}" ` +
        `(division.departments / department.divisions).`
    );
  }

  const groupingEnabled = await isCustomEmployeeGroupingEnabled();

  printSection('RESOLVED CONTEXT');
  console.log(`division:        ${division.name} (${division._id})`);
  console.log(`department:      ${department.name} (${department._id})`);
  console.log(`employee group:  ${group.name} (${group._id})`);
  console.log(`date:            ${date}`);
  console.log(`groupingEnabled: ${groupingEnabled}`);

  let employees = [];

  if (args['emp-no']) {
    const empNo = String(args['emp-no']).trim().toUpperCase();
    const emp = await Employee.findOne({ emp_no: empNo })
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id')
      .lean();

    if (!emp) {
      throw new Error(`Employee not found: ${empNo}`);
    }

    const sameDiv = String(emp.division_id?._id || emp.division_id || '') === String(division._id);
    const sameDept = String(emp.department_id?._id || emp.department_id || '') === String(department._id);
    const sameGroup = String(emp.employee_group_id || '') === String(group._id);

    if (!ignoreMismatch && (!sameDiv || !sameDept || !sameGroup)) {
      throw new Error(
        `--emp-no=${empNo} does not match requested context.\n` +
          `Use --ignore-context-mismatch to run shift detection for this emp_no anyway.`
      );
    }
    employees = [emp];
  } else {
    const q = {
      division_id: division._id,
      department_id: department._id,
      employee_group_id: group._id,
    };
    if (!includeInactive) {
      q.is_active = { $ne: false };
    }

    employees = await Employee.find(q)
      .populate('division_id', 'name')
      .populate('department_id', 'name')
      .populate('designation_id')
      .limit(50)
      .lean();

    if (employees.length === 0) {
      let designationId = null;
      let synGender = null;
      if (args.designation) {
        designationId = await resolveDesignationInDepartment(department._id, args.designation);
      }
      if (args.gender) {
        synGender = parseGenderCli(args.gender);
      }
      if (rl && interactiveEmployeePick) {
        const picked = await pickSyntheticContextInteractive(rl, department);
        designationId = picked.designationId;
        synGender = picked.gender;
      }

      printSection('HYPOTHETICAL CONTEXT (designation + gender for filters)');
      console.log(`designationId:   ${designationId || 'null (skipped)'}`);
      console.log(`gender:          ${synGender ?? 'null (unspecified)'}`);

      const synResult = await getOrganizationalShiftsForContext({
        divisionId: division._id,
        departmentId: department._id,
        designationId,
        employeeGroupId: group._id,
        gender: synGender,
      });
      await printPoolResult(synResult, ' — hypothetical (organizational tiers only)');
      return;
    }

    if (interactiveEmployeePick && rl && employees.length > 1) {
      employees = await pickEmployeeInteractively(rl, employees);
    }
  }

  const byDesig = new Map();
  for (const emp of employees) {
    const desigId = String(emp.designation_id?._id || emp.designation_id || 'none');
    if (!byDesig.has(desigId)) byDesig.set(desigId, emp);
  }

  printSection('SAMPLE EMPLOYEES (pool is computed per designation unless you picked one employee)');
  for (const emp of byDesig.values()) {
    const dname = emp.designation_id?.name || '(no designation)';
    console.log(
      `  ${emp.emp_no}  ${emp.employee_name || ''}  designation=${dname}  gender=${emp.gender || 'null'}`
    );
  }

  for (const emp of byDesig.values()) {
    const result = await getShiftsForEmployee(emp.emp_no, date, {});
    await printPoolResult(result, ` — ${emp.emp_no} (${emp.employee_name || ''})`);
  }
}

function printHelp() {
  console.log(`
Shift pool resolver (matches shiftDetectionService.getShiftsForEmployee)

  INTERACTIVE — run with no arguments (from backend folder):
    node scripts/resolve_shift_pool_by_div_dept_group.js

  CLI — pass all three:
    node scripts/resolve_shift_pool_by_div_dept_group.js --division="..." --department="..." --group="..."

  Optional: --date=YYYY-MM-DD  --emp-no=...  --include-inactive  --ignore-context-mismatch

  If no Employee matches div+dept+group, the script still prints a hypothetical pool.
  CLI then: --designation="name or id" (designation linked to that department)
            --gender=Male|Female|Other (optional)
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const cliMode = !!(args.division && args.department && args.group);
  let division;
  let department;
  let group;
  let date = args.date && String(args.date).trim() ? String(args.date).trim() : todayISTDateStr();
  let rl;

  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 15000 });

  try {
    if (cliMode) {
      division = await resolveByIdOrName(Division, 'division', args.division);
      department = await resolveByIdOrName(Department, 'department', args.department);
      group = await resolveByIdOrName(EmployeeGroup, 'group', args.group);
    } else {
      rl = createRl();
      console.log('\nShift pool — interactive mode (type the number for each step, then Enter)\n');
      const picked = await interactiveFlow(rl);
      division = picked.division;
      department = picked.department;
      group = picked.group;
      date = picked.date;
    }

    await executePools({
      division,
      department,
      group,
      date,
      args,
      rl,
      interactiveEmployeePick: !cliMode,
    });
  } finally {
    if (rl) rl.close();
    await mongoose.disconnect();
  }
}

main().catch(async (err) => {
  console.error('\nERROR:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
