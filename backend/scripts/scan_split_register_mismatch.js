/**
 * Find employees where split-approved leave days != leave register DEBIT rows.
 * Same class of bug as emp 7005 (register not updated after split).
 *
 * Usage:
 *   node scripts/scan_split_register_mismatch.js
 *   node scripts/scan_split_register_mismatch.js --fy 2026
 *   node scripts/scan_split_register_mismatch.js --empNo 7005
 */
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const { findMismatchedSplitLeaves } = require('../leaves/services/leaveRegisterSplitSyncService');

function parseFy() {
  const i = process.argv.indexOf('--fy');
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]).trim();
  return null;
}

function parseEmpNo() {
  const i = process.argv.indexOf('--empNo');
  if (i >= 0 && process.argv[i + 1]) return String(process.argv[i + 1]).trim();
  return null;
}

async function main() {
  const fyFilter = parseFy();
  const empNo = parseEmpNo();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }
  await mongoose.connect(uri);

  const mismatches = await findMismatchedSplitLeaves({ fyFilter, empNo });

  const empIds = [...new Set(mismatches.map((m) => String(m.employeeId)))];
  const emps = await Employee.find({ _id: { $in: empIds } })
    .select('_id emp_no employee_name is_active')
    .lean();
  const empMap = new Map(emps.map((e) => [String(e._id), e]));

  const byEmployee = new Map();
  for (const m of mismatches) {
    const emp = empMap.get(String(m.employeeId));
    const k = String(m.emp_no);
    if (!byEmployee.has(k)) {
      byEmployee.set(k, {
        emp_no: m.emp_no,
        employee_name: emp?.employee_name || null,
        is_active: emp?.is_active,
        cases: [],
      });
    }
    byEmployee.get(k).cases.push({
      leaveId: m.leaveId,
      fromDate: m.fromDate,
      toDate: m.toDate,
      requestDays: m.requestDays,
      leaveType: m.leaveType,
      approvedByType: m.approvedByType,
      registerDebits: m.registerDebits,
      typeDiffs: m.typeDiffs,
      plannedDebits: m.plannedDebits,
    });
  }

  const employees = [...byEmployee.values()].map((e) => ({
    ...e,
    mismatchCount: e.cases.length,
    totalExcessDebitDays: e.cases.reduce(
      (s, c) =>
        s + c.typeDiffs.reduce((t, d) => t + Math.max(0, Number(d.excessDebit) || 0), 0),
      0
    ),
  }));

  const summary = {
    scannedAt: new Date().toISOString(),
    fyFilter: fyFilter || null,
    empNoFilter: empNo || null,
    mismatchedLeaves: mismatches.length,
    affectedEmployees: employees.length,
    employees,
  };

  console.log(JSON.stringify(summary, null, 2));

  const jsonPath = path.join(__dirname, '_split_register_mismatch_scan.json');
  const csvPath = path.join(__dirname, '_split_register_mismatch_scan.csv');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

  const csvLines = [
    'emp_no,employee_name,is_active,mismatch_count,total_excess_debit_days,leave_id,from_date,to_date,request_days,type,approved_split,register_debit,excess',
  ];
  for (const e of employees) {
    for (const c of e.cases) {
      for (const d of c.typeDiffs) {
        csvLines.push(
          [
            e.emp_no,
            JSON.stringify(e.employee_name || ''),
            e.is_active,
            e.mismatchCount,
            e.totalExcessDebitDays,
            c.leaveId,
            c.fromDate,
            c.toDate,
            c.requestDays,
            d.leaveType,
            d.approvedSplitDays,
            d.registerDebitDays,
            d.excessDebit,
          ].join(',')
        );
      }
    }
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'));
  console.error('Written:', jsonPath);
  console.error('Written:', csvPath);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
