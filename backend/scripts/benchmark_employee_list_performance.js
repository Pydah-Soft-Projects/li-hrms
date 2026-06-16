/**
 * Benchmark employee list performance: legacy vs optimized paths.
 * Run: node scripts/benchmark_employee_list_performance.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Employee = require('../employees/model/Employee');
const User = require('../users/model/User');
require('../departments/model/Division');
require('../departments/model/Department');
require('../departments/model/Designation');
require('../employees/model/EmployeeGroup');
const { EMP_NO_SORT, EMP_NO_COLLATION } = require('../shared/utils/employeeSort');

const EMPLOYEE_SUMMARY_SELECT =
  '_id emp_no employee_name division_id department_id designation_id employee_group_id is_active leftDate profilePhoto dob phone_number email';

const toPlainObject = (doc) => (doc?.toObject ? doc.toObject() : doc);

const extractReportingToUserIdStrings = (reportingToField) => {
  if (!Array.isArray(reportingToField) || reportingToField.length === 0) return [];
  const userIds = [];
  for (const id of reportingToField) {
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) userIds.push(id);
    else if (id && typeof id === 'object') {
      if (id._id && mongoose.Types.ObjectId.isValid(id._id)) userIds.push(id._id.toString());
      else if (mongoose.Types.ObjectId.isValid(id)) userIds.push(id.toString());
    }
  }
  return userIds;
};

const buildUserMapForEmployeeDocs = async (employees) => {
  const allIds = new Set();
  for (const employee of employees) {
    const plainObj = toPlainObject(employee);
    const df = plainObj.dynamicFields;
    const rt = plainObj.reporting_to || plainObj.reporting_to_ || df?.reporting_to || df?.reporting_to_;
    extractReportingToUserIdStrings(rt).forEach((id) => allIds.add(id));
  }
  if (allIds.size === 0) return new Map();
  const objectIds = [...allIds]
    .map((id) => {
      try {
        return new mongoose.Types.ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!objectIds.length) return new Map();
  const users = await User.find({ _id: { $in: objectIds } }).select('_id name email role').lean();
  const userMap = new Map();
  users.forEach((u) => userMap.set(u._id.toString(), u));
  return userMap;
};

const legacyTransformOne = async (employee) => {
  const plainObj = toPlainObject(employee);
  const { dynamicFields, ...permanentFields } = plainObj;
  let populatedDynamicFields = dynamicFields || {};
  if (dynamicFields?.reporting_to || dynamicFields?.reporting_to_) {
    const field = dynamicFields.reporting_to || dynamicFields.reporting_to_;
    const ids = extractReportingToUserIdStrings(field);
    if (ids.length) {
      const users = await User.find({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) } })
        .select('_id name email role')
        .lean();
      const userMap = new Map(users.map((u) => [u._id.toString(), u]));
      populatedDynamicFields = {
        ...dynamicFields,
        reporting_to: field.map((id) => {
          const idStr = typeof id === 'string' ? id : id?._id?.toString?.() || String(id);
          return userMap.get(idStr) || id;
        }),
      };
    }
  }
  return { ...populatedDynamicFields, ...permanentFields, dynamicFields: populatedDynamicFields };
};

const mapSummaryEmployeeRow = (emp) => ({
  _id: emp._id,
  emp_no: emp.emp_no,
  employee_name: emp.employee_name,
  division_id: emp.division_id,
  department_id: emp.department_id,
  designation_id: emp.designation_id,
  employee_group_id: emp.employee_group_id,
  division: emp.division_id,
  department: emp.department_id,
  designation: emp.designation_id,
  employee_group: emp.employee_group_id,
  is_active: emp.is_active,
  leftDate: emp.leftDate,
  profilePhoto: emp.profilePhoto,
  dob: emp.dob,
  phone_number: emp.phone_number,
  email: emp.email,
});

async function runLegacyFullList(query, limit) {
  const start = process.hrtime.bigint();
  const mongoEmployees = await Employee.find(query)
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .populate('employee_group_id', 'name code isActive')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .limit(limit);
  const employees = await Promise.all(mongoEmployees.map((emp) => legacyTransformOne(emp)));
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const bytes = Buffer.byteLength(JSON.stringify(employees), 'utf8');
  return { ms, count: employees.length, bytes, userQueries: 'N per employee (reporting_to)' };
}

async function runOptimizedFullList(query, limit) {
  const start = process.hrtime.bigint();
  const mongoEmployees = await Employee.find(query)
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .populate('employee_group_id', 'name code isActive')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .limit(limit)
    .lean();
  const userMap = await buildUserMapForEmployeeDocs(mongoEmployees);
  const employees = await Promise.all(
    mongoEmployees.map(async (emp) => {
      const plainObj = toPlainObject(emp);
      const { dynamicFields, ...permanentFields } = plainObj;
      let populatedDynamicFields = dynamicFields || {};
      if (dynamicFields) {
        const rt = dynamicFields.reporting_to || dynamicFields.reporting_to_;
        if (rt && Array.isArray(rt) && rt.length && userMap.size) {
          populatedDynamicFields = {
            ...dynamicFields,
            reporting_to: rt.map((id) => {
              const idStr = typeof id === 'string' ? id : id?._id?.toString?.() || String(id);
              return userMap.get(idStr) || id;
            }),
          };
        }
      }
      return { ...populatedDynamicFields, ...permanentFields, dynamicFields: populatedDynamicFields };
    })
  );
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const bytes = Buffer.byteLength(JSON.stringify(employees), 'utf8');
  return { ms, count: employees.length, bytes, userQueries: '1 batched' };
}

async function runSummaryList(query, limit) {
  const start = process.hrtime.bigint();
  const mongoEmployees = await Employee.find(query)
    .select(EMPLOYEE_SUMMARY_SELECT)
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .populate('employee_group_id', 'name code isActive')
    .sort(EMP_NO_SORT)
    .collation(EMP_NO_COLLATION)
    .limit(limit)
    .lean();
  const employees = mongoEmployees.map(mapSummaryEmployeeRow);
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const bytes = Buffer.byteLength(JSON.stringify(employees), 'utf8');
  return { ms, count: employees.length, bytes, userQueries: 0 };
}

async function runBirthdayLegacy(limit) {
  const start = process.hrtime.bigint();
  const all = await Employee.find({})
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .limit(limit)
    .lean();
  const today = new Date();
  const filtered = all.filter((emp) => {
    if (!emp.dob) return false;
    const dob = new Date(emp.dob);
    return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
  });
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const bytes = Buffer.byteLength(JSON.stringify(all), 'utf8');
  return { ms, count: filtered.length, bytes, scanned: all.length };
}

async function runBirthdayOptimized() {
  const start = process.hrtime.bigint();
  const now = new Date();
  const data = await Employee.find({
    dob: { $exists: true, $ne: null },
    $expr: {
      $and: [
        { $eq: [{ $month: '$dob' }, now.getMonth() + 1] },
        { $eq: [{ $dayOfMonth: '$dob' }, now.getDate()] },
      ],
    },
  })
    .select('_id emp_no employee_name dob division_id department_id designation_id')
    .populate('division_id', 'name code')
    .populate('department_id', 'name code')
    .populate('designation_id', 'name code')
    .lean();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;
  const bytes = Buffer.byteLength(JSON.stringify(data), 'utf8');
  return { ms, count: data.length, bytes, scanned: data.length };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function printRow(label, before, after, unit = 'ms') {
  const speedup = before > 0 ? (before / after).toFixed(2) : '—';
  const saved = before > 0 ? `${(((before - after) / before) * 100).toFixed(1)}%` : '—';
  console.log(`  ${label.padEnd(28)} before: ${String(before).padStart(10)}${unit}  after: ${String(after).padStart(10)}${unit}  speedup: ${speedup}x  saved: ${saved}`);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  const totalEmployees = await Employee.countDocuments({});
  const activeQuery = { is_active: { $ne: false } };

  console.log('\n=== HRMS Employee List Performance Benchmark ===');
  console.log(`Database employees: ${totalEmployees}`);
  console.log(`Run at: ${new Date().toISOString()}\n`);

  const limits = [50, 200, 500, 1000, 2000].filter((n) => n <= Math.max(totalEmployees, 50));

  console.log('--- Employee list (active) ---');
  for (const limit of limits) {
    console.log(`\nLimit: ${limit}`);
    const legacy = await runLegacyFullList(activeQuery, limit);
    const optimized = await runOptimizedFullList(activeQuery, limit);
    const summary = await runSummaryList(activeQuery, limit);

    printRow('Full list (legacy)', legacy.ms.toFixed(2), optimized.ms.toFixed(2));
    printRow('Payload full legacy', legacy.bytes, optimized.bytes, ' bytes');
    console.log(
      `  ${'Summary list (new)'.padEnd(28)} ${summary.ms.toFixed(2)}ms  payload: ${formatBytes(summary.bytes)}  (${((1 - summary.bytes / legacy.bytes) * 100).toFixed(1)}% smaller than legacy full)`
    );
    console.log(
      `  ${'Speedup summary vs legacy'.padEnd(28)} ${(legacy.ms / summary.ms).toFixed(2)}x faster, ${((1 - summary.bytes / legacy.bytes) * 100).toFixed(1)}% less data`
    );
  }

  const bulkLimit = Math.min(totalEmployees || 500, 2000);
  if (bulkLimit >= 100) {
    console.log('\n--- Dashboard birthday pattern (simulate) ---');
    const bLegacy = await runBirthdayLegacy(bulkLimit);
    const bOpt = await runBirthdayOptimized();
    printRow('Birthday fetch', bLegacy.ms.toFixed(2), bOpt.ms.toFixed(2));
    console.log(`  Legacy scanned ${bLegacy.scanned} employees client-filter → ${bLegacy.count} birthdays, payload ${formatBytes(bLegacy.bytes)}`);
    console.log(`  Optimized server-filter → ${bOpt.count} birthdays, payload ${formatBytes(bOpt.bytes)}`);
  }

  // Loan report aggregation benchmark if loans exist
  try {
    const Loan = require('../loans/model/Loan');
    const Division = require('../departments/model/Division');
    const loanCount = await Loan.countDocuments({ isActive: true });
    if (loanCount > 0) {
      console.log('\n--- Loan report groupBy=department ---');
      const query = { isActive: true, status: { $in: ['disbursed', 'active', 'completed'] } };
      const departments = await require('../departments/model/Department').find({ isActive: { $ne: false } }).select('name').lean();

      const legacyStart = process.hrtime.bigint();
      let legacyGroups = 0;
      for (const child of departments.slice(0, 50)) {
        const childQuery = { ...query, department: child._id };
        const r = await Loan.aggregate([
          { $match: childQuery },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              distributed: { $sum: '$amount' },
            },
          },
        ]);
        if (r[0]?.count > 0) legacyGroups += 1;
      }
      const legacyMs = Number(process.hrtime.bigint() - legacyStart) / 1e6;

      const optStart = process.hrtime.bigint();
      const grouped = await Loan.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$department',
            count: { $sum: 1 },
            distributed: { $sum: '$amount' },
          },
        },
        { $match: { count: { $gt: 0 }, _id: { $ne: null } } },
      ]);
      const optMs = Number(process.hrtime.bigint() - optStart) / 1e6;

      printRow(`Dept loops (max 50 depts)`, legacyMs.toFixed(2), optMs.toFixed(2));
      console.log(`  Legacy groups found: ${legacyGroups}, Optimized groups: ${grouped.length}, Total loans: ${loanCount}`);
    }
  } catch (e) {
    console.log('\n(Skipped loan benchmark:', e.message, ')');
  }

  // Pay register list benchmark
  try {
    const PayRegisterSummary = require('../pay-register/model/PayRegisterSummary');
    const samplePr = await PayRegisterSummary.findOne({}).select('month employeeId').lean();
    if (samplePr?.month) {
      const month = samplePr.month;
      const empIds = await Employee.find(activeQuery).select('_id').sort(EMP_NO_SORT).collation(EMP_NO_COLLATION).limit(50).lean();
      const employeeIds = empIds.map((e) => e._id);
      const PAY_REGISTER_LIST_FIELDS =
        'employeeId emp_no month status totals lastEditedAt startDate endDate totalDaysInMonth summaryLocked summaryLockedAt';

      const legacyStart = process.hrtime.bigint();
      const legacyPrs = await PayRegisterSummary.find({ employeeId: { $in: employeeIds }, month })
        .populate({
          path: 'employeeId',
          select: 'employee_name emp_no department_id designation_id leftDate leftReason',
          populate: [
            { path: 'department_id', select: 'name' },
            { path: 'designation_id', select: 'name' },
          ],
        })
        .select(`${PAY_REGISTER_LIST_FIELDS} dailyRecords totalAttendanceDeductionDays attendanceDeductionBreakdown`);
      const legacyMs = Number(process.hrtime.bigint() - legacyStart) / 1e6;
      const legacyBytes = Buffer.byteLength(JSON.stringify(legacyPrs), 'utf8');

      const optWithDailyStart = process.hrtime.bigint();
      const optWithDaily = await PayRegisterSummary.find({ employeeId: { $in: employeeIds }, month })
        .select(`${PAY_REGISTER_LIST_FIELDS} dailyRecords totalAttendanceDeductionDays attendanceDeductionBreakdown`)
        .lean();
      const optWithDailyMs = Number(process.hrtime.bigint() - optWithDailyStart) / 1e6;
      const optWithDailyBytes = Buffer.byteLength(JSON.stringify(optWithDaily), 'utf8');

      const optNoDailyStart = process.hrtime.bigint();
      const optNoDaily = await PayRegisterSummary.find({ employeeId: { $in: employeeIds }, month })
        .select(`${PAY_REGISTER_LIST_FIELDS} totalAttendanceDeductionDays attendanceDeductionBreakdown`)
        .lean();
      const optNoDailyMs = Number(process.hrtime.bigint() - optNoDailyStart) / 1e6;
      const optNoDailyBytes = Buffer.byteLength(JSON.stringify(optNoDaily), 'utf8');

      console.log('\n--- Pay register list (50 employees, month ' + month + ') ---');
      printRow('With populate (legacy)', legacyMs.toFixed(2), optWithDailyMs.toFixed(2));
      console.log(`  Legacy payload: ${formatBytes(legacyBytes)}  Optimized lean+daily: ${formatBytes(optWithDailyBytes)}`);
      console.log(`  Sync mode (no dailyRecords): ${optNoDailyMs.toFixed(2)}ms  payload: ${formatBytes(optNoDailyBytes)} (${((1 - optNoDailyBytes / legacyBytes) * 100).toFixed(1)}% smaller than legacy)`);
    }
  } catch (e) {
    console.log('\n(Skipped pay register benchmark:', e.message, ')');
  }

  // Shift roster employee fetch (summary vs full)
  console.log('\n--- Shift roster employee page (50 rows) ---');
  const rosterLegacy = await runLegacyFullList(activeQuery, 50);
  const rosterSummary = await runSummaryList(activeQuery, 50);
  printRow('Roster emp list full', rosterLegacy.ms.toFixed(2), rosterSummary.ms.toFixed(2));
  console.log(`  Full payload: ${formatBytes(rosterLegacy.bytes)}  Summary payload: ${formatBytes(rosterSummary.bytes)}`);

  console.log('\n=== Summary ===');
  console.log('Optimized full list: lean() + batched User lookups');
  console.log('Summary view: minimal fields for dropdowns/reports');
  console.log('Birthdays: server-side $expr filter instead of loading all employees');
  console.log('Loan reports: single $group aggregation instead of per-department loops');
  console.log('Pay register: lean queries, no employee populate, optional omit dailyRecords for sync');
  console.log('Shift roster: summary employee list + paginated export\n');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
