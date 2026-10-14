/**
 * Shift Sync Controller
 * Handles syncing shifts for existing attendance records
 */

const { syncShiftsForExistingRecords } = require('../services/shiftDetectionService');

/**
 * @desc    Sync shifts for existing attendance records
 * @route   POST /api/shifts/sync
 * @access  Private (Super Admin, Sub Admin, HR, HOD)
 */
exports.syncShifts = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      employeeNumber,
      search,
      divisionId,
      departmentId,
      designationId
    } = req.body;

    const stats = await syncShiftsForExistingRecords({
      startDate,
      endDate,
      employeeNumber,
      search,
      divisionId,
      departmentId,
      designationId
    });

    if (stats.success) {
      res.status(200).json({
        success: true,
        message: stats.message,
        data: stats,
      });
    } else {
      res.status(500).json({
        success: false,
        message: stats.message,
        data: stats,
      });
    }

  } catch (error) {
    console.error('Error syncing shifts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to sync shifts',
    });
  }
};

