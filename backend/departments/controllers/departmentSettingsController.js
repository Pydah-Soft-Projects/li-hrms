const DepartmentSettings = require('../model/DepartmentSettings');
const Department = require('../model/Department');
const LeaveSettings = require('../../leaves/model/LeaveSettings');
const LoanSettings = require('../../loans/model/LoanSettings');

/**
 * Helper function to get resolved leave settings
 * Returns department settings if available, otherwise global settings
 */
async function getResolvedLeaveSettings(departmentId) {
  try {
    // Get department settings
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    
    // Get global leave settings
    const globalSettings = await LeaveSettings.findOne({ type: 'leave', isActive: true });
    
    // Merge: Department settings override global
    const resolved = {
      leavesPerDay: deptSettings?.leaves?.leavesPerDay ?? null,
      paidLeavesCount: deptSettings?.leaves?.paidLeavesCount ?? null,
      dailyLimit: deptSettings?.leaves?.dailyLimit ?? null,
      monthlyLimit: deptSettings?.leaves?.monthlyLimit ?? null,
    };
    
    // If department settings are null, use global defaults
    // Note: Global settings don't have leavesPerDay/paidLeavesCount directly
    // These might need to be configured separately or use department defaults
    
    return resolved;
  } catch (error) {
    console.error('Error getting resolved leave settings:', error);
    return null;
  }
}

/**
 * Helper function to get resolved loan settings
 * Returns department settings if available, otherwise global settings
 */
async function getResolvedLoanSettings(departmentId, type = 'loan') {
  try {
    // Get department settings
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    
    // Get global loan settings
    const globalSettings = await LoanSettings.findOne({ type, isActive: true });
    
    // Get the appropriate settings object (loans or salaryAdvance)
    const deptLoanSettings = type === 'loan' ? deptSettings?.loans : deptSettings?.salaryAdvance;
    const globalLoanSettings = globalSettings?.settings || {};
    
    // Merge: Department settings override global
    const resolved = {
      interestRate: deptLoanSettings?.interestRate ?? globalLoanSettings.interestRate ?? 0,
      isInterestApplicable: deptLoanSettings?.isInterestApplicable ?? globalLoanSettings.isInterestApplicable ?? false,
      minTenure: deptLoanSettings?.minTenure ?? globalLoanSettings.minDuration ?? 1,
      maxTenure: deptLoanSettings?.maxTenure ?? globalLoanSettings.maxDuration ?? 60,
      minAmount: deptLoanSettings?.minAmount ?? globalLoanSettings.minAmount ?? 1000,
      maxAmount: deptLoanSettings?.maxAmount ?? globalLoanSettings.maxAmount ?? null,
      maxPerEmployee: deptLoanSettings?.maxPerEmployee ?? globalLoanSettings.maxPerEmployee ?? null,
      maxActivePerEmployee: deptLoanSettings?.maxActivePerEmployee ?? globalLoanSettings.maxActivePerEmployee ?? 1,
      minServicePeriod: deptLoanSettings?.minServicePeriod ?? globalLoanSettings.minServicePeriod ?? 0,
    };
    
    return resolved;
  } catch (error) {
    console.error('Error getting resolved loan settings:', error);
    return null;
  }
}

/**
 * Helper function to get resolved permission settings
 * Returns department settings if available, otherwise global settings
 */
async function getResolvedPermissionSettings(departmentId) {
  try {
    // Get department settings
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    
    // Get department model for permission policy
    const department = await Department.findById(departmentId);
    
    // Get global permission deduction settings
    const PermissionDeductionSettings = require('../../permissions/model/PermissionDeductionSettings');
    const globalSettings = await PermissionDeductionSettings.getActiveSettings();
    
    // Merge: Department settings override department model defaults and global settings
    const resolved = {
      perDayLimit: deptSettings?.permissions?.perDayLimit ?? department?.permissionPolicy?.dailyLimit ?? 0,
      monthlyLimit: deptSettings?.permissions?.monthlyLimit ?? department?.permissionPolicy?.monthlyLimit ?? 0,
      deductFromSalary: deptSettings?.permissions?.deductFromSalary ?? department?.permissionPolicy?.deductFromSalary ?? false,
      deductionAmount: deptSettings?.permissions?.deductionAmount ?? department?.permissionPolicy?.deductionAmount ?? 0,
      deductionRules: {
        countThreshold: deptSettings?.permissions?.deductionRules?.countThreshold ?? globalSettings?.deductionRules?.countThreshold ?? null,
        deductionType: deptSettings?.permissions?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
        deductionAmount: deptSettings?.permissions?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
        minimumDuration: deptSettings?.permissions?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
        calculationMode: deptSettings?.permissions?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
      },
    };
    
    return resolved;
  } catch (error) {
    console.error('Error getting resolved permission settings:', error);
    return null;
  }
}

