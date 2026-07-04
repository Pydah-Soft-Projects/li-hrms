/**
 * Employment tenure tracking — join/leave cycles per employee.
 * Original doj on Employee is overwritten on rejoin; full history lives in employmentTenures.
 */

const employmentTenureEntrySchema = {
  joinDate: { type: Date, required: true },
  leaveDate: { type: Date, default: null },
  leaveReason: { type: String, trim: true, default: null },
  /** How this tenure ended: resignation | termination | manual | rejoin */
  closedBy: { type: String, trim: true, default: null },
  /** Rejoin application that opened this tenure (null for first tenure) */
  applicationId: { type: require('mongoose').Schema.Types.ObjectId, ref: 'EmployeeApplication', default: null },
  remarks: { type: String, trim: true, default: null },
};

/**
 * Backfill a single tenure from current employee doj/leftDate when history is empty (legacy records).
 */
function backfillTenuresFromEmployee(employee) {
  if (!employee) return;
  if (Array.isArray(employee.employmentTenures) && employee.employmentTenures.length > 0) return;
  if (!employee.doj) return;

  employee.employmentTenures = [
    {
      joinDate: employee.doj,
      leaveDate: employee.leftDate || null,
      leaveReason: employee.leftReason || null,
      closedBy: employee.leftDate ? 'manual' : null,
      applicationId: null,
      remarks: null,
    },
  ];
}

/**
 * Close the currently open tenure when employee leaves.
 */
function closeCurrentTenure(employee, leaveDate, leaveReason, closedBy = 'manual') {
  if (!employee) return;
  backfillTenuresFromEmployee(employee);

  if (!Array.isArray(employee.employmentTenures)) {
    employee.employmentTenures = [];
  }

  const leaveDateObj = leaveDate instanceof Date ? leaveDate : new Date(leaveDate);
  const openTenure = employee.employmentTenures.find((t) => !t.leaveDate);

  if (openTenure) {
    openTenure.leaveDate = leaveDateObj;
    openTenure.leaveReason = leaveReason || null;
    openTenure.closedBy = closedBy;
    return;
  }

  if (employee.doj) {
    employee.employmentTenures.push({
      joinDate: employee.doj,
      leaveDate: leaveDateObj,
      leaveReason: leaveReason || null,
      closedBy,
      applicationId: null,
      remarks: null,
    });
  }
}

/**
 * Record first tenure when a new employee is verified.
 */
function recordInitialTenure(employee, joinDate) {
  if (!employee) return;
  if (!Array.isArray(employee.employmentTenures)) {
    employee.employmentTenures = [];
  }
  if (employee.employmentTenures.length > 0) return;

  employee.employmentTenures.push({
    joinDate: joinDate instanceof Date ? joinDate : new Date(joinDate),
    leaveDate: null,
    leaveReason: null,
    closedBy: null,
    applicationId: null,
    remarks: null,
  });
}

/**
 * Open a new tenure on rejoin verification (previous tenure must already be closed).
 */
function openNewTenure(employee, joinDate, applicationId, remarks) {
  if (!employee) return;
  if (!Array.isArray(employee.employmentTenures)) {
    employee.employmentTenures = [];
  }

  const joinDateObj = joinDate instanceof Date ? joinDate : new Date(joinDate);

  const openTenure = employee.employmentTenures.find((t) => !t.leaveDate);
  if (openTenure) {
    openTenure.leaveDate = joinDateObj;
    openTenure.closedBy = openTenure.closedBy || 'rejoin';
  }

  employee.employmentTenures.push({
    joinDate: joinDateObj,
    leaveDate: null,
    leaveReason: null,
    closedBy: null,
    applicationId: applicationId || null,
    remarks: remarks || null,
  });
}

module.exports = {
  employmentTenureEntrySchema,
  backfillTenuresFromEmployee,
  closeCurrentTenure,
  recordInitialTenure,
  openNewTenure,
};
