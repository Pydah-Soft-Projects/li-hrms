/**
 * Guarantor eligibility, employee loan exposure, and attendance summary for loan applications.
 */

const Loan = require('../model/Loan');
const Employee = require('../../employees/model/Employee');
const MonthlyAttendanceSummary = require('../../attendance/model/MonthlyAttendanceSummary');

const RUNNING_LOAN_STATUSES = ['approved', 'disbursed', 'active'];
const CLOSED_LOAN_STATUSES = ['completed'];

const DEFAULT_GUARANTOR_RULES = {
  collectionTiming: 'on_workflow_stage', // 'on_application' | 'on_workflow_stage'
  minGuarantors: 2,
  maxGuarantors: 4,
  maxGuaranteePercentOfSalary: 60,
  includeOwnEmi: true,
  includeGuaranteedEmi: true,
  minServicePeriodMonths: 0,
  minSalary: 0,
  sameDivisionOnly: true,
  sameDepartmentOnly: false,
  activeEmployeeOnly: true,
  eligibleDepartments: [],
  eligibleDesignations: [],
  countPendingGuarantees: false,
};

function getGuarantorRulesFromSettings(settingsDoc) {
  const raw = settingsDoc?.guarantorRules || settingsDoc?.settings?.guarantorRules || {};
  return { ...DEFAULT_GUARANTOR_RULES, ...raw };
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function getLoanEmiAmount(loan) {
  if (!loan) return 0;
  if (loan.requestType === 'salary_advance') {
    return Number(loan.advanceConfig?.deductionPerCycle || 0);
  }
  if (loan.requestType !== 'loan') return 0;
  return Number(loan.loanConfig?.emiAmount || loan.repayment?.emiAmount || 0);
}

function getLoanOutstanding(loan) {
  const remaining = loan?.repayment?.remainingBalance;
  if (remaining != null && !Number.isNaN(Number(remaining))) return Math.max(0, Number(remaining));
  if (loan?.requestType === 'loan') {
    return Math.max(0, Number(loan.loanConfig?.totalAmount || loan.amount || 0) - Number(loan.repayment?.totalPaid || 0));
  }
  return Math.max(0, Number(loan.amount || 0) - Number(loan.repayment?.totalPaid || 0));
}

function mapLoanExposureRow(loan, role) {
  const outstanding = getLoanOutstanding(loan);
  const emi = getLoanEmiAmount(loan);
  const isRunning = RUNNING_LOAN_STATUSES.includes(loan.status) || loan.status === 'active';

  // Detailed exposure fields to match active loans table
  const totalAmount = loan.requestType === 'loan' ? (loan.loanConfig?.totalAmount || loan.amount || 0) : (loan.amount || 0);
  const interest = loan.requestType === 'loan' ? (loan.loanConfig?.totalInterest || 0) : 0;
  const paidMonths = loan.repayment?.installmentsPaid || 0;
  const paidAmount = loan.repayment?.totalPaid || 0;
  const unpaidAmount = loan.repayment?.remainingBalance !== undefined ? loan.repayment.remainingBalance : outstanding;
  const totalMonths = loan.requestType === 'loan' ? (loan.loanConfig?.totalInstallments || loan.duration || 0) : (loan.duration || 1);
  const reason = loan.reason || '';

  return {
    loanId: String(loan._id),
    applicationFormNumber: loan.applicationFormNumber || null,
    requestType: loan.requestType,
    role,
    borrowerName: loan.employeeId?.employee_name || loan.emp_no || null,
    borrowerEmpNo: loan.emp_no || loan.employeeId?.emp_no || null,
    amount: Number(loan.amount || 0),
    emi,
    outstanding,
    status: loan.status,
    isRunning: RUNNING_LOAN_STATUSES.includes(loan.status),
    isClosed: CLOSED_LOAN_STATUSES.includes(loan.status),
    guarantorStatus: role === 'guarantor' ? loan._guarantorStatus || null : null,
    appliedAt: loan.appliedAt || loan.createdAt,
    disbursedAt: loan.disbursement?.disbursedAt || null,

    // Detailed metrics
    totalAmount,
    interest,
    paidMonths,
    paidAmount,
    unpaidAmount,
    totalMonths,
    reason,
  };
}

/**
 * Own running/closed loans + loans where employee is guarantor.
 */
async function computeEmployeeLoanExposure(employeeId, { excludeLoanId } = {}) {
  if (!employeeId) {
    return {
      ownLoans: [],
      guaranteedLoans: [],
      totals: {
        ownOutstanding: 0,
        guaranteedOutstanding: 0,
        totalLiability: 0,
        ownEmi: 0,
        guaranteedEmi: 0,
        totalMonthlyExposure: 0,
        runningOwnCount: 0,
        runningGuaranteedCount: 0,
      },
    };
  }

  const empIdStr = String(employeeId);
  const excludeFilter = excludeLoanId ? { _id: { $ne: excludeLoanId } } : {};

  const ownLoansRaw = await Loan.find({
    employeeId,
    isActive: true,
    status: { $nin: ['cancelled', 'rejected', 'draft'] },
    ...excludeFilter,
  })
    .populate('employeeId', 'employee_name emp_no')
    .sort({ appliedAt: -1 })
    .lean();

  const guaranteedLoansRaw = await Loan.find({
    isActive: true,
    requestType: { $in: ['loan', 'salary_advance'] },
    status: { $nin: ['cancelled', 'rejected', 'draft'] },
    'guarantors.employeeId': employeeId,
    ...excludeFilter,
  })
    .populate('employeeId', 'employee_name emp_no')
    .sort({ appliedAt: -1 })
    .lean();

  const ownLoans = ownLoansRaw.map((l) => mapLoanExposureRow(l, 'borrower'));
  const guaranteedLoans = guaranteedLoansRaw
    .map((loan) => {
      const g = (loan.guarantors || []).find((x) => String(x.employeeId) === empIdStr);
      return mapLoanExposureRow({ ...loan, _guarantorStatus: g?.status || null }, 'guarantor');
    })
    .filter((row) => row.guarantorStatus === 'accepted' || RUNNING_LOAN_STATUSES.includes(row.status) || row.status === 'pending' || row.status?.includes('approved'));

  const runningOwn = ownLoans.filter((l) => l.isRunning);
  const runningGuaranteed = guaranteedLoans.filter((l) => l.isRunning && l.guarantorStatus === 'accepted');

  const ownOutstanding = round2(runningOwn.reduce((s, l) => s + l.outstanding, 0));
  const guaranteedOutstanding = round2(runningGuaranteed.reduce((s, l) => s + l.outstanding, 0));
  const ownEmi = round2(runningOwn.reduce((s, l) => s + l.emi, 0));
  const guaranteedEmi = round2(runningGuaranteed.reduce((s, l) => s + l.emi, 0));

  return {
    ownLoans,
    guaranteedLoans,
    totals: {
      ownOutstanding,
      guaranteedOutstanding,
      totalLiability: round2(ownOutstanding + guaranteedOutstanding),
      ownEmi,
      guaranteedEmi,
      totalMonthlyExposure: round2(ownEmi + guaranteedEmi),
      runningOwnCount: runningOwn.length,
      runningGuaranteedCount: runningGuaranteed.length,
    },
  };
}

function monthsBackKeys(count, fromDate = new Date()) {
  const keys = [];
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

async function getAttendanceSummaryLast6Months(employeeId, empNo) {
  const monthKeys = monthsBackKeys(6);
  const summaries = await MonthlyAttendanceSummary.find({
    employeeId,
    month: { $in: monthKeys },
  })
    .select('month monthName totalDaysInMonth totalPresentDays totalLeaves totalLopLeaves totalPayableShifts')
    .lean();

  const byMonth = new Map(summaries.map((s) => [s.month, s]));
  const rows = monthKeys.map((month) => {
    const s = byMonth.get(month);
    const workingDays = s?.totalDaysInMonth ?? 0;
    const present = s?.totalPresentDays ?? 0;
    const leave = s?.totalLeaves ?? 0;
    const lop = s?.totalLopLeaves ?? 0;
    const attendancePercent = workingDays > 0 ? round2((present / workingDays) * 100) : null;
    return {
      month,
      monthName: s?.monthName || month,
      workingDays,
      present,
      leave,
      lop,
      attendancePercent,
    };
  });

  const withData = rows.filter((r) => r.workingDays > 0);
  const totalWorking = withData.reduce((s, r) => s + r.workingDays, 0);
  const totalPresent = withData.reduce((s, r) => s + r.present, 0);
  const overallPercentage = totalWorking > 0 ? round2((totalPresent / totalWorking) * 100) : null;

  return {
    last6Months: rows,
    overallPercentage,
    totalWorkingDays: totalWorking,
    totalPresentDays: totalPresent,
    empNo: empNo || null,
  };
}

async function computeGuarantorFinancials(employeeId, rules, { excludeLoanId } = {}) {
  const employee = await Employee.findById(employeeId).select('gross_salary date_of_joining is_active department_id designation_id division_id').lean();
  if (!employee) {
    return { eligible: false, reason: 'Employee not found', salary: 0, ownEmi: 0, guaranteedEmi: 0, availableSalary: 0, exposurePercent: 0 };
  }

  const exposure = await computeEmployeeLoanExposure(employeeId, { excludeLoanId });
  const salary = Number(employee.gross_salary || 0);
  const ownEmi = rules.includeOwnEmi !== false ? exposure.totals.ownEmi : 0;
  const guaranteedEmi = rules.includeGuaranteedEmi !== false ? exposure.totals.guaranteedEmi : 0;
  const totalEmi = ownEmi + guaranteedEmi;
  const availableSalary = Math.max(0, salary - totalEmi);
  const exposurePercent = salary > 0 ? round2((totalEmi / salary) * 100) : 0;

  return {
    salary,
    ownEmi,
    guaranteedEmi,
    totalEmi,
    availableSalary,
    exposurePercent,
    exposure,
    employee,
  };
}

function validateGuarantorEligibility(financials, rules) {
  const { employee, salary, totalEmi, exposurePercent, exposure } = financials;
  const reasons = [];

  if (rules.activeEmployeeOnly !== false && employee?.is_active === false) {
    reasons.push('Employee is not active');
  }

  if (rules.minSalary > 0 && salary < rules.minSalary) {
    reasons.push(`Salary below minimum (₹${rules.minSalary})`);
  }

  if (rules.minServicePeriodMonths > 0 && employee?.date_of_joining) {
    const doj = new Date(employee.date_of_joining);
    const months =
      (new Date().getFullYear() - doj.getFullYear()) * 12 + (new Date().getMonth() - doj.getMonth());
    if (months < rules.minServicePeriodMonths) {
      reasons.push(`Minimum service period ${rules.minServicePeriodMonths} months not met`);
    }
  }

  if (Array.isArray(rules.eligibleDepartments) && rules.eligibleDepartments.length > 0) {
    const deptId = String(employee.department_id || '');
    if (!rules.eligibleDepartments.some((id) => String(id) === deptId)) {
      reasons.push('Department not eligible for guarantor');
    }
  }

  if (Array.isArray(rules.eligibleDesignations) && rules.eligibleDesignations.length > 0) {
    const desId = String(employee.designation_id || '');
    if (!rules.eligibleDesignations.some((id) => String(id) === desId)) {
      reasons.push('Designation not eligible for guarantor');
    }
  }

  const maxPct = rules.maxGuaranteePercentOfSalary ?? 60;
  if (salary > 0 && exposurePercent > maxPct) {
    reasons.push(`Guarantee limit exceeded (${exposurePercent}% > ${maxPct}% of salary)`);
  }

  return {
    eligible: reasons.length === 0,
    reasons,
    salary,
    ownEmi: financials.ownEmi,
    guaranteedEmi: financials.guaranteedEmi,
    totalEmi,
    availableSalary: financials.availableSalary,
    exposurePercent,
    runningGuaranteedCount: exposure.totals.runningGuaranteedCount,
  };
}

function normalizeGateApproverRole(role) {
  const r = String(role || '').trim();
  if (['hod', 'manager', 'hr', 'reporting_manager', 'final_authority'].includes(r)) return r;
  if (r === 'super_admin' || r === 'admin') return 'hr';
  return r;
}

function getWorkflowStepByRole(workflow, approverRole) {
  const steps = (workflow?.steps || []).filter((s) => s.isActive !== false);
  const want = normalizeGateApproverRole(approverRole);
  return (
    steps.find((s) => normalizeGateApproverRole(s.approverRole) === want) ||
    steps.find((s) => s.approverRole === approverRole) ||
    null
  );
}

function getGuarantorStageStep(workflow, guarantorRules) {
  const steps = (workflow?.steps || []).filter((s) => s.isActive !== false);
  const explicit = steps.find((s) => s.requireGuarantors === true);
  if (explicit) return explicit;
  if (guarantorRules?.guarantorStageStepOrder) {
    return steps.find((s) => s.stepOrder === guarantorRules.guarantorStageStepOrder) || null;
  }
  return null;
}

function isGuarantorCollectionAtApplication(guarantorRules) {
  return guarantorRules?.collectionTiming === 'on_application';
}

function areGuarantorsSatisfied(loan, guarantorRules) {
  if (!['loan', 'salary_advance'].includes(loan.requestType)) {
    return { satisfied: true, pending: [] };
  }
  const min = guarantorRules?.minGuarantors ?? 2;
  const guarantors = loan.guarantors || [];
  const accepted = guarantors.filter((g) => g.status === 'accepted');
  const pending = guarantors.filter((g) => g.status !== 'accepted');
  return {
    satisfied: guarantors.length >= min && pending.length === 0 && accepted.length >= min,
    acceptedCount: accepted.length,
    pendingCount: pending.length,
    minRequired: min,
    pending,
  };
}

function isGuarantorGateActive(loan, settings) {
  if (!['loan', 'salary_advance'].includes(loan.requestType)) return false;
  const guarantorRules = getGuarantorRulesFromSettings(settings);
  if (isGuarantorCollectionAtApplication(guarantorRules)) return false;
  const stageStep = getGuarantorStageStep(settings?.workflow, guarantorRules);
  if (!stageStep) return false;
  const current = loan.workflow?.nextApprover;
  if (!current) return false;
  return normalizeGateApproverRole(stageStep.approverRole) === normalizeGateApproverRole(current);
}

function mustBlockApprovalForGuarantors(loan, settings) {
  if (!isGuarantorGateActive(loan, settings)) return { block: false };
  const guarantorRules = getGuarantorRulesFromSettings(settings);
  const check = areGuarantorsSatisfied(loan, guarantorRules);
  if (check.satisfied) return { block: false };
  return {
    block: true,
    error: `Guarantors required before proceeding: need ${check.minRequired} accepted guarantor(s). Currently ${check.acceptedCount} accepted, ${check.pendingCount} pending.`,
    ...check,
  };
}

module.exports = {
  DEFAULT_GUARANTOR_RULES,
  RUNNING_LOAN_STATUSES,
  getGuarantorRulesFromSettings,
  computeEmployeeLoanExposure,
  getAttendanceSummaryLast6Months,
  computeGuarantorFinancials,
  validateGuarantorEligibility,
  getWorkflowStepByRole,
  getGuarantorStageStep,
  isGuarantorCollectionAtApplication,
  areGuarantorsSatisfied,
  isGuarantorGateActive,
  mustBlockApprovalForGuarantors,
  getLoanEmiAmount,
  getLoanOutstanding,
};
