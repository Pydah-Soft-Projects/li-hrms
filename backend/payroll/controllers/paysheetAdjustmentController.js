const PayrollConfiguration = require('../model/PayrollConfiguration');
const paysheetAdjustmentService = require('../services/paysheetAdjustmentService');

exports.getPaysheetModificationSettings = async (req, res) => {
  try {
    const config = await PayrollConfiguration.get();
    const editableColumns = paysheetAdjustmentService.getEditableColumnDefs(config);
    return res.status(200).json({
      success: true,
      data: {
        allowPaysheetModification: !!config?.allowPaysheetModification,
        editableColumns,
      },
    });
  } catch (error) {
    console.error('getPaysheetModificationSettings error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to load settings' });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const { payrollRecordId, columnHeader, fieldPath, proposedValue, reason } = req.body || {};
    if (!payrollRecordId || !columnHeader || !fieldPath) {
      return res.status(400).json({ success: false, message: 'payrollRecordId, columnHeader, and fieldPath are required' });
    }
    const request = await paysheetAdjustmentService.createAdjustmentRequest({
      payrollRecordId,
      columnHeader,
      fieldPath,
      proposedValue,
      reason,
      userId: req.user._id,
    });
    return res.status(201).json({ success: true, data: request });
  } catch (error) {
    const code = error.code || 'CREATE_FAILED';
    const status =
      code === 'PAYSHEET_MODIFICATION_DISABLED' ||
      code === 'COLUMN_NOT_EDITABLE' ||
      code === 'FIELD_NOT_ALLOWED' ||
      code === 'PROPOSED_EXCEEDS_ORIGINAL' ||
      code === 'NO_CHANGE' ||
      code === 'REASON_REQUIRED' ||
      code === 'FIELD_NOT_NUMERIC' ||
      code === 'BATCH_LOCKED'
        ? 400
        : code === 'RECORD_NOT_FOUND'
          ? 404
          : 500;
    return res.status(status).json({ success: false, message: error.message, code });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const { month, status, payrollBatchId, employeeId } = req.query;
    const data = await paysheetAdjustmentService.listAdjustmentRequests({
      month,
      status,
      payrollBatchId,
      employeeId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('listPaysheetAdjustmentRequests error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Failed to list requests' });
  }
};

exports.approveRequest = async (req, res) => {
  try {
    const { comments } = req.body || {};
    const data = await paysheetAdjustmentService.reviewAdjustmentRequest(req.params.id, {
      approve: true,
      comments,
      userId: req.user._id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const code = error.code || 'APPROVE_FAILED';
    const status =
      code === 'NOT_FOUND' || code === 'RECORD_NOT_FOUND'
        ? 404
        : code === 'INVALID_STATUS' || code === 'STALE_REQUEST' || code === 'BATCH_LOCKED'
          ? 400
          : 500;
    return res.status(status).json({ success: false, message: error.message, code });
  }
};

exports.rejectRequest = async (req, res) => {
  try {
    const { comments } = req.body || {};
    const data = await paysheetAdjustmentService.reviewAdjustmentRequest(req.params.id, {
      approve: false,
      comments,
      userId: req.user._id,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    const code = error.code || 'REJECT_FAILED';
    const status = code === 'NOT_FOUND' ? 404 : code === 'INVALID_STATUS' ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message, code });
  }
};
