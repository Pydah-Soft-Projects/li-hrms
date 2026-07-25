/**
 * Analyze the CCL leave flood for emp 1434 (and org-wide) — read-only.
 *   MONGODB_URI=mongodb://127.0.0.1:27017/ravi-1 node scripts/diag_emp1434_leave_flood_analysis.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const util = require('util');
const Leave = require('../leaves/model/Leave');
const Employee = require('../employees/model/Employee');
const { extractISTComponents } = require('../shared/utils/dateUtils');

const EMP_NO = '1434';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('DB:', mongoose.connection.name);
  const emp = await Employee.findOne({ emp_no: EMP_NO }).lean();

  const FLOOD_START = new Date('2026-07-25T00:00:00Z');

  // 1) All leaves for this employee created today
  const todays = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    createdAt: { $gte: FLOOD_START },
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log('\n=== Emp 1434 leaves created on 2026-07-25 ===', todays.length);

  // Group by from-to-type-status
  const groups = new Map();
  for (const l of todays) {
    const key = [
      extractISTComponents(l.fromDate).dateStr,
      extractISTComponents(l.toDate).dateStr,
      l.leaveType,
      l.status,
      l.isActive,
    ].join(' | ');
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  console.log('\nGrouped (from | to | type | status | isActive -> count):');
  [...groups.entries()].sort().forEach(([k, v]) => console.log(`  ${k}  ->  ${v}`));

  // Applied-by / created-by fields
  const byApplier = new Map();
  for (const l of todays) {
    const key = util.inspect({
      appliedBy: l.appliedBy ? String(l.appliedBy) : null,
      appliedByModel: l.appliedByModel,
      source: l.source,
      isAdminApplied: l.isAdminApplied,
      assignedBy: l.assignedBy ? String(l.assignedBy) : null,
    });
    byApplier.set(key, (byApplier.get(key) || 0) + 1);
  }
  console.log('\nGrouped by applier/source:');
  [...byApplier.entries()].forEach(([k, v]) => console.log(`  ${v}x ${k}`));

  // Time distribution
  if (todays.length) {
    console.log('\nFirst created:', todays[0].createdAt, '| Last created:', todays[todays.length - 1].createdAt);
  }

  // 2) One full sample doc
  console.log('\n=== FULL SAMPLE LEAVE DOC (first of the flood) ===');
  console.log(util.inspect(todays[0], { depth: 6, maxArrayLength: 20 }));

  // 3) Org-wide: how many leaves were created today, how many employees affected
  const orgToday = await Leave.aggregate([
    { $match: { createdAt: { $gte: FLOOD_START } } },
    {
      $group: {
        _id: { emp: '$emp_no', type: '$leaveType', status: '$status' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  const totalToday = orgToday.reduce((s, g) => s + g.count, 0);
  const empSet = new Set(orgToday.map((g) => g._id.emp));
  console.log('\n=== ORG-WIDE leaves created on 2026-07-25 ===');
  console.log('Total docs:', totalToday, '| Distinct employees:', empSet.size);
  console.log('Top 25 groups (emp | type | status -> count):');
  orgToday.slice(0, 25).forEach((g) => console.log(`  ${g._id.emp} | ${g._id.type} | ${g._id.status} -> ${g.count}`));

  // 4) Baseline: total approved CCL leaves for 1434 created BEFORE today that overlap July period
  const before = await Leave.find({
    $or: [{ emp_no: EMP_NO }, { employeeId: emp._id }],
    createdAt: { $lt: FLOOD_START },
    fromDate: { $lte: new Date('2026-07-25T23:59:59Z') },
    toDate: { $gte: new Date('2026-06-26T00:00:00Z') },
  })
    .sort({ fromDate: 1 })
    .lean();
  console.log('\n=== Emp 1434 leaves overlapping period created BEFORE 2026-07-25 ===', before.length);
  before.forEach((l) =>
    console.log({
      id: String(l._id),
      from: extractISTComponents(l.fromDate).dateStr,
      to: extractISTComponents(l.toDate).dateStr,
      type: l.leaveType,
      status: l.status,
      isActive: l.isActive,
      createdAt: l.createdAt,
    })
  );

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