/**
 * Helper function to get resolved OT settings
 * Returns department settings if available, otherwise global settings
 */
async function getResolvedOTSettings(departmentId) {
  try {
    // Get department settings
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    
    // Get global OT settings
    const Settings = require('../../settings/model/Settings');
    const globalPayPerHour = await Settings.findOne({ key: 'ot_pay_per_hour' });
    const globalMinHours = await Settings.findOne({ key: 'ot_min_hours' });
    
    // Merge: Department settings override global
    const resolved = {
      otPayPerHour: deptSettings?.ot?.otPayPerHour ?? (globalPayPerHour?.value || 0),
      minOTHours: deptSettings?.ot?.minOTHours ?? (globalMinHours?.value || 0),
    };
    
    return resolved;
  } catch (error) {
    console.error('Error getting resolved OT settings:', error);
    return null;
  }
}

/**
 * Helper function to get resolved attendance deduction settings
 * Returns department settings if available, otherwise global settings
 */
async function getResolvedAttendanceSettings(departmentId) {
  try {
    // Get department settings
    const deptSettings = await DepartmentSettings.findOne({ department: departmentId });
    
    // Get global attendance deduction settings
    const AttendanceDeductionSettings = require('../../attendance/model/AttendanceDeductionSettings');
    const globalSettings = await AttendanceDeductionSettings.getActiveSettings();
    const EarlyOutSettings = require('../../attendance/model/EarlyOutSettings');
    const globalEarlyOut = await EarlyOutSettings.getActiveSettings();
    
    // Merge: Department settings override global
    const resolved = {
      deductionRules: {
        combinedCountThreshold: deptSettings?.attendance?.deductionRules?.combinedCountThreshold ?? globalSettings?.deductionRules?.combinedCountThreshold ?? null,
        deductionType: deptSettings?.attendance?.deductionRules?.deductionType ?? globalSettings?.deductionRules?.deductionType ?? null,
        deductionAmount: deptSettings?.attendance?.deductionRules?.deductionAmount ?? globalSettings?.deductionRules?.deductionAmount ?? null,
        minimumDuration: deptSettings?.attendance?.deductionRules?.minimumDuration ?? globalSettings?.deductionRules?.minimumDuration ?? null,
        calculationMode: deptSettings?.attendance?.deductionRules?.calculationMode ?? globalSettings?.deductionRules?.calculationMode ?? null,
      },
      earlyOut: {
        isEnabled: deptSettings?.attendance?.earlyOut?.isEnabled ?? globalEarlyOut?.isEnabled ?? false,
        allowedDurationMinutes: deptSettings?.attendance?.earlyOut?.allowedDurationMinutes ?? globalEarlyOut?.allowedDurationMinutes ?? 0,
        minimumDuration: deptSettings?.attendance?.earlyOut?.minimumDuration ?? globalEarlyOut?.minimumDuration ?? 0,
        deductionRanges: deptSettings?.attendance?.earlyOut?.deductionRanges?.length ? deptSettings.attendance.earlyOut.deductionRanges : (globalEarlyOut?.deductionRanges || []),
      },
    };
    
    return resolved;
  } catch (error) {
    console.error('Error getting resolved attendance settings:', error);
    return null;
  }
}

/**
 * @desc    Get department settings
 * @route   GET /api/departments/:deptId/settings
 * @access  Private
 */
