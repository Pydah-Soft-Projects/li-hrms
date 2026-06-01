const PayrollConfiguration = require('../model/PayrollConfiguration');
const PaysheetAdjustmentRequest = require('../model/PaysheetAdjustmentRequest');
const PayrollRecord = require('../model/PayrollRecord');
const PayrollBatch = require('../model/PayrollBatch');
const { payrollRecordToPayslipShape } = require('../utils/paysheetBundleExport');
const outputColumnService = require('./outputColumnService');

/** Paths that must never be adjusted via paysheet (identity / derived totals). */
const BLOCKED_FIELD_PATH_PREFIXES = ['employee.'];
const BLOCKED_FIELD_PATHS = new Set([
  'netSalary',
  'payableAmountBeforeAdvance',
  'status',
  'loanAdvance.remainingBalance',
]);

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function resolveEditableFieldPath(column) {
  const explicit = column?.paysheetEditableFieldPath != null ? String(column.paysheetEditableFieldPath).trim() : '';
  if (explicit) return explicit;
  if (column?.source === 'field' && column?.field) return String(column.field).trim();
  return '';
}

function isBlockedPaysheetAdjustmentPath(fieldPath) {
  const path = String(fieldPath || '').trim();
  if (!path) return true;
  if (BLOCKED_FIELD_PATHS.has(path)) return true;
  if (BLOCKED_FIELD_PATH_PREFIXES.some((p) => path.startsWith(p))) return true;
  if (/\.(name|email|emp_no|designation|department|division)$/i.test(path)) return true;
  if (/Count$|Type$|Mode$|eligiblePermission/i.test(path)) return true;
  return false;
}

function isDeductionPath(fieldPath) {
  const path = String(fieldPath || '');
  if (path.startsWith('deductions.')) return true;
  if (path.startsWith('manualDeductions')) return true;
  if (path === 'manualDeductionsAmount') return true;
  if (path.startsWith('loanAdvance.')) {
    return path !== 'loanAdvance.remainingBalance';
  }
  return false;
}

function isEarningPath(fieldPath) {
  const path = String(fieldPath || '');
  if (path.startsWith('earnings.')) return true;
  if (path === 'arrearsAmount' || path.startsWith('arrears.')) return true;
  if (path === 'extraDaysPay') return true;
  return false;
}

function computeNetSalaryDelta(fieldPath, originalValue, proposedValue) {
  const original = roundMoney(originalValue);
  const proposed = roundMoney(proposedValue);
  if (fieldPath === 'roundOff') {
    return roundMoney(proposed - original);
  }
  if (isEarningPath(fieldPath)) {
    return roundMoney(proposed - original);
  }
  if (isDeductionPath(fieldPath)) {
    return roundMoney(original - proposed);
  }
  return 0;
}

function getEditableColumnDefs(config) {
  if (!config?.allowPaysheetModification) return [];
  const cols = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
  return cols
    .map((c, i) => {
      const doc = c && typeof c.toObject === 'function' ? c.toObject() : { ...c };
      if (!doc.paysheetEditable) return null;
      const fieldPath = resolveEditableFieldPath(doc);
      if (!fieldPath || isBlockedPaysheetAdjustmentPath(fieldPath)) return null;
      return {
        header: doc.header != null && String(doc.header).trim() ? String(doc.header).trim() : `Column ${i + 1}`,
        fieldPath,
        order: typeof doc.order === 'number' ? doc.order : i,
      };
    })
    .filter(Boolean);
}

function getValueByPath(obj, path) {
  if (!obj || !path) return 0;
  const parts = String(path).split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return 0;
    cur = cur[p];
  }
  return roundMoney(cur);
}

function readNumericFieldOnRecord(record, fieldPath) {
  const plain = record?.toObject ? record.toObject() : record;
  const val = getValueByPath(plain, fieldPath);
  if (typeof val !== 'number' || Number.isNaN(val)) {
    return null;
  }
  return val;
}

function normalizeColumnHeader(header) {
  return String(header || '').trim().toLowerCase();
}

function normalizeOutputColumnsForBuild(config) {
  const cols = Array.isArray(config?.outputColumns) ? config.outputColumns : [];
  return cols.map((c, i) => {
    const doc = c && typeof c.toObject === 'function' ? c.toObject() : { ...c };
    const formulaStr = doc.formula != null ? String(doc.formula).trim() : '';
    const explicitSource = doc.source === 'formula' ? 'formula' : doc.source === 'field' ? 'field' : null;
    const source = explicitSource || (formulaStr.length > 0 ? 'formula' : 'field');
    return {
      header: doc.header != null && String(doc.header).trim() ? String(doc.header).trim() : `Column ${i + 1}`,
      source,
      field: source === 'formula' ? '' : doc.field || '',
      formula: source === 'formula' ? formulaStr : '',
      order: typeof doc.order === 'number' ? doc.order : i,
    };
  });
}

