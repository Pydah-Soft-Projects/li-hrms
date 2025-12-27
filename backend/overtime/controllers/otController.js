/**
 * Overtime Controller
 * Handles OT request creation, approval, and management
 */

const OT = require('../model/OT');
const AttendanceDaily = require('../../attendance/model/AttendanceDaily');
const ConfusedShift = require('../../shifts/model/ConfusedShift');
const Employee = require('../../employees/model/Employee');
const { createOTRequest, approveOTRequest, rejectOTRequest, convertExtraHoursToOT } = require('../services/otService');

/**
 * @desc    Create OT request
 * @route   POST /api/ot
 * @access  Private (HOD, HR, Super Admin)
 */
exports.createOT = async (req, res) => {
  try {
    const {
      employeeId,
      employeeNumber,
      date,
      otOutTime,
      shiftId,
      manuallySelectedShiftId,
      comments,
      photoEvidence,
      geoLocation
    } = req.body;

    if (!employeeId || !employeeNumber || !date || !otOutTime) {
      return res.status(400).json({
        success: false,
        message: 'Employee, date, and OT out time are required',
      });
    }

    const result = await createOTRequest(
      {
        employeeId,
        employeeNumber,
        date,
        otOutTime,
        shiftId,
        manuallySelectedShiftId,
        comments,
        photoEvidence,
        geoLocation
      },
      req.user?.userId || req.user?._id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const otRequest = await OT.findById(result.data._id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('shiftId', 'name startTime endTime duration')
      .populate('requestedBy', 'name email');

    res.status(201).json({
      success: true,
      message: result.message,
      data: otRequest,
    });

  } catch (error) {
    console.error('Error creating OT:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating OT request',
      error: error.message,
    });
  }
};

/**
 * @desc    Get OT requests
 * @route   GET /api/ot
 * @access  Private
 */
exports.getOTRequests = async (req, res) => {
  try {
    const { employeeId, employeeNumber, date, status, startDate, endDate } = req.query;

    const query = { isActive: true };

    if (employeeId) query.employeeId = employeeId;
    if (employeeNumber) query.employeeNumber = employeeNumber.toUpperCase();
    if (date) query.date = date;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const otRequests = await OT.find(query)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('shiftId', 'name startTime endTime duration')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json({
      success: true,
      data: otRequests,
      count: otRequests.length,
    });

  } catch (error) {
    console.error('Error fetching OT requests:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching OT requests',
      error: error.message,
    });
  }
};

/**
 * @desc    Get single OT request
 * @route   GET /api/ot/:id
 * @access  Private
 */
exports.getOTRequest = async (req, res) => {
  try {
    const otRequest = await OT.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('shiftId', 'name startTime endTime duration')
      .populate('requestedBy', 'name email')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email')
      .populate('confusedShiftId');

    if (!otRequest) {
      return res.status(404).json({
        success: false,
        message: 'OT request not found',
      });
    }

    res.status(200).json({
      success: true,
      data: otRequest,
    });

  } catch (error) {
    console.error('Error fetching OT request:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching OT request',
      error: error.message,
    });
  }
};

/**
 * @desc    Approve OT request
 * @route   PUT /api/ot/:id/approve
 * @access  Private (HOD, HR, Super Admin)
 */
exports.approveOT = async (req, res) => {
  try {
    const result = await approveOTRequest(
      req.params.id,
      req.user?.userId || req.user?._id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const otRequest = await OT.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('shiftId', 'name startTime endTime duration')
      .populate('approvedBy', 'name email');

    res.status(200).json({
      success: true,
      message: result.message,
      data: otRequest,
    });

  } catch (error) {
    console.error('Error approving OT:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving OT request',
      error: error.message,
    });
  }
};

/**
 * @desc    Reject OT request
 * @route   PUT /api/ot/:id/reject
 * @access  Private (HOD, HR, Super Admin)
 */
exports.rejectOT = async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await rejectOTRequest(
      req.params.id,
      req.user?.userId || req.user?._id,
      reason
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const otRequest = await OT.findById(req.params.id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('rejectedBy', 'name email');

    res.status(200).json({
      success: true,
      message: result.message,
      data: otRequest,
    });

  } catch (error) {
    console.error('Error rejecting OT:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting OT request',
      error: error.message,
    });
  }
};

/**
 * @desc    Convert extra hours from attendance to OT
 * @route   POST /api/ot/convert-from-attendance
 * @access  Private (HR, Super Admin, Sub Admin)
 */
exports.convertExtraHoursToOT = async (req, res) => {
  try {
    const { employeeId, employeeNumber, date } = req.body;

    if (!employeeId || !employeeNumber || !date) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, employee number, and date are required',
      });
    }

    const result = await convertExtraHoursToOT(
      employeeId,
      employeeNumber,
      date,
      req.user?.userId || req.user?._id
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    const otRecord = await OT.findById(result.data._id)
      .populate('employeeId', 'emp_no employee_name department designation')
      .populate('shiftId', 'name startTime endTime duration')
      .populate('convertedBy', 'name email');

    res.status(201).json({
      success: true,
      message: result.message,
      data: otRecord,
    });

  } catch (error) {
    console.error('Error converting extra hours to OT:', error);
    res.status(500).json({
      success: false,
      message: 'Error converting extra hours to OT',
      error: error.message,
    });
  }
};

/**
 * @desc    Check ConfusedShift for employee date
 * @route   GET /api/ot/check-confused/:employeeNumber/:date
 * @access  Private
 */
exports.checkConfusedShift = async (req, res) => {
  try {
    const { employeeNumber, date } = req.params;

    const confusedShift = await ConfusedShift.findOne({
      employeeNumber: employeeNumber.toUpperCase(),
      date: date,
      status: 'pending',
    }).populate('possibleShifts.shiftId', 'name startTime endTime duration');

    if (!confusedShift) {
      return res.status(200).json({
        success: true,
        hasConfusedShift: false,
        data: null,
      });
    }

    res.status(200).json({
      success: true,
      hasConfusedShift: true,
      requiresShiftSelection: confusedShift.requiresManualSelection || false,
      data: confusedShift,
    });

  } catch (error) {
    console.error('Error checking ConfusedShift:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking ConfusedShift',
      error: error.message,
    });
  }
};