exports.getDepartmentSettings = async (req, res) => {
  try {
    const { deptId } = req.params;

    // Verify department exists
    const department = await Department.findById(deptId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Get or create settings
    let settings = await DepartmentSettings.findOne({ department: deptId });

    if (!settings) {
      // Create default settings
      settings = new DepartmentSettings({
        department: deptId,
        createdBy: req.user?._id,
      });
      await settings.save();
    }

    await settings.populate('department', 'name code');
    await settings.populate('createdBy', 'name email');
    await settings.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching department settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching department settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Update department settings
 * @route   PUT /api/departments/:deptId/settings
 * @access  Private
 */
exports.updateDepartmentSettings = async (req, res) => {
  try {
    const { deptId } = req.params;
    const { leaves, loans, salaryAdvance, permissions, ot, attendance, payroll } = req.body;

    // Verify department exists
    const department = await Department.findById(deptId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    // Get or create settings
    let settings = await DepartmentSettings.findOne({ department: deptId });

    if (!settings) {
      settings = new DepartmentSettings({
        department: deptId,
        createdBy: req.user._id,
      });
    }

    // Update settings
    if (leaves) {
      if (leaves.leavesPerDay !== undefined) settings.leaves.leavesPerDay = leaves.leavesPerDay;
      if (leaves.paidLeavesCount !== undefined) settings.leaves.paidLeavesCount = leaves.paidLeavesCount;
      if (leaves.dailyLimit !== undefined) settings.leaves.dailyLimit = leaves.dailyLimit;
      if (leaves.monthlyLimit !== undefined) settings.leaves.monthlyLimit = leaves.monthlyLimit;
      settings.markModified('leaves');
    }

    if (loans) {
      Object.keys(loans).forEach(key => {
        if (loans[key] !== undefined) {
          settings.loans[key] = loans[key];
        }
      });
      settings.markModified('loans');
    }

    if (salaryAdvance) {
      Object.keys(salaryAdvance).forEach(key => {
        if (salaryAdvance[key] !== undefined) {
          settings.salaryAdvance[key] = salaryAdvance[key];
        }
      });
      settings.markModified('salaryAdvance');
    }

    if (permissions) {
      // Update basic permission settings
      if (permissions.perDayLimit !== undefined) settings.permissions.perDayLimit = permissions.perDayLimit;
      if (permissions.monthlyLimit !== undefined) settings.permissions.monthlyLimit = permissions.monthlyLimit;
      if (permissions.deductFromSalary !== undefined) settings.permissions.deductFromSalary = permissions.deductFromSalary;
      if (permissions.deductionAmount !== undefined) settings.permissions.deductionAmount = permissions.deductionAmount;
      
      // Update permission deduction rules
      if (permissions.deductionRules) {
        if (permissions.deductionRules.countThreshold !== undefined) {
          settings.permissions.deductionRules.countThreshold = permissions.deductionRules.countThreshold;
        }
        if (permissions.deductionRules.deductionType !== undefined) {
          settings.permissions.deductionRules.deductionType = permissions.deductionRules.deductionType;
        }
        if (permissions.deductionRules.deductionAmount !== undefined) {
          settings.permissions.deductionRules.deductionAmount = permissions.deductionRules.deductionAmount;
        }
        if (permissions.deductionRules.minimumDuration !== undefined) {
          settings.permissions.deductionRules.minimumDuration = permissions.deductionRules.minimumDuration;
        }
        if (permissions.deductionRules.calculationMode !== undefined) {
          settings.permissions.deductionRules.calculationMode = permissions.deductionRules.calculationMode;
        }
      }
      settings.markModified('permissions');
    }

    if (ot) {
      Object.keys(ot).forEach(key => {
        if (ot[key] !== undefined) {
          settings.ot[key] = ot[key];
        }
      });
      settings.markModified('ot');
    }

    if (attendance) {
      // Update attendance deduction rules
      if (attendance.deductionRules) {
        if (attendance.deductionRules.combinedCountThreshold !== undefined) {
          settings.attendance.deductionRules.combinedCountThreshold = attendance.deductionRules.combinedCountThreshold;
        }
        if (attendance.deductionRules.deductionType !== undefined) {
          settings.attendance.deductionRules.deductionType = attendance.deductionRules.deductionType;
        }
        if (attendance.deductionRules.deductionAmount !== undefined) {
          settings.attendance.deductionRules.deductionAmount = attendance.deductionRules.deductionAmount;
        }
        if (attendance.deductionRules.minimumDuration !== undefined) {
          settings.attendance.deductionRules.minimumDuration = attendance.deductionRules.minimumDuration;
        }
        if (attendance.deductionRules.calculationMode !== undefined) {
          settings.attendance.deductionRules.calculationMode = attendance.deductionRules.calculationMode;
        }
      }

      // Update early-out settings
      if (attendance.earlyOut) {
        if (attendance.earlyOut.isEnabled !== undefined) settings.attendance.earlyOut.isEnabled = attendance.earlyOut.isEnabled;
        if (attendance.earlyOut.allowedDurationMinutes !== undefined) settings.attendance.earlyOut.allowedDurationMinutes = attendance.earlyOut.allowedDurationMinutes;
        if (attendance.earlyOut.minimumDuration !== undefined) settings.attendance.earlyOut.minimumDuration = attendance.earlyOut.minimumDuration;
        if (attendance.earlyOut.deductionRanges !== undefined) settings.attendance.earlyOut.deductionRanges = attendance.earlyOut.deductionRanges;
      }

      settings.markModified('attendance');
    }

    if (payroll) {
      if (payroll.includeMissingEmployeeComponents !== undefined) {
        settings.payroll.includeMissingEmployeeComponents = payroll.includeMissingEmployeeComponents;
      }
      settings.markModified('payroll');
    }

    settings.updatedBy = req.user._id;
    await settings.save();

    await settings.populate('department', 'name code');
    await settings.populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Department settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating department settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating department settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Get resolved settings (department + global fallback)
 * @route   GET /api/departments/:deptId/settings/resolved
 * @access  Private
 */
exports.getResolvedSettings = async (req, res) => {
  try {
    const { deptId } = req.params;
    const { type } = req.query; // 'leaves', 'loans', 'salary_advance', 'permissions', or 'all'

    // Verify department exists
    const department = await Department.findById(deptId);
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found',
      });
    }

    const resolved = {};

    if (!type || type === 'all' || type === 'leaves') {
      resolved.leaves = await getResolvedLeaveSettings(deptId);
    }

    if (!type || type === 'all' || type === 'loans') {
      resolved.loans = await getResolvedLoanSettings(deptId, 'loan');
    }

    if (!type || type === 'all' || type === 'salary_advance') {
      resolved.salaryAdvance = await getResolvedLoanSettings(deptId, 'salary_advance');
    }

    if (!type || type === 'all' || type === 'permissions') {
      resolved.permissions = await getResolvedPermissionSettings(deptId);
    }

    if (!type || type === 'all' || type === 'ot' || type === 'overtime') {
      resolved.ot = await getResolvedOTSettings(deptId);
    }

  if (!type || type === 'all' || type === 'payroll') {
    const deptSettings = await DepartmentSettings.findOne({ department: deptId });
    const globalIncludeMissingSetting = await Settings.findOne({ key: 'include_missing_employee_components' });
    const includeMissingGlobal =
      globalIncludeMissingSetting && globalIncludeMissingSetting.value !== undefined && globalIncludeMissingSetting.value !== null
        ? !!globalIncludeMissingSetting.value
        : true;
    resolved.payroll = {
      includeMissingEmployeeComponents:
        deptSettings?.payroll?.includeMissingEmployeeComponents !== undefined &&
        deptSettings?.payroll?.includeMissingEmployeeComponents !== null
          ? deptSettings.payroll.includeMissingEmployeeComponents
          : includeMissingGlobal,
    };
  }

    res.status(200).json({
      success: true,
      data: resolved,
    });
  } catch (error) {
    console.error('Error getting resolved settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting resolved settings',
      error: error.message,
    });
  }
};

// Export helper functions for use in other modules
exports.getResolvedLeaveSettings = getResolvedLeaveSettings;
exports.getResolvedLoanSettings = getResolvedLoanSettings;
exports.getResolvedPermissionSettings = getResolvedPermissionSettings;
exports.getResolvedOTSettings = getResolvedOTSettings;
exports.getResolvedAttendanceSettings = getResolvedAttendanceSettings;