/**
 * Same value logic as paysheet row build (formulas + field columns in config order).
 */
function computePaysheetCellValue(record, columnHeader, config) {
  const targetNorm = normalizeColumnHeader(columnHeader);
  if (!targetNorm) return null;
  const outputColumns = normalizeOutputColumnsForBuild(config);
  if (outputColumns.length === 0) return null;

  const payslip = payrollRecordToPayslipShape(record?.toObject ? record.toObject() : record);
  const row = outputColumnService.buildRowFromOutputColumns(payslip, outputColumns);

  for (const col of outputColumns) {
    if (normalizeColumnHeader(col.header) === targetNorm) {
      const val = row[col.header];
      if (typeof val === 'number' && !Number.isNaN(val)) return roundMoney(val);
      const n = Number(val);
      return Number.isFinite(n) ? roundMoney(n) : null;
    }
  }
  return null;
}

/**
 * Paysheet display value is authoritative for "calculated amount"; record field is for apply + stale check.
 */
function resolveAdjustmentOriginalValues(record, columnHeader, fieldPath, config) {
  const recordValueAtRequest = readNumericFieldOnRecord(record, fieldPath) ?? 0;
  const displayValue = computePaysheetCellValue(record, columnHeader, config);
  const originalValue =
    displayValue != null && Number.isFinite(displayValue) ? displayValue : recordValueAtRequest;
  return { originalValue, recordValueAtRequest, displayValue };
}

function buildEditableFieldValuesForRecord(record, config, editableColumns) {
  const values = {};
  for (const col of editableColumns) {
    const display = computePaysheetCellValue(record, col.header, config);
    const fromRecord = readNumericFieldOnRecord(record, col.fieldPath);
    values[col.header] =
      display != null && Number.isFinite(display)
        ? display
        : fromRecord != null
          ? fromRecord
          : 0;
  }
  return values;
}

function setValueOnRecord(record, fieldPath, value) {
  const proposed = roundMoney(value);
  record.set(fieldPath, proposed);
  const top = String(fieldPath).split('.')[0];
  if (top && String(fieldPath).includes('.')) {
    record.markModified(top);
  }
  syncRootFieldAliases(record, fieldPath, proposed);
}

/** Keep root/nested payroll fields aligned when config uses either path. */
function syncRootFieldAliases(record, fieldPath, value) {
  const v = roundMoney(value);
  if (fieldPath === 'arrears.arrearsAmount' || fieldPath === 'arrearsAmount') {
    record.set('arrearsAmount', v);
    if (!record.arrears) record.set('arrears', { arrearsAmount: 0 });
    record.set('arrears.arrearsAmount', v);
    record.markModified('arrears');
  }
  if (fieldPath === 'manualDeductions.manualDeductionsAmount' || fieldPath === 'manualDeductionsAmount') {
    record.set('manualDeductionsAmount', v);
    if (!record.manualDeductions) record.set('manualDeductions', { manualDeductionsAmount: 0 });
    record.set('manualDeductions.manualDeductionsAmount', v);
    record.markModified('manualDeductions');
  }
}

function scaleBreakdownAmounts(breakdown, oldTotal, newTotal) {
  const list = Array.isArray(breakdown) ? breakdown : [];
  const oldSum = roundMoney(oldTotal);
  const newSum = roundMoney(newTotal);
  if (list.length === 0 || oldSum <= 0) return list;
  if (newSum <= 0) {
    return list.map((item) => {
      const copy = { ...item };
      if (copy.emiAmount != null) copy.emiAmount = 0;
      if (copy.advanceAmount != null) copy.advanceAmount = 0;
      return copy;
    });
  }
  const ratio = newSum / oldSum;
  const scaled = list.map((item) => {
    const copy = { ...item };
    if (copy.emiAmount != null) copy.emiAmount = roundMoney(copy.emiAmount * ratio);
    if (copy.advanceAmount != null) copy.advanceAmount = roundMoney(copy.advanceAmount * ratio);
    return copy;
  });
  const amountKey = scaled[0]?.emiAmount != null ? 'emiAmount' : 'advanceAmount';
  let sum = scaled.reduce((s, item) => s + (Number(item[amountKey]) || 0), 0);
  const diff = roundMoney(newSum - sum);
  if (Math.abs(diff) >= 0.01 && scaled.length > 0) {
    scaled[0] = { ...scaled[0], [amountKey]: roundMoney((scaled[0][amountKey] || 0) + diff) };
  }
  return scaled;
}

