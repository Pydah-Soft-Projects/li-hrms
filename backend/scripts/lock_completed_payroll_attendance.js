const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PayrollBatch = require('../payroll/model/PayrollBatch');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const AttendanceDaily = require('../attendance/model/AttendanceDaily');
const Employee = require('../employees/model/Employee');
const { getPayrollDateRange } = require('../shared/utils/dateUtils');

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
    verbose: argv.includes('--verbose'),
  };
}

async function connectDb() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured in backend/.env');
  }
  await mongoose.connect(mongoUri);
}

async function main() {
  const { apply, verbose } = parseArgs(process.argv.slice(2));

  console.log(apply ? '[APPLY] Locking attendance for completed payroll batches' : '[DRY RUN] Previewing attendance locks for completed payroll batches');

  await connectDb();

  const completedBatches = await PayrollBatch.find({ status: 'complete' })
    .select('_id batchNumber month status completedAt employeePayrolls division department totalEmployees')
    .lean();

  console.log(`Found ${completedBatches.length} completed payroll batch(es).`);

  if (completedBatches.length === 0) {
    return;
  }

  const payrollRecords = [];
  const seenPayrollRecordIds = new Set();

  for (const batch of completedBatches) {
    const batchRecordIds = (Array.isArray(batch.employeePayrolls) ? batch.employeePayrolls : [])
      .map((id) => {
        try {
          return new mongoose.Types.ObjectId(String(id));
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    let batchPayrollRecords = await PayrollRecord.find({
      $or: [
        { payrollBatchId: batch._id },
        ...(batchRecordIds.length > 0 ? [{ _id: { $in: batchRecordIds } }] : []),
      ],
      startDate: { $exists: true, $ne: null },
      endDate: { $exists: true, $ne: null },
      emp_no: { $exists: true, $ne: null },
    })
      .select('_id payrollBatchId emp_no employeeId month startDate endDate division_id')
      .lean();

    if (batchPayrollRecords.length === 0 && batch.division && batch.month && batch.totalEmployees > 0) {
      const fallbackPayrollRecords = await PayrollRecord.find({
        month: batch.month,
        division_id: batch.division,
        startDate: { $exists: true, $ne: null },
        endDate: { $exists: true, $ne: null },
        emp_no: { $exists: true, $ne: null },
      })
        .select('_id payrollBatchId emp_no employeeId month startDate endDate division_id')
        .lean();

      if (fallbackPayrollRecords.length === Number(batch.totalEmployees)) {
        batchPayrollRecords = fallbackPayrollRecords;
        console.log(
          `Using fallback month+division payroll records for batch ${batch.batchNumber} (${fallbackPayrollRecords.length} record(s)).`
        );
      } else {
        console.log(
          `Skipping fallback for batch ${batch.batchNumber}: expected ${batch.totalEmployees} payroll record(s), found ${fallbackPayrollRecords.length}.`
        );
      }
    }

    if (
      batchPayrollRecords.length === 0 &&
      batch.division &&
      batch.department &&
      batch.month &&
      batch.totalEmployees > 0
    ) {
      const scopedEmployees = await Employee.find({
        division_id: batch.division,
        department_id: batch.department,
      })
        .select('emp_no leftDate')
        .lean();

      const eligibleEmployees = scopedEmployees.filter((employee) =>
        Employee.shouldIncludeForMonth(employee.leftDate || null, batch.month)
      );

      if (eligibleEmployees.length === Number(batch.totalEmployees)) {
        const range = await getPayrollDateRange(
          Number(String(batch.month).split('-')[0]),
          Number(String(batch.month).split('-')[1])
        );
        batchPayrollRecords = eligibleEmployees.map((employee) => ({
          _id: `employee-scope:${batch._id}:${employee.emp_no}`,
          payrollBatchId: batch._id,
          emp_no: employee.emp_no,
          employeeId: null,
          month: batch.month,
          startDate: range.startDate,
          endDate: range.endDate,
          division_id: batch.division,
        }));
        console.log(
          `Using fallback employee scope for batch ${batch.batchNumber} (${eligibleEmployees.length} employee(s)).`
        );
      } else {
        console.log(
          `Skipping employee-scope fallback for batch ${batch.batchNumber}: expected ${batch.totalEmployees} employee(s), found ${eligibleEmployees.length}.`
        );
      }
    }

    for (const record of batchPayrollRecords) {
      const key = String(record._id);
      if (seenPayrollRecordIds.has(key)) continue;
      seenPayrollRecordIds.add(key);
      payrollRecords.push(record);
    }
  }

  console.log(`Found ${payrollRecords.length} payroll record(s) linked to completed batches.`);

  if (payrollRecords.length === 0) {
    return;
  }

  const batchById = new Map(completedBatches.map((batch) => [String(batch._id), batch]));

  let matchedAttendanceDocs = 0;
  let alreadyLockedAttendanceDocs = 0;
  let updatedAttendanceDocs = 0;
  let recordsWithNoAttendance = 0;

  for (const record of payrollRecords) {
    const empNo = String(record.emp_no || '').trim().toUpperCase();
    if (!empNo || !record.startDate || !record.endDate) {
      continue;
    }

    const query = {
      employeeNumber: empNo,
      date: { $gte: record.startDate, $lte: record.endDate },
    };

    const [matchedCount, alreadyLockedCount] = await Promise.all([
      AttendanceDaily.countDocuments(query),
      AttendanceDaily.countDocuments({ ...query, locked: true }),
    ]);

    matchedAttendanceDocs += matchedCount;
    alreadyLockedAttendanceDocs += alreadyLockedCount;

    if (matchedCount === 0) {
      recordsWithNoAttendance += 1;
      if (verbose) {
        const batch = batchById.get(String(record.payrollBatchId));
        console.log(`No attendance rows for ${empNo} in ${record.startDate}..${record.endDate} (${batch?.batchNumber || record.month}).`);
      }
      continue;
    }

    if (apply) {
      const updateResult = await AttendanceDaily.updateMany(
        { ...query, locked: { $ne: true } },
        {
          $set: {
            locked: true,
          },
        }
      );
      updatedAttendanceDocs += updateResult.modifiedCount || 0;
    }

    if (verbose) {
      const batch = batchById.get(String(record.payrollBatchId));
      console.log(
        `${apply ? 'Processed' : 'Would process'} ${empNo} | ${record.startDate}..${record.endDate} | matched=${matchedCount} | alreadyLocked=${alreadyLockedCount} | batch=${batch?.batchNumber || record.month}`
      );
    }
  }

  console.log('');
  console.log('Summary');
  console.log(`- Completed batches: ${completedBatches.length}`);
  console.log(`- Payroll records scanned: ${payrollRecords.length}`);
  console.log(`- Attendance rows matched: ${matchedAttendanceDocs}`);
  console.log(`- Attendance rows already locked: ${alreadyLockedAttendanceDocs}`);
  console.log(`- Payroll records with no attendance rows: ${recordsWithNoAttendance}`);
  if (apply) {
    console.log(`- Attendance rows newly locked: ${updatedAttendanceDocs}`);
  } else {
    console.log('- No database changes were made. Re-run with --apply to lock rows.');
  }
}

main()
  .catch((error) => {
    console.error('Script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
