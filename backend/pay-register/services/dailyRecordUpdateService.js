const LeaveSettings = require('../../leaves/model/LeaveSettings');

/**
 * Daily Record Update Service
 * Handles updating single day records with validation
 */

/**
 * Validate daily record update
 * @param {Object} updateData - Update data for a date
 * @returns {Object} Validation result { valid, errors }
 */
function validateDailyRecord(updateData) {
  const errors = [];

  // Validate firstHalf
  if (updateData.firstHalf) {
    if (!['present', 'absent', 'leave', 'od'].includes(updateData.firstHalf.status)) {
      errors.push('firstHalf.status must be one of: present, absent, leave, od');
    }
    if (updateData.firstHalf.status === 'leave' && !updateData.firstHalf.leaveType) {
      errors.push('leaveType is required when status is leave');
    }
    if (updateData.firstHalf.status !== 'leave' && updateData.firstHalf.leaveType) {
      errors.push('leaveType should only be set when status is leave');
    }
    if (updateData.firstHalf.status !== 'od' && updateData.firstHalf.isOD) {
      errors.push('isOD should only be set when status is od');
    }
    if (updateData.firstHalf.otHours !== undefined && updateData.firstHalf.otHours < 0) {
      errors.push('otHours must be >= 0');
    }
  }

  // Validate secondHalf
  if (updateData.secondHalf) {
    if (!['present', 'absent', 'leave', 'od'].includes(updateData.secondHalf.status)) {
      errors.push('secondHalf.status must be one of: present, absent, leave, od');
    }
    if (updateData.secondHalf.status === 'leave' && !updateData.secondHalf.leaveType) {
      errors.push('leaveType is required when status is leave');
    }
    if (updateData.secondHalf.status !== 'leave' && updateData.secondHalf.leaveType) {
      errors.push('leaveType should only be set when status is leave');
    }
    if (updateData.secondHalf.status !== 'od' && updateData.secondHalf.isOD) {
      errors.push('isOD should only be set when status is od');
    }
    if (updateData.secondHalf.otHours !== undefined && updateData.secondHalf.otHours < 0) {
      errors.push('otHours must be >= 0');
    }
  }

  // Validate full day fields
  if (updateData.status && !['present', 'absent', 'leave', 'od'].includes(updateData.status)) {
    errors.push('status must be one of: present, absent, leave, od');
  }
  if (updateData.otHours !== undefined && updateData.otHours < 0) {
    errors.push('otHours must be >= 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalize leave type to standard format
 * @param {String} leaveType - Leave type (can be 'paid', 'lop', 'without_pay', or leave type code)
 * @returns {String} Normalized leave type
 */
async function normalizeLeaveType(leaveType) {
  if (!leaveType) return null;

  const normalized = leaveType.toLowerCase();

  // If it's already a nature (paid, lop, without_pay), return it
  if (['paid', 'lop', 'loss_of_pay', 'without_pay'].includes(normalized)) {
    if (normalized === 'loss_of_pay') return 'lop';
    if (normalized === 'without_pay') return 'without_pay';
    return normalized;
  }

  // Otherwise, get nature from leave settings
  try {
    const leaveSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
    if (leaveSettings && leaveSettings.types) {
      const leaveTypeConfig = leaveSettings.types.find(
        (lt) => lt.code.toUpperCase() === leaveType.toUpperCase() && lt.isActive
      );
      if (leaveTypeConfig) {
        return leaveTypeConfig.leaveNature || 'paid';
      }
    }
  } catch (error) {
    console.error('Error normalizing leave type:', error);
  }

  return 'paid'; // Default
}

/**
 * Apply the provided updates to a single day's attendance record in a pay register, creating the record if missing and recording edit history.
 *
 * Updates may modify firstHalf/secondHalf fields, full-day fields (status, leaveType, isOD, otHours, shift), remarks, and split status; changes are recorded in payRegister.editHistory and payRegister edit metadata is updated. If a daily record did not exist for the given date it will be created with sensible defaults.
 *
 * @param {Object} payRegister - Pay register document to modify (mutated in place).
 * @param {string} date - Date string in YYYY-MM-DD format identifying the daily record to update.
 * @param {Object} updateData - Partial update payload. Supported keys include: firstHalf, secondHalf, status, leaveType, leaveNature, isOD, isSplit, otHours, shiftId, shiftName, remarks.
 * @param {Object} editedBy - User performing the edit (object or id). When an object is provided its _id, name/employee_name, and role are used for edit history entries.
 * @returns {Object} The updated daily record object (the entry within payRegister.dailyRecords for the given date).
 * @throws {Error} If updateData fails validation (validation errors are included in the error message).
 */
async function updateDailyRecord(payRegister, date, updateData, editedBy) {
  // Validate update data
  const validation = validateDailyRecord(updateData);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  // Find existing daily record
  let dailyRecord = payRegister.dailyRecords.find((r) => r.date === date);

  if (!dailyRecord) {
    // Create new daily record
    dailyRecord = {
      date,
      firstHalf: {
        status: 'absent',
        leaveType: null,
        leaveNature: null,
        isOD: false,
        otHours: 0,
        shiftId: null,
        remarks: null,
      },
      secondHalf: {
        status: 'absent',
        leaveType: null,
        leaveNature: null,
        isOD: false,
        otHours: 0,
        shiftId: null,
        remarks: null,
      },
      status: null,
      leaveType: null,
      leaveNature: null,
      isOD: false,
      isSplit: false,
      shiftId: null,
      shiftName: null,
      otHours: 0,
      attendanceRecordId: null,
      leaveIds: [],
      leaveSplitIds: [],
      odIds: [],
      otIds: [],
      remarks: null,
    };
    payRegister.dailyRecords.push(dailyRecord);
  }

  // Store old values for edit history
  const oldValues = {
    firstHalf: { ...dailyRecord.firstHalf },
    secondHalf: { ...dailyRecord.secondHalf },
    status: dailyRecord.status,
    leaveType: dailyRecord.leaveType,
    isOD: dailyRecord.isOD,
    otHours: dailyRecord.otHours,
    shiftId: dailyRecord.shiftId,
  };

  // Update firstHalf
  if (updateData.firstHalf) {
    dailyRecord.firstHalf.status = updateData.firstHalf.status || dailyRecord.firstHalf.status;

    if (updateData.firstHalf.status === 'leave') {
      dailyRecord.firstHalf.leaveType = updateData.firstHalf.leaveType || await normalizeLeaveType(updateData.firstHalf.leaveType);
      dailyRecord.firstHalf.leaveNature = updateData.firstHalf.leaveNature || dailyRecord.firstHalf.leaveNature || 'paid';
      dailyRecord.firstHalf.isOD = false;
    } else if (updateData.firstHalf.status === 'od') {
      dailyRecord.firstHalf.isOD = true;
      dailyRecord.firstHalf.leaveType = null;
      dailyRecord.firstHalf.leaveNature = null;
    } else {
      dailyRecord.firstHalf.leaveType = null;
      dailyRecord.firstHalf.leaveNature = null;
      dailyRecord.firstHalf.isOD = false;
    }

    if (updateData.firstHalf.otHours !== undefined) {
      dailyRecord.firstHalf.otHours = updateData.firstHalf.otHours;
    }
    if (updateData.firstHalf.shiftId !== undefined) {
      dailyRecord.firstHalf.shiftId = updateData.firstHalf.shiftId;
    }
    if (updateData.firstHalf.remarks !== undefined) {
      dailyRecord.firstHalf.remarks = updateData.firstHalf.remarks;
    }
  }

  // Update secondHalf
  if (updateData.secondHalf) {
    dailyRecord.secondHalf.status = updateData.secondHalf.status || dailyRecord.secondHalf.status;

    if (updateData.secondHalf.status === 'leave') {
      dailyRecord.secondHalf.leaveType = updateData.secondHalf.leaveType || await normalizeLeaveType(updateData.secondHalf.leaveType);
      dailyRecord.secondHalf.leaveNature = updateData.secondHalf.leaveNature || dailyRecord.secondHalf.leaveNature || 'paid';
      dailyRecord.secondHalf.isOD = false;
    } else if (updateData.secondHalf.status === 'od') {
      dailyRecord.secondHalf.isOD = true;
      dailyRecord.secondHalf.leaveType = null;
      dailyRecord.secondHalf.leaveNature = null;
    } else {
      dailyRecord.secondHalf.leaveType = null;
      dailyRecord.secondHalf.leaveNature = null;
      dailyRecord.secondHalf.isOD = false;
    }

    if (updateData.secondHalf.otHours !== undefined) {
      dailyRecord.secondHalf.otHours = updateData.secondHalf.otHours;
    }
    if (updateData.secondHalf.shiftId !== undefined) {
      dailyRecord.secondHalf.shiftId = updateData.secondHalf.shiftId;
    }
    if (updateData.secondHalf.remarks !== undefined) {
      dailyRecord.secondHalf.remarks = updateData.secondHalf.remarks;
    }
  }

  // Update full day fields if provided
  if (updateData.status !== undefined) {
    dailyRecord.status = updateData.status;
    // If status is set, update both halves if not split
    if (!updateData.isSplit) {
      dailyRecord.firstHalf.status = updateData.status;
      dailyRecord.secondHalf.status = updateData.status;
    }
  }

  if (updateData.leaveType !== undefined && dailyRecord.status === 'leave') {
    dailyRecord.leaveType = updateData.leaveType;
    dailyRecord.leaveNature = updateData.leaveNature || dailyRecord.leaveNature || 'paid';
    if (!updateData.isSplit) {
      dailyRecord.firstHalf.leaveType = updateData.leaveType;
      dailyRecord.firstHalf.leaveNature = updateData.leaveNature || dailyRecord.leaveNature || 'paid';
      dailyRecord.secondHalf.leaveType = updateData.leaveType;
      dailyRecord.secondHalf.leaveNature = updateData.leaveNature || dailyRecord.leaveNature || 'paid';
    }
  }

  if (updateData.isOD !== undefined && dailyRecord.status === 'od') {
    dailyRecord.isOD = updateData.isOD;
    if (!updateData.isSplit) {
      dailyRecord.firstHalf.isOD = updateData.isOD;
      dailyRecord.secondHalf.isOD = updateData.isOD;
    }
  }

  if (updateData.otHours !== undefined) {
    dailyRecord.otHours = updateData.otHours;
  }

  if (updateData.shiftId !== undefined) {
    dailyRecord.shiftId = updateData.shiftId;
    dailyRecord.firstHalf.shiftId = updateData.shiftId;
    dailyRecord.secondHalf.shiftId = updateData.shiftId;
  }

  if (updateData.shiftName !== undefined) {
    dailyRecord.shiftName = updateData.shiftName;
  }

  if (updateData.remarks !== undefined) {
    dailyRecord.remarks = updateData.remarks;
  }

  // Determine if split - use updateData.isSplit if provided, otherwise check if halves differ
  if (updateData.isSplit !== undefined) {
    dailyRecord.isSplit = updateData.isSplit;
  } else {
    dailyRecord.isSplit = dailyRecord.firstHalf.status !== dailyRecord.secondHalf.status;
  }

  // Update full day status if not split
  if (!dailyRecord.isSplit) {
    dailyRecord.status = dailyRecord.firstHalf.status;
    dailyRecord.leaveType = dailyRecord.firstHalf.leaveType;
    dailyRecord.leaveNature = dailyRecord.firstHalf.leaveNature;
    dailyRecord.isOD = dailyRecord.firstHalf.isOD;
  } else {
    dailyRecord.status = null;
    dailyRecord.leaveType = null;
    dailyRecord.leaveNature = null;
    dailyRecord.isOD = false;
  }

  // Calculate total OT hours for the day
  dailyRecord.otHours = (dailyRecord.firstHalf.otHours || 0) + (dailyRecord.secondHalf.otHours || 0);
  if (updateData.otHours !== undefined) {
    dailyRecord.otHours = updateData.otHours;
  }

  // Add to edit history
  const changes = [];

  if (oldValues.firstHalf.status !== dailyRecord.firstHalf.status) {
    changes.push({
      field: 'firstHalf.status',
      oldValue: oldValues.firstHalf.status,
      newValue: dailyRecord.firstHalf.status,
    });
  }

  if (oldValues.secondHalf.status !== dailyRecord.secondHalf.status) {
    changes.push({
      field: 'secondHalf.status',
      oldValue: oldValues.secondHalf.status,
      newValue: dailyRecord.secondHalf.status,
    });
  }

  if (oldValues.otHours !== dailyRecord.otHours) {
    changes.push({
      field: 'otHours',
      oldValue: oldValues.otHours,
      newValue: dailyRecord.otHours,
    });
  }

  if (oldValues.shiftId?.toString() !== dailyRecord.shiftId?.toString()) {
    changes.push({
      field: 'shiftId',
      oldValue: oldValues.shiftId,
      newValue: dailyRecord.shiftId,
    });
  }

  // Add each change to edit history
  for (const change of changes) {
    payRegister.editHistory.push({
      date,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      editedBy: editedBy._id || editedBy,
      editedByName: editedBy.name || editedBy.employee_name || 'System',
      editedByRole: editedBy.role || 'system',
      editedAt: new Date(),
      remarks: updateData.remarks || null,
    });
  }

  // Set manual edit flag if there are changes
  if (changes.length > 0 || updateData.remarks) {
    dailyRecord.isManuallyEdited = true;
  }

  // Update last edited tracking
  payRegister.lastEditedBy = editedBy._id || editedBy;
  payRegister.lastEditedAt = new Date();
  payRegister.editedBy = editedBy._id || editedBy;
  payRegister.editedAt = new Date();

  return dailyRecord;
}

module.exports = {
  updateDailyRecord,
  validateDailyRecord,
  normalizeLeaveType,
};