async function assertBatchAllowsModification(payrollBatchId) {
  if (!payrollBatchId) return;
  const batch = await PayrollBatch.findById(payrollBatchId).select('status month').lean();
  if (!batch) return;
  if (['freeze', 'complete'].includes(batch.status)) {
    const err = new Error(`Cannot modify paysheet while batch is ${batch.status}`);
    err.code = 'BATCH_LOCKED';
    throw err;
  }
}

async function createAdjustmentRequest({
  payrollRecordId,
  columnHeader,
  fieldPath,
  proposedValue,
  reason,
  userId,
}) {
  const config = await PayrollConfiguration.get();
  if (!config?.allowPaysheetModification) {
    const err = new Error('Paysheet modification is disabled in payroll configuration');
    err.code = 'PAYSHEET_MODIFICATION_DISABLED';
    throw err;
  }

  const normalizedPath = String(fieldPath || '').trim();
  const editable = getEditableColumnDefs(config);
  const colDef = editable.find((c) => c.header === columnHeader && c.fieldPath === normalizedPath);
  if (!colDef) {
    const err = new Error('This column is not configured as editable on the paysheet');
    err.code = 'COLUMN_NOT_EDITABLE';
    throw err;
  }

  if (isBlockedPaysheetAdjustmentPath(normalizedPath)) {
    const err = new Error('This field cannot be adjusted via paysheet');
    err.code = 'FIELD_NOT_ALLOWED';
    throw err;
  }

  const record = await PayrollRecord.findById(payrollRecordId);
  if (!record) {
    const err = new Error('Payroll record not found');
    err.code = 'RECORD_NOT_FOUND';
    throw err;
  }

  await assertBatchAllowsModification(record.payrollBatchId);

  const recordNumeric = readNumericFieldOnRecord(record, normalizedPath);
  if (recordNumeric == null && computePaysheetCellValue(record, columnHeader, config) == null) {
    const err = new Error('This field does not have a numeric value on the payroll record for this employee');
    err.code = 'FIELD_NOT_NUMERIC';
    throw err;
  }

  const { originalValue, recordValueAtRequest } = resolveAdjustmentOriginalValues(
    record,
    columnHeader,
    normalizedPath,
    config
  );
  const proposed = roundMoney(proposedValue);

  if (proposed > originalValue + 0.005) {
    const err = new Error(
      `Proposed amount (${proposed}) cannot exceed the paysheet calculated amount (${originalValue}) for this month`
    );
    err.code = 'PROPOSED_EXCEEDS_ORIGINAL';
    throw err;
  }

  if (Math.abs(proposed - originalValue) < 0.005) {
    const err = new Error('Proposed value is the same as the current amount');
    err.code = 'NO_CHANGE';
    throw err;
  }

  const trimmedReason = String(reason || '').trim();
  if (!trimmedReason) {
    const err = new Error('Reason is required');
    err.code = 'REASON_REQUIRED';
    throw err;
  }

  await PaysheetAdjustmentRequest.updateMany(
    { payrollRecordId: record._id, fieldPath: normalizedPath, status: 'pending' },
    {
      $set: { status: 'cancelled' },
      $push: {
        statusHistory: {
          changedAt: new Date(),
          changedBy: userId,
          previousStatus: 'pending',
          newStatus: 'cancelled',
          reason: 'Superseded by a new adjustment request',
        },
      },
    }
  );

  const request = await PaysheetAdjustmentRequest.create({
    employeeId: record.employeeId,
    payrollRecordId: record._id,
    payrollBatchId: record.payrollBatchId || null,
    month: record.month,
    columnHeader,
    fieldPath: normalizedPath,
    originalValue,
    recordValueAtRequest,
    proposedValue: proposed,
    reason: trimmedReason,
    status: 'pending',
    requestedBy: userId,
    statusHistory: [
      {
        changedAt: new Date(),
        changedBy: userId,
        previousStatus: null,
        newStatus: 'pending',
        reason: trimmedReason,
      },
    ],
  });

  return request;
}

