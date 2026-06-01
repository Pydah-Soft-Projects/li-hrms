/**
 * Integration test: Paysheet adjustment (loan EMI / salary advance)
 * Uses real MongoDB data + service layer; optional HTTP API when server is running.
 *
 * Run: node scripts/test_paysheet_adjustment_integration.js
 * Env: MONGODB_URI from .env; API_BASE, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD for API section
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const PayrollConfiguration = require('../payroll/model/PayrollConfiguration');
const PayrollRecord = require('../payroll/model/PayrollRecord');
const PayrollBatch = require('../payroll/model/PayrollBatch');
const PaysheetAdjustmentRequest = require('../payroll/model/PaysheetAdjustmentRequest');
const Employee = require('../employees/model/Employee');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const User = require('../users/model/User');
const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
const paysheetAdjustmentService = require('../payroll/services/paysheetAdjustmentService');
const outputColumnService = require('../payroll/services/outputColumnService');
const { payrollRecordToPayslipShape } = require('../payroll/utils/paysheetBundleExport');

/** Restore snapshot after tests */
let restoreSnapshot = null;

const results = { pass: 0, fail: 0, skip: 0 };
const log = [];

function ok(name, detail = '') {
  results.pass++;
  log.push({ status: 'PASS', name, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, err) {
  results.fail++;
  const msg = err?.message || String(err);
  log.push({ status: 'FAIL', name, detail: msg });
  console.log(`  ✗ ${name} — ${msg}`);
}

function skip(name, reason) {
  results.skip++;
  log.push({ status: 'SKIP', name, detail: reason });
  console.log(`  ○ ${name} — ${reason}`);
}

async function discoverData() {
  const summary = {
    divisions: 0,
    departments: 0,
    payrollRecordsWithLoan: [],
    payrollRecordsWithAdvance: [],
    batchesByStatus: {},
    config: null,
    superAdminId: null,
  };

  summary.divisions = await Division.countDocuments({ isActive: { $ne: false } });
  summary.departments = await Department.countDocuments({ isActive: { $ne: false } });

  const withEmi = await PayrollRecord.find({
    month: { $exists: true },
    'loanAdvance.totalEMI': { $gt: 0 },
  })
    .select('employeeId emp_no month loanAdvance.totalEMI loanAdvance.advanceDeduction payrollBatchId division_id department_id netSalary')
    .populate('employeeId', 'emp_no employee_name first_name last_name division_id department_id')
    .populate('payrollBatchId', 'status month division department')
    .sort({ month: -1 })
    .limit(15)
    .lean();

  const withAdv = await PayrollRecord.find({
    month: { $exists: true },
    'loanAdvance.advanceDeduction': { $gt: 0 },
  })
    .select('employeeId emp_no month loanAdvance payrollBatchId netSalary')
    .populate('payrollBatchId', 'status')
    .sort({ month: -1 })
    .limit(10)
    .lean();

  summary.payrollRecordsWithLoan = withEmi;
  summary.payrollRecordsWithAdvance = withAdv;

  const batchAgg = await PayrollBatch.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  for (const b of batchAgg) summary.batchesByStatus[b._id] = b.count;

  summary.config = await PayrollConfiguration.get();
  const admin = await User.findOne({ role: 'super_admin' }).select('_id email name').lean();
  summary.superAdminId = admin?._id;

  return summary;
}

function pickTestRecord(records, allowedBatchStatuses = ['pending', 'approved']) {
  for (const r of records) {
    const batchStatus = r.payrollBatchId?.status;
    if (!r.payrollBatchId || allowedBatchStatuses.includes(batchStatus)) {
      return r;
    }
  }
  return records[0] || null;
}

/**
 * Pick a real payroll row in a modifiable batch; inject loan/advance if DB has none (restore after tests).
 */
async function prepareRealWorldTestRecord(summary) {
  let record = pickTestRecord(summary.payrollRecordsWithLoan);
  if (!record) {
    record = await PayrollRecord.findOne({
      payrollBatchId: { $exists: true, $ne: null },
      month: { $in: ['2026-03', '2026-04', '2026-02'] },
    })
      .select(
        'employeeId emp_no month loanAdvance netSalary payrollBatchId division_id attendanceSummaryId'
      )
      .populate({
        path: 'employeeId',
        select: 'emp_no employee_name first_name last_name division_id department_id',
        populate: [
          { path: 'division_id', select: 'name' },
          { path: 'department_id', select: 'name' },
        ],
      })
      .populate('payrollBatchId', 'status month division department')
      .populate('division_id', 'name')
      .sort({ month: -1 })
      .lean();
  }

  if (!record) {
    return { record: null, injected: false };
  }

  const batchStatus = record.payrollBatchId?.status;
  if (batchStatus && !['pending', 'approved'].includes(batchStatus)) {
    const alt = await PayrollRecord.findOne({
      payrollBatchId: { $exists: true },
    })
      .populate({ path: 'payrollBatchId', match: { status: { $in: ['pending', 'approved'] } } })
      .populate('employeeId', 'emp_no employee_name division_id department_id')
      .lean();
    if (alt?.payrollBatchId) record = alt;
  }

  const needsInject =
    (record.loanAdvance?.totalEMI || 0) <= 0 && (record.loanAdvance?.advanceDeduction || 0) <= 0;

  if (needsInject) {
    const doc = await PayrollRecord.findById(record._id);
    restoreSnapshot = {
      payrollRecordId: doc._id,
      loanAdvance: JSON.parse(JSON.stringify(doc.loanAdvance || {})),
      netSalary: doc.netSalary,
      adjustmentIds: [],
    };
    const testEmi = 2500;
    const testAdv = 800;
    const net = Number(doc.netSalary) || 15000;
    doc.set('loanAdvance.totalEMI', testEmi);
    doc.set('loanAdvance.scheduledTotalEMI', testEmi);
    doc.set('loanAdvance.emiBreakdown', [
      { loanId: new mongoose.Types.ObjectId(), emiAmount: testEmi },
    ]);
    doc.set('loanAdvance.advanceDeduction', testAdv);
    doc.set('loanAdvance.advanceBreakdown', [
      { advanceId: new mongoose.Types.ObjectId(), advanceAmount: testAdv, carriedForward: 0 },
    ]);
    doc.set('netSalary', net - testEmi - testAdv);
    doc.markModified('loanAdvance');
    await doc.save();
    record = await PayrollRecord.findById(record._id)
      .populate({
        path: 'employeeId',
        select: 'emp_no employee_name first_name last_name division_id department_id',
        populate: [
          { path: 'division_id', select: 'name' },
          { path: 'department_id', select: 'name' },
        ],
      })
      .populate('payrollBatchId', 'status month')
      .populate('division_id', 'name')
      .lean();
    return { record, injected: true };
  }

  return { record, injected: false };
}

async function restoreInjectedRecord() {
  if (!restoreSnapshot) return;
  const doc = await PayrollRecord.findById(restoreSnapshot.payrollRecordId);
  if (!doc) return;
  doc.loanAdvance = restoreSnapshot.loanAdvance;
  doc.netSalary = restoreSnapshot.netSalary;
  doc.markModified('loanAdvance');
  await doc.save();
  if (restoreSnapshot.adjustmentIds?.length) {
    await PaysheetAdjustmentRequest.deleteMany({ _id: { $in: restoreSnapshot.adjustmentIds } });
  }
  restoreSnapshot = null;
}

async function verifyEmployeeDivisionDepartmentContext(record) {
  const emp = record.employeeId;
  if (!emp) {
    fail('Employee linked to payroll record', new Error('employeeId missing'));
    return;
  }
  ok('Employee on payroll record', `${emp.emp_no || record.emp_no}`);

  const divName = record.division_id?.name || emp?.division_id?.name;
  const deptName = emp?.department_id?.name;
  if (divName) ok('Division context', divName);
  else skip('Division context', 'division_id not populated on record');

  if (deptName) ok('Department context', deptName);
  else skip('Department context', 'department_id not populated on record');

  if (record.payrollBatchId) {
    ok('Payroll batch linked', `status=${record.payrollBatchId.status} month=${record.payrollBatchId.month}`);
  }

  if (record.attendanceSummaryId) {
    const att = await MonthlyAttendanceSummary.findById(record.attendanceSummaryId)
      .select('month totalPresentDays totalPayableShifts totalDaysInMonth')
      .lean();
    if (att) {
      ok(
        'Attendance summary linked',
        `present=${att.totalPresentDays} payableShifts=${att.totalPayableShifts} monthDays=${att.totalDaysInMonth}`
      );
    } else {
      skip('Attendance summary', 'ID set but document not found');
    }
  } else {
    skip('Attendance summary', 'no attendanceSummaryId on record');
  }
}

async function verifyPaysheetRowBuild(record, config) {
  const doc = await PayrollRecord.findById(record._id)
    .populate({
      path: 'employeeId',
      select: 'emp_no employee_name first_name last_name department_id division_id designation_id',
      populate: [
        { path: 'department_id', select: 'name' },
        { path: 'division_id', select: 'name' },
      ],
    })
    .lean();
  const payslip = payrollRecordToPayslipShape(doc);
  const cols = paysheetAdjustmentService.getEditableColumnDefs(config);
  const outputColumns = (config.outputColumns || []).map((c, i) => {
    const d = c.toObject ? c.toObject() : c;
    return {
      header: d.header || `Col ${i}`,
      source: d.source === 'formula' ? 'formula' : 'field',
      field: d.field || '',
      formula: d.formula || '',
      order: d.order ?? i,
    };
  });
  const rowData = outputColumnService.buildRowFromOutputColumns(payslip, outputColumns, 1);
  const emiCol = cols.find((c) => c.fieldPath === 'loanAdvance.totalEMI');
  if (emiCol && rowData[emiCol.header] != null) {
    const val = Number(rowData[emiCol.header]);
    if (Math.abs(val - (record.loanAdvance?.totalEMI || 0)) < 0.02) {
      ok('Paysheet row shows EMI from PayrollRecord', `${emiCol.header}=${val}`);
    } else {
      fail('Paysheet row EMI match', new Error(`row=${val} record=${record.loanAdvance?.totalEMI}`));
    }
  } else {
    skip('Paysheet row EMI column', 'column not in output config');
  }
}

async function ensureTestConfig() {
  const config = await PayrollConfiguration.get();
  const cols = Array.isArray(config.outputColumns) ? [...config.outputColumns] : [];
  let changed = false;

  const ensureCol = (header, field) => {
    let col = cols.find((c) => {
      const h = (c.header || '').toLowerCase();
      return h.includes(header.toLowerCase()) || c.field === field;
    });
    if (!col) {
      col = {
        header: field === 'loanAdvance.totalEMI' ? 'Loan EMI' : 'Advance deduction',
        source: 'field',
        field,
        formula: '',
        order: cols.length,
        paysheetEditable: true,
        paysheetEditableFieldPath: field,
      };
      cols.push(col);
      changed = true;
    } else {
      const doc = col.toObject ? col.toObject() : col;
      if (!doc.paysheetEditable || doc.paysheetEditableFieldPath !== field) {
        Object.assign(col, {
          paysheetEditable: true,
          paysheetEditableFieldPath: field,
        });
        changed = true;
      }
    }
  };

  ensureCol('emi', 'loanAdvance.totalEMI');
  ensureCol('advance', 'loanAdvance.advanceDeduction');

  if (!config.allowPaysheetModification) {
    config.allowPaysheetModification = true;
    changed = true;
  }

  if (changed) {
    config.outputColumns = cols;
    config.markModified('outputColumns');
    await config.save();
  }

  return await PayrollConfiguration.get();
}

async function runServiceTests(summary) {
  console.log('\n--- Service-layer tests (real DB) ---\n');

  const config = await ensureTestConfig();
  const editable = paysheetAdjustmentService.getEditableColumnDefs(config);
  if (editable.length >= 1) {
    ok('Config: editable columns defined', editable.map((c) => c.header).join(', '));
  } else {
    fail('Config: editable columns', new Error('No editable columns after ensureTestConfig'));
  }

  if (!summary.superAdminId) {
    skip('Superadmin user for approve tests', 'No super_admin user in DB');
    return { testRecord: null, createdRequestId: null };
  }

  const { record: testRecord, injected } = await prepareRealWorldTestRecord(summary);
  if (!testRecord) {
    skip('Pick payroll record', 'No PayrollRecord with modifiable batch');
    return { testRecord: null, createdRequestId: null };
  }
  if (injected) {
    ok('Test data injected on real record', `EMI=2500 Adv=800 (will restore after tests)`);
  }

  await verifyEmployeeDivisionDepartmentContext(testRecord);
  await verifyPaysheetRowBuild(testRecord, config);

  const emp = testRecord.employeeId;
  const empLabel = emp?.emp_no || testRecord.emp_no || testRecord._id;
  ok(
    'Discovered test employee',
    `${empLabel} month=${testRecord.month} EMI=${testRecord.loanAdvance?.totalEMI} batch=${testRecord.payrollBatchId?.status || 'none'}`
  );

  const emiCol = editable.find((c) => c.fieldPath === 'loanAdvance.totalEMI');
  if (!emiCol) {
    skip('EMI column in config', 'loanAdvance.totalEMI not marked editable');
    return { testRecord, createdRequestId: null };
  }

  const originalEmi = testRecord.loanAdvance?.totalEMI || 0;
  const proposedEmi = Math.max(0, Math.round(originalEmi * 0.5 * 100) / 100);

  if (originalEmi <= 0) {
    skip('Create pending request', 'EMI is 0');
    return { testRecord, createdRequestId: null };
  }

  // Clean prior pending for this record+field
  await PaysheetAdjustmentRequest.deleteMany({
    payrollRecordId: testRecord._id,
    fieldPath: 'loanAdvance.totalEMI',
    status: 'pending',
  });

  let createdRequest;
  try {
    createdRequest = await paysheetAdjustmentService.createAdjustmentRequest({
      payrollRecordId: testRecord._id.toString(),
      columnHeader: emiCol.header,
      fieldPath: 'loanAdvance.totalEMI',
      proposedValue: proposedEmi,
      reason: 'Integration test — emergency EMI reduction',
      userId: summary.superAdminId,
    });
    if (restoreSnapshot) restoreSnapshot.adjustmentIds.push(createdRequest._id);
    ok('Create pending adjustment request', `proposed ${proposedEmi} vs original ${originalEmi}`);
  } catch (e) {
    if (e.code === 'BATCH_LOCKED') {
      skip('Create pending request', e.message);
      return { testRecord, createdRequestId: null };
    }
    fail('Create pending adjustment request', e);
    return { testRecord, createdRequestId: null };
  }

  const overlay = await paysheetAdjustmentService.buildAdjustmentOverlay(testRecord.month, [
    String(testRecord.employeeId?._id || testRecord.employeeId),
  ]);
  const empKey = String(testRecord.employeeId?._id || testRecord.employeeId);
  const cellMeta = overlay.get(empKey)?.get(emiCol.header);
  if (cellMeta?.status === 'pending' && cellMeta.proposedValue === proposedEmi) {
    ok('Overlay: pending cell metadata', `status=${cellMeta.status}`);
  } else {
    fail('Overlay: pending cell metadata', new Error(JSON.stringify(cellMeta)));
  }

  const rows = paysheetAdjustmentService.applyOverlayToRows(
    [{ [emiCol.header]: originalEmi, _employeeId: empKey }],
    overlay,
    editable
  );
  if (rows[0][emiCol.header] === proposedEmi) {
    ok('Overlay: pending shows proposed value in row');
  } else {
    fail('Overlay: pending row value', new Error(`got ${rows[0][emiCol.header]}`));
  }

  // Reject path (separate mini request)
  await PaysheetAdjustmentRequest.deleteMany({
    payrollRecordId: testRecord._id,
    fieldPath: 'loanAdvance.advanceDeduction',
    status: 'pending',
  });

  const advCol = editable.find((c) => c.fieldPath === 'loanAdvance.advanceDeduction');
  const advAmount = testRecord.loanAdvance?.advanceDeduction || 0;
  if (advCol && advAmount > 0 && testRecord.payrollBatchId?.status !== 'freeze') {
    const rejReq = await paysheetAdjustmentService.createAdjustmentRequest({
      payrollRecordId: testRecord._id.toString(),
      columnHeader: advCol.header,
      fieldPath: 'loanAdvance.advanceDeduction',
      proposedValue: 0,
      reason: 'Integration test — reject path',
      userId: summary.superAdminId,
    });
    await paysheetAdjustmentService.reviewAdjustmentRequest(rejReq._id.toString(), {
      approve: false,
      comments: 'Test reject',
      userId: summary.superAdminId,
    });
    const afterRej = await PaysheetAdjustmentRequest.findById(rejReq._id).lean();
    if (afterRej.status === 'rejected') {
      ok('Reject adjustment request');
    } else {
      fail('Reject adjustment request', new Error(`status=${afterRej.status}`));
    }
  } else {
    skip('Reject path for advance', advAmount > 0 ? 'batch frozen' : 'no advance on test record');
  }

  // Approve main EMI request
  const netBefore = testRecord.netSalary || 0;
  try {
    await paysheetAdjustmentService.reviewAdjustmentRequest(createdRequest._id.toString(), {
      approve: true,
      comments: 'Integration test approve',
      userId: summary.superAdminId,
    });
    const refreshed = await PayrollRecord.findById(testRecord._id).lean();
    const expectedNet = netBefore + (originalEmi - proposedEmi);
    if (Math.abs((refreshed.loanAdvance?.totalEMI || 0) - proposedEmi) < 0.02) {
      ok('Approve: EMI updated on PayrollRecord', `totalEMI=${refreshed.loanAdvance?.totalEMI}`);
    } else {
      fail('Approve: EMI on record', new Error(`emi=${refreshed.loanAdvance?.totalEMI}`));
    }
    if (Math.abs((refreshed.netSalary || 0) - expectedNet) < 0.05) {
      ok('Approve: netSalary adjusted', `${netBefore} → ${refreshed.netSalary}`);
    } else {
      fail('Approve: netSalary', new Error(`expected ~${expectedNet}, got ${refreshed.netSalary}`));
    }

    const approvedOverlay = await paysheetAdjustmentService.buildAdjustmentOverlay(testRecord.month, [empKey]);
    const approvedMeta = approvedOverlay.get(empKey)?.get(emiCol.header);
    if (approvedMeta?.status === 'approved') {
      ok('Overlay: approved status after approve');
    } else {
      fail('Overlay: approved status', new Error(JSON.stringify(approvedMeta)));
    }
  } catch (e) {
    if (e.code === 'BATCH_LOCKED') skip('Approve request', e.message);
    else fail('Approve request', e);
  }

  // Validation: cannot exceed original
  try {
    await paysheetAdjustmentService.createAdjustmentRequest({
      payrollRecordId: testRecord._id.toString(),
      columnHeader: emiCol.header,
      fieldPath: 'loanAdvance.totalEMI',
      proposedValue: originalEmi + 1000,
      reason: 'should fail',
      userId: summary.superAdminId,
    });
    fail('Validation: block amount > original', new Error('Should have thrown'));
  } catch (e) {
    if (e.code === 'PROPOSED_EXCEEDS_ORIGINAL') ok('Validation: block amount > original');
    else fail('Validation: block amount > original', e);
  }

  return { testRecord, createdRequestId: createdRequest._id };
}

async function ensureApiTestSuperAdmin() {
  const TEST_EMAIL = 'paysheet-integration-test@hrms.local';
  const TEST_PASSWORD = 'Test@Paysheet2026';
  let user = await User.findOne({ email: TEST_EMAIL }).select('+password');
  if (!user) {
    await User.create({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      name: 'Paysheet Integration Test',
      role: 'super_admin',
      roles: ['super_admin'],
      isActive: true,
    });
  } else {
    user.password = TEST_PASSWORD;
    await user.save();
  }
  return { email: TEST_EMAIL, password: TEST_PASSWORD };
}

async function prepareApiTestRecord(summary, excludeRecordId = null) {
  const query = {
    payrollBatchId: { $exists: true, $ne: null },
    month: { $in: ['2026-03', '2026-04', '2026-02'] },
  };
  if (excludeRecordId) query._id = { $ne: excludeRecordId };

  let record = await PayrollRecord.findOne(query)
    .populate({
      path: 'employeeId',
      select: 'emp_no employee_name division_id department_id',
      populate: [
        { path: 'division_id', select: 'name' },
        { path: 'department_id', select: 'name' },
      ],
    })
    .populate('payrollBatchId', 'status month')
    .sort({ month: -1 })
    .lean();

  if (!record?.payrollBatchId || !['pending', 'approved'].includes(record.payrollBatchId.status)) {
    return { record: null, injected: false, apiRestore: null };
  }

  const needsInject =
    (record.loanAdvance?.totalEMI || 0) <= 0 && (record.loanAdvance?.advanceDeduction || 0) <= 0;

  let apiRestore = null;
  if (needsInject) {
    const doc = await PayrollRecord.findById(record._id);
    apiRestore = {
      payrollRecordId: doc._id,
      loanAdvance: JSON.parse(JSON.stringify(doc.loanAdvance || {})),
      netSalary: doc.netSalary,
    };
    const testEmi = 1800;
    const net = Number(doc.netSalary) || 12000;
    doc.set('loanAdvance.totalEMI', testEmi);
    doc.set('loanAdvance.scheduledTotalEMI', testEmi);
    doc.set('loanAdvance.emiBreakdown', [{ loanId: new mongoose.Types.ObjectId(), emiAmount: testEmi }]);
    doc.set('netSalary', net - testEmi);
    doc.markModified('loanAdvance');
    await doc.save();
    record = await PayrollRecord.findById(record._id)
      .populate({
        path: 'employeeId',
        populate: [{ path: 'division_id', select: 'name' }, { path: 'department_id', select: 'name' }],
      })
      .populate('payrollBatchId', 'status month')
      .lean();
    return { record, injected: true, apiRestore };
  }
  return { record, injected: false, apiRestore: null };
}

async function restoreApiTestRecord(apiRestore) {
  if (!apiRestore) return;
  const doc = await PayrollRecord.findById(apiRestore.payrollRecordId);
  if (!doc) return;
  doc.loanAdvance = apiRestore.loanAdvance;
  doc.netSalary = apiRestore.netSalary;
  doc.markModified('loanAdvance');
  await doc.save();
}

async function runBatchCompleteRejectTest(summary) {
  console.log('\n--- Batch complete auto-reject test ---\n');

  const batch = await PayrollBatch.findOne({ status: { $in: ['pending', 'approved'] } })
    .sort({ updatedAt: -1 })
    .lean();
  if (!batch) {
    skip('Batch auto-reject', 'No pending/approved batch found');
    return;
  }

  let pr = await PayrollRecord.findOne({
    payrollBatchId: batch._id,
    'loanAdvance.totalEMI': { $gt: 0 },
  }).lean();

  let batchTestRestore = null;
  if (!pr) {
    pr = await PayrollRecord.findOne({ payrollBatchId: batch._id }).lean();
    if (pr) {
      const doc = await PayrollRecord.findById(pr._id);
      batchTestRestore = {
        payrollRecordId: doc._id,
        loanAdvance: JSON.parse(JSON.stringify(doc.loanAdvance || {})),
        netSalary: doc.netSalary,
      };
      doc.set('loanAdvance.totalEMI', 500);
      doc.set('loanAdvance.scheduledTotalEMI', 500);
      doc.set('loanAdvance.emiBreakdown', [{ loanId: new mongoose.Types.ObjectId(), emiAmount: 500 }]);
      doc.markModified('loanAdvance');
      await doc.save();
      pr = await PayrollRecord.findById(pr._id).lean();
      ok('Batch auto-reject: injected EMI on batch record for test');
    }
  }

  if (!pr) {
    skip('Batch auto-reject', 'No payroll record in batch');
    return;
  }

  const config = await PayrollConfiguration.get();
  const emiCol = paysheetAdjustmentService.getEditableColumnDefs(config).find(
    (c) => c.fieldPath === 'loanAdvance.totalEMI'
  );
  if (!emiCol) {
    skip('Batch auto-reject', 'No editable EMI column');
    return;
  }

  const adminId = summary.superAdminId;
  const proposed = Math.max(0, (pr.loanAdvance?.totalEMI || 0) - 1);

  await PaysheetAdjustmentRequest.deleteMany({
    payrollRecordId: pr._id,
    fieldPath: 'loanAdvance.totalEMI',
    status: 'pending',
  });

  const req = await paysheetAdjustmentService.createAdjustmentRequest({
    payrollRecordId: pr._id.toString(),
    columnHeader: emiCol.header,
    fieldPath: 'loanAdvance.totalEMI',
    proposedValue: proposed,
    reason: 'Batch complete reject test',
    userId: adminId,
  });

  // Simulate batch complete hook (do not actually complete the batch)
  const rejectResult = await paysheetAdjustmentService.autoRejectPendingPaysheetAdjustmentsForBatch(
    batch,
    adminId,
    'Test auto-reject on batch complete'
  );

  const after = await PaysheetAdjustmentRequest.findById(req._id).lean();
  if (rejectResult.rejected >= 1 && after.status === 'rejected') {
    ok('Auto-reject pending on batch complete simulation', `rejected=${rejectResult.rejected}`);
  } else {
    fail('Auto-reject pending', new Error(`rejected=${rejectResult.rejected} status=${after?.status}`));
  }

  if (batchTestRestore) {
    await restoreApiTestRecord(batchTestRestore);
  }
}

async function runApiTests(summary, serviceTestRecordId = null) {
  console.log('\n--- HTTP API tests ---\n');

  const axios = require('axios');
  const API_BASE = process.env.API_BASE || 'http://localhost:5000';

  try {
    await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    ok('API: server health check');
  } catch (e) {
    skip('API tests (all)', `Server not running at ${API_BASE}: ${e.message}`);
    return;
  }

  const creds = await ensureApiTestSuperAdmin();
  let token;
  try {
    const loginRes = await axios.post(
      `${API_BASE}/api/auth/login`,
      { identifier: creds.email, password: creds.password },
      { timeout: 10000 }
    );
    token = loginRes.data?.data?.token || loginRes.data?.token;
    if (!token) throw new Error('No token');
    ok('API: login as test superadmin', creds.email);
  } catch (e) {
    fail('API: login', e.response?.data?.message || e.message);
    return;
  }

  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const config = await PayrollConfiguration.get();
  const editable = paysheetAdjustmentService.getEditableColumnDefs(config);
  const emiCol = editable.find((c) => c.fieldPath === 'loanAdvance.totalEMI');

  try {
    const settingsRes = await axios.get(`${API_BASE}/api/payroll/paysheet-modification/settings`, { headers: h });
    if (settingsRes.data?.success && settingsRes.data?.data?.allowPaysheetModification !== undefined) {
      ok('API: GET paysheet-modification/settings', `editable=${settingsRes.data.data.editableColumns?.length || 0}`);
    } else {
      fail('API: GET settings', new Error(JSON.stringify(settingsRes.data)));
    }
  } catch (e) {
    fail('API: GET settings', e.response?.data?.message || e.message);
  }

  const { record: apiRecord, injected: apiInjected, apiRestore } = await prepareApiTestRecord(
    summary,
    serviceTestRecordId
  );
  if (!apiRecord) {
    skip('API: remaining tests', 'No modifiable payroll record for API');
    return;
  }
  if (apiInjected) ok('API: test record prepared', `emp=${apiRecord.emp_no} EMI=${apiRecord.loanAdvance?.totalEMI}`);

  const month = apiRecord.month;
  const emp = apiRecord.employeeId;
  const divId = apiRecord.division_id?._id || apiRecord.division_id || emp?.division_id?._id || emp?.division_id;
  const depId = emp?.department_id?._id || emp?.department_id;

  try {
    const sheetRes = await axios.get(`${API_BASE}/api/payroll/paysheet`, {
      headers: h,
      params: {
        month,
        source: 'existing',
        divisionId: divId ? String(divId) : undefined,
        departmentId: depId ? String(depId) : undefined,
      },
      timeout: 90000,
    });
    const data = sheetRes.data?.data;
    const targetRow = (data?.rows || []).find((r) => String(r._payrollRecordId) === String(apiRecord._id));
    if (sheetRes.data?.success && data?.headers?.length && data?.rows?.length) {
      ok(
        'API: GET paysheet (division+department filter)',
        `rows=${data.rows.length} targetRow=${!!targetRow} modification=${!!data.paysheetModification?.allowPaysheetModification}`
      );
      if (targetRow?._payrollRecordId && targetRow?._employeeId) {
        ok('API: paysheet row has _payrollRecordId and _employeeId');
      } else {
        fail('API: paysheet row metadata', new Error('target row missing ids'));
      }
    } else {
      fail('API: GET paysheet', new Error(sheetRes.data?.message || 'empty'));
    }
  } catch (e) {
    fail('API: GET paysheet', e.response?.data?.message || e.message);
  }

  if (!emiCol) {
    skip('API: create/approve', 'No editable EMI column');
    await restoreApiTestRecord(apiRestore);
    return;
  }

  await PaysheetAdjustmentRequest.deleteMany({
    payrollRecordId: apiRecord._id,
    fieldPath: 'loanAdvance.totalEMI',
    status: 'pending',
  });

  const originalEmi = apiRecord.loanAdvance?.totalEMI || 0;
  const proposedEmi = Math.max(0, originalEmi - 100);

  let createdId;
  try {
    const createRes = await axios.post(
      `${API_BASE}/api/payroll/paysheet-adjustments`,
      {
        payrollRecordId: String(apiRecord._id),
        columnHeader: emiCol.header,
        fieldPath: 'loanAdvance.totalEMI',
        proposedValue: proposedEmi,
        reason: 'API integration test — reduce EMI',
      },
      { headers: h }
    );
    if (createRes.data?.success && createRes.data?.data?._id) {
      createdId = createRes.data.data._id;
      ok('API: POST create adjustment', `id=${createdId} ${originalEmi}→${proposedEmi}`);
    } else {
      fail('API: POST create', new Error(JSON.stringify(createRes.data)));
    }
  } catch (e) {
    fail('API: POST create', e.response?.data?.message || e.message);
  }

  try {
    const listRes = await axios.get(`${API_BASE}/api/payroll/paysheet-adjustments`, {
      headers: h,
      params: { month, status: 'pending' },
    });
    const found = (listRes.data?.data || []).some((r) => String(r._id) === String(createdId));
    if (listRes.data?.success && found) {
      ok('API: GET list pending includes new request');
    } else {
      fail('API: GET list pending', new Error(`found=${found}`));
    }
  } catch (e) {
    fail('API: GET list pending', e.response?.data?.message || e.message);
  }

  try {
    const badRes = await axios.post(
      `${API_BASE}/api/payroll/paysheet-adjustments`,
      {
        payrollRecordId: String(apiRecord._id),
        columnHeader: emiCol.header,
        fieldPath: 'loanAdvance.totalEMI',
        proposedValue: originalEmi + 500,
        reason: 'should fail validation',
      },
      { headers: h, validateStatus: () => true }
    );
    if (badRes.status === 400 && badRes.data?.code === 'PROPOSED_EXCEEDS_ORIGINAL') {
      ok('API: POST rejects amount > original', badRes.data.code);
    } else {
      fail('API: validation reject', new Error(`status=${badRes.status} ${JSON.stringify(badRes.data)}`));
    }
  } catch (e) {
    fail('API: validation reject', e.message);
  }

  if (createdId) {
    try {
      const approveRes = await axios.post(
        `${API_BASE}/api/payroll/paysheet-adjustments/${createdId}/approve`,
        { comments: 'API test approve' },
        { headers: h }
      );
      if (approveRes.data?.success && approveRes.data?.data?.status === 'approved') {
        ok('API: POST approve adjustment');
        const refreshed = await PayrollRecord.findById(apiRecord._id).lean();
        if (Math.abs((refreshed.loanAdvance?.totalEMI || 0) - proposedEmi) < 0.02) {
          ok('API: approve persisted EMI on PayrollRecord', `totalEMI=${refreshed.loanAdvance?.totalEMI}`);
        } else {
          fail('API: approve persisted EMI', new Error(`got ${refreshed.loanAdvance?.totalEMI}`));
        }
      } else {
        fail('API: POST approve', new Error(JSON.stringify(approveRes.data)));
      }
    } catch (e) {
      fail('API: POST approve', e.response?.data?.message || e.message);
    }

    try {
      const sheetAfter = await axios.get(`${API_BASE}/api/payroll/paysheet`, {
        headers: h,
        params: { month, source: 'existing', divisionId: divId ? String(divId) : undefined },
        timeout: 90000,
      });
      const rowAfter = (sheetAfter.data?.data?.rows || []).find(
        (r) => String(r._payrollRecordId) === String(apiRecord._id)
      );
      const adj = rowAfter?._cellAdjustments?.[emiCol.header];
      if (adj?.status === 'approved') {
        ok('API: paysheet shows approved cell metadata');
      } else {
        fail('API: approved overlay on paysheet', new Error(JSON.stringify(adj)));
      }
    } catch (e) {
      fail('API: approved overlay on paysheet', e.response?.data?.message || e.message);
    }
  }

  const freezeBatch = await PayrollBatch.findOne({ status: 'freeze' }).lean();
  if (freezeBatch && emiCol) {
    const freezePr = await PayrollRecord.findOne({ payrollBatchId: freezeBatch._id }).lean();
    if (freezePr) {
      const lockedRes = await axios.post(
        `${API_BASE}/api/payroll/paysheet-adjustments`,
        {
          payrollRecordId: String(freezePr._id),
          columnHeader: emiCol.header,
          fieldPath: 'loanAdvance.totalEMI',
          proposedValue: 0,
          reason: 'should fail batch locked',
        },
        { headers: h, validateStatus: () => true }
      );
      if (lockedRes.status === 400 && lockedRes.data?.code === 'BATCH_LOCKED') {
        ok('API: POST blocked when batch is freeze', lockedRes.data.code);
      } else {
        skip('API: batch freeze block', `status=${lockedRes.status}`);
      }
    }
  } else {
    skip('API: batch freeze block', 'No freeze batch in DB');
  }

  await restoreApiTestRecord(apiRestore);
  if (apiRestore) ok('API: restored API test payroll record');
}

async function printDiscovery(summary) {
  console.log('\n========== DATABASE DISCOVERY ==========\n');
  console.log(`MongoDB: ${(process.env.MONGODB_URI || '').replace(/\/\/[^@]+@/, '//***@')}`);
  console.log(`Divisions (active): ${summary.divisions}`);
  console.log(`Departments (active): ${summary.departments}`);
  console.log(`Payroll batches by status:`, summary.batchesByStatus);
  console.log(
    `Allow paysheet modification: ${summary.config?.allowPaysheetModification ? 'YES' : 'NO'}`
  );
  const editable = paysheetAdjustmentService.getEditableColumnDefs(summary.config);
  console.log(`Editable columns: ${editable.length ? editable.map((c) => c.header).join(', ') : '(none)'}`);

  console.log(`\nRecords with loan EMI > 0 (sample ${summary.payrollRecordsWithLoan.length}):`);
  for (const r of summary.payrollRecordsWithLoan.slice(0, 8)) {
    const emp = r.employeeId;
    const name = emp?.employee_name || [emp?.first_name, emp?.last_name].filter(Boolean).join(' ') || '—';
    console.log(
      `  ${r.emp_no || emp?.emp_no} | ${name} | ${r.month} | EMI=${r.loanAdvance?.totalEMI} | Adv=${r.loanAdvance?.advanceDeduction || 0} | batch=${r.payrollBatchId?.status || '—'} | net=${r.netSalary}`
    );
  }

  if (summary.payrollRecordsWithAdvance.length) {
    console.log(`\nRecords with salary advance > 0 (sample):`);
    for (const r of summary.payrollRecordsWithAdvance.slice(0, 5)) {
      console.log(
        `  ${r.emp_no} | ${r.month} | advance=${r.loanAdvance?.advanceDeduction} | batch=${r.payrollBatchId?.status || '—'}`
      );
    }
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected.\n');

  try {
    const summary = await discoverData();
    await printDiscovery(summary);

    const serviceResult = await runServiceTests(summary);
    await runBatchCompleteRejectTest(summary);
    await runApiTests(summary, serviceResult?.testRecord?._id);

    await restoreInjectedRecord();
    if (restoreSnapshot === null) {
      ok('Cleanup: restored injected payroll record (if any)');
    }

    console.log('\n========== FULL RESULTS ==========');
    for (const entry of log) {
      const icon = entry.status === 'PASS' ? '✓' : entry.status === 'FAIL' ? '✗' : '○';
      console.log(`${icon} [${entry.status}] ${entry.name}${entry.detail ? ` — ${entry.detail}` : ''}`);
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`PASS: ${results.pass}  FAIL: ${results.fail}  SKIP: ${results.skip}`);
    if (results.fail > 0) {
      console.log('\nFailed:');
      log.filter((l) => l.status === 'FAIL').forEach((l) => console.log(`  - ${l.name}: ${l.detail}`));
      process.exitCode = 1;
    }
  } finally {
    try {
      await restoreInjectedRecord();
    } catch (e) {
      console.error('Cleanup error:', e.message);
    }
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