async function applyAdjustmentToRecord(record, fieldPath, newValue, recordValueBefore, paysheetValueBefore) {
  const proposed = roundMoney(newValue);
  const recordBefore = roundMoney(recordValueBefore);
  const paysheetBefore = roundMoney(
    paysheetValueBefore != null && Number.isFinite(paysheetValueBefore) ? paysheetValueBefore : recordBefore
  );

  setValueOnRecord(record, fieldPath, proposed);

  if (fieldPath === 'loanAdvance.totalEMI') {
    const breakdown = record.loanAdvance?.emiBreakdown || [];
    if (breakdown.length > 0) {
      record.set('loanAdvance.emiBreakdown', scaleBreakdownAmounts(breakdown, recordBefore, proposed));
    }
    record.markModified('loanAdvance');
  } else if (fieldPath === 'loanAdvance.advanceDeduction') {
    const breakdown = record.loanAdvance?.advanceBreakdown || [];
    if (breakdown.length > 0) {
      record.set('loanAdvance.advanceBreakdown', scaleBreakdownAmounts(breakdown, recordBefore, proposed));
    }
    record.markModified('loanAdvance');
  }

  const netDelta = computeNetSalaryDelta(fieldPath, paysheetBefore, proposed);
  if (Math.abs(netDelta) >= 0.005) {
    const currentNet = roundMoney(record.netSalary);
    record.set('netSalary', Math.max(0, roundMoney(currentNet + netDelta)));
  }
}

async function reviewAdjustmentRequest(requestId, { approve, comments, userId }) {
  const request = await PaysheetAdjustmentRequest.findById(requestId);
  if (!request) {
    const err = new Error('Adjustment request not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (request.status !== 'pending') {
    const err = new Error(`Request is already ${request.status}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }

  await assertBatchAllowsModification(request.payrollBatchId);

  const newStatus = approve ? 'approved' : 'rejected';
  request.status = newStatus;
  request.reviewedBy = userId;
  request.reviewedAt = new Date();
  request.reviewComments = comments != null ? String(comments).trim() : '';

  request.statusHistory.push({
    changedAt: new Date(),
    changedBy: userId,
    previousStatus: 'pending',
    newStatus,
    comments: request.reviewComments,
  });

  if (approve) {
    const record = await PayrollRecord.findById(request.payrollRecordId);
    if (!record) {
      const err = new Error('Payroll record not found');
      err.code = 'RECORD_NOT_FOUND';
      throw err;
    }
    const currentValue = getValueByPath(record.toObject ? record.toObject() : record, request.fieldPath);
    const baselineRecordValue =
      request.recordValueAtRequest != null ? roundMoney(request.recordValueAtRequest) : request.originalValue;
    if (Math.abs(currentValue - baselineRecordValue) > 0.02) {
      const err = new Error(
        'Payroll record was recalculated since this request was created. Please cancel and submit a new request.'
      );
      err.code = 'STALE_REQUEST';
      throw err;
    }
    await applyAdjustmentToRecord(
      record,
      request.fieldPath,
      request.proposedValue,
      baselineRecordValue,
      request.originalValue
    );
    await record.save();
    request.appliedAt = new Date();
  }

  await request.save();
  return request;
}

async function listAdjustmentRequests(filters = {}) {
  const query = {};
  if (filters.month) query.month = filters.month;
  if (filters.status) query.status = filters.status;
  if (filters.payrollBatchId) query.payrollBatchId = filters.payrollBatchId;
  if (filters.employeeId) query.employeeId = filters.employeeId;

  const requests = await PaysheetAdjustmentRequest.find(query)
    .populate('employeeId', 'emp_no employee_name first_name last_name')
    .populate('requestedBy', 'name email')
    .populate('reviewedBy', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  return requests;
}

/**
 * Build per-employee cell overlay for paysheet rows.
 * @returns {Map<string, Map<string, object>>} employeeId -> columnHeader -> meta
 */
async function buildAdjustmentOverlay(month, employeeIds = []) {
  if (!employeeIds.length) return new Map();

  const config = await PayrollConfiguration.get();
  if (!config?.allowPaysheetModification) return new Map();

  const editableHeaders = new Set(getEditableColumnDefs(config).map((c) => c.header));

  const requests = await PaysheetAdjustmentRequest.find({
    month,
    employeeId: { $in: employeeIds },
    status: { $in: ['pending', 'approved'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const overlay = new Map();
  for (const req of requests) {
    if (!editableHeaders.has(req.columnHeader)) continue;
    const empKey = String(req.employeeId);
    if (!overlay.has(empKey)) overlay.set(empKey, new Map());
    const byHeader = overlay.get(empKey);
    if (byHeader.has(req.columnHeader)) continue;
    byHeader.set(req.columnHeader, {
      requestId: String(req._id),
      status: req.status,
      originalValue: req.originalValue,
      proposedValue: req.proposedValue,
      fieldPath: req.fieldPath,
      reason: req.reason,
    });
  }
  return overlay;
}

function findRowHeaderKey(row, columnHeader) {
  if (row[columnHeader] !== undefined) return columnHeader;
  const norm = normalizeColumnHeader(columnHeader);
  const match = Object.keys(row).find(
    (k) => !k.startsWith('_') && normalizeColumnHeader(k) === norm
  );
  return match || columnHeader;
}

/**
 * Rebuild paysheet cells from current PayrollRecord so formulas use adjusted field values.
 */
function rebuildRowsFromPayrollRecords(rows, records, outputColumns) {
  if (!Array.isArray(outputColumns) || outputColumns.length === 0 || !Array.isArray(records)) {
    return rows;
  }
  return rows.map((row, index) => {
    const rec = records[index];
    if (!rec) return row;
    const serial = row['S.No'] != null ? row['S.No'] : index + 1;
    const payslip = payrollRecordToPayslipShape(rec?.toObject ? rec.toObject() : rec);
    const built = outputColumnService.buildRowFromOutputColumns(payslip, outputColumns, serial);
    return {
      ...row,
      ...built,
      'S.No': serial,
      _employeeId: row._employeeId,
      _payrollRecordId: row._payrollRecordId,
      _leftDate: row._leftDate,
    };
  });
}

function applyOverlayToRows(rows, overlay, editableColumns) {
  const editableHeaderSet = new Set(editableColumns.map((c) => c.header));
  const editableNormSet = new Set(editableColumns.map((c) => normalizeColumnHeader(c.header)));
  return rows.map((row) => {
    const empId = row._employeeId != null ? String(row._employeeId) : null;
    if (!empId || !overlay.has(empId)) {
      return { ...row, _cellAdjustments: row._cellAdjustments || {} };
    }
    const byHeader = overlay.get(empId);
    const cellAdjustments = { ...(row._cellAdjustments || {}) };
    for (const [header, meta] of byHeader.entries()) {
      const headerNorm = normalizeColumnHeader(header);
      if (!editableHeaderSet.has(header) && !editableNormSet.has(headerNorm)) continue;
      const rowKey = findRowHeaderKey(row, header);
      cellAdjustments[rowKey] = meta;
      if (meta.status === 'pending' || meta.status === 'approved') {
        row = { ...row, [rowKey]: meta.proposedValue };
      }
    }
    return { ...row, _cellAdjustments: cellAdjustments };
  });
}

async function autoRejectPendingPaysheetAdjustmentsForBatch(batch, userId, reason) {
  const batchId = batch?._id || batch?.id;
  if (!batchId) {
    return { rejected: 0 };
  }

  const pending = await PaysheetAdjustmentRequest.find({
    payrollBatchId: batchId,
    status: 'pending',
  });

  let rejected = 0;
  for (const req of pending) {
    req.status = 'rejected';
    req.reviewedBy = userId;
    req.reviewedAt = new Date();
    req.reviewComments = reason;
    req.statusHistory.push({
      changedAt: new Date(),
      changedBy: userId,
      previousStatus: 'pending',
      newStatus: 'rejected',
      reason,
    });
    await req.save();
    rejected += 1;
  }

  return { rejected };
}

function attachEditableFieldValuesToRows(rows, records, config, editableColumns) {
  if (!editableColumns.length) return rows;
  return rows.map((row, index) => {
    const rec = Array.isArray(records) ? records[index] : null;
    if (!rec) return row;
    return {
      ...row,
      _editableFieldValues: buildEditableFieldValuesForRecord(rec, config, editableColumns),
    };
  });
}

module.exports = {
  isBlockedPaysheetAdjustmentPath,
  isDeductionPath,
  isEarningPath,
  getEditableColumnDefs,
  resolveEditableFieldPath,
  computePaysheetCellValue,
  resolveAdjustmentOriginalValues,
  createAdjustmentRequest,
  reviewAdjustmentRequest,
  listAdjustmentRequests,
  buildAdjustmentOverlay,
  applyOverlayToRows,
  attachEditableFieldValuesToRows,
  rebuildRowsFromPayrollRecords,
  autoRejectPendingPaysheetAdjustmentsForBatch,
  getValueByPath,
  computeNetSalaryDelta,
};
