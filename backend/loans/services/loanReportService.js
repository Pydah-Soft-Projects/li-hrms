const mongoose = require('mongoose');
const dayjs = require('dayjs');
const Loan = require('../model/Loan');
const Employee = require('../../employees/model/Employee');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const EmployeeGroup = require('../../employees/model/EmployeeGroup');
const PayrollRecord = require('../../payroll/model/PayrollRecord');
const {
  getPresentPayPeriod,
  addCalendarMonthsToYm,
} = require('../../shared/utils/dateUtils');
const { calculateTotalEMI } = require('../../payroll/services/loanAdvanceService');

const toObjectId = (id) => {
  if (!id) return null;
  try {
    if (mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id.toString());
    }
  } catch (e) {
    /* ignore */
  }
  return null;
};

const parseIdList = (raw) =>
  String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter((id) => id && id !== 'all');

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function buildStatusFilter(status) {
  if (!status || status === 'all') return {};
  if (status === 'active') return { status: { $in: ['active', 'disbursed'] } };
  return { status };
}

async function resolveScopedEmployeeIds(filters = {}, scopeFilter = {}) {
  const groupIds = parseIdList(filters.employeeGroupId);
  if (groupIds.length === 0) return null;

  const empQuery = { ...(scopeFilter || {}) };
  empQuery.employee_group_id = { $in: groupIds.map(toObjectId).filter(Boolean) };

  const designationIds = parseIdList(filters.designationId);
  if (designationIds.length > 0) {
    empQuery.designation_id = { $in: designationIds.map(toObjectId).filter(Boolean) };
  }

  const employees = await Employee.find(empQuery).select('_id').lean();
  return employees.map((e) => e._id);
}

async function buildLoanQuery(filters = {}, scopeFilter = {}) {
  const query = { isActive: true, ...(scopeFilter || {}) };

  if (filters.requestType) query.requestType = filters.requestType;

  const statusPart = buildStatusFilter(filters.status);
  if (statusPart.status) {
    query.status = statusPart.status;
  } else if (!filters.status) {
    query.status = { $in: ['disbursed', 'active', 'completed'] };
  }

  const employeeIds = parseIdList(filters.employeeId);
  if (employeeIds.length > 0) {
    query.employeeId = { $in: employeeIds.map(toObjectId).filter(Boolean) };
  } else {
    const deptIds = parseIdList(filters.departmentId);
    if (deptIds.length > 0) {
      query.department = { $in: deptIds.map(toObjectId).filter(Boolean) };
    } else {
      const divIds = parseIdList(filters.divisionId);
      if (divIds.length > 0) {
        query.division_id = { $in: divIds.map(toObjectId).filter(Boolean) };
      }
    }

    const designationIds = parseIdList(filters.designationId);
    if (designationIds.length > 0) {
      query.designation = { $in: designationIds.map(toObjectId).filter(Boolean) };
    }

    const groupEmpIds = await resolveScopedEmployeeIds(filters, scopeFilter);
    if (groupEmpIds) {
      if (groupEmpIds.length === 0) {
        query._id = { $in: [] };
      } else {
        query.employeeId = { $in: groupEmpIds };
      }
    }
  }

  return query;
}

function periodDateFilter(startDate, endDate) {
  if (!startDate || !endDate) return null;
  const start = dayjs(startDate).startOf('day').toDate();
  const end = dayjs(endDate).endOf('day').toDate();
  return { start, end };
}

async function computeLifetimeStats(query, requestType) {
  const [agg] = await Loan.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalDistributed: { $sum: '$amount' },
        totalRecovered: { $sum: '$repayment.totalPaid' },
        totalOutstanding: { $sum: '$repayment.remainingBalance' },
        totalInterest: { $sum: '$loanConfig.totalInterest' },
        activeCount: {
          $sum: {
            $cond: [{ $in: ['$status', ['active', 'disbursed']] }, 1, 0],
          },
        },
        completedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        totalCount: { $sum: 1 },
      },
    },
  ]);

  const stats = agg || {
    totalDistributed: 0,
    totalRecovered: 0,
    totalOutstanding: 0,
    totalInterest: 0,
    activeCount: 0,
    completedCount: 0,
    totalCount: 0,
  };

  const activeInterestAgg = await Loan.aggregate([
    {
      $match: {
        ...query,
        status: { $in: ['active', 'disbursed'] },
        'repayment.remainingBalance': { $gt: 0 },
      },
    },
    {
      $group: {
        _id: null,
        activeOutstandingInterest: {
          $sum: {
            $cond: [
              { $gt: ['$loanConfig.totalAmount', 0] },
              {
                $multiply: [
                  '$loanConfig.totalInterest',
                  { $divide: ['$repayment.remainingBalance', '$loanConfig.totalAmount'] },
                ],
              },
              0,
            ],
          },
        },
        activePrincipal: { $sum: '$repayment.remainingBalance' },
      },
    },
  ]);

  stats.activeOutstandingInterest = round2(activeInterestAgg[0]?.activeOutstandingInterest || 0);
  stats.activePrincipal = round2(activeInterestAgg[0]?.activePrincipal || 0);

  return stats;
}

async function computePeriodStats(query, startDate, endDate) {
  const range = periodDateFilter(startDate, endDate);
  if (!range) {
    return {
      approvedCount: 0,
      disbursedCount: 0,
      disbursedAmount: 0,
      recoveredInPeriod: 0,
    };
  }

  const periodBase = {
    ...query,
    $or: [
      { 'disbursement.disbursedAt': { $gte: range.start, $lte: range.end } },
      {
        'approvals.final.approvedAt': { $gte: range.start, $lte: range.end },
        status: { $nin: ['rejected', 'cancelled', 'pending'] },
      },
    ],
  };

  const [disbursedAgg, approvedAgg, recoveryAgg] = await Promise.all([
    Loan.aggregate([
      {
        $match: {
          ...query,
          'disbursement.disbursedAt': { $gte: range.start, $lte: range.end },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
        },
      },
    ]),
    Loan.aggregate([
      {
        $match: {
          ...query,
          'approvals.final.status': 'approved',
          'approvals.final.approvedAt': { $gte: range.start, $lte: range.end },
        },
      },
      { $group: { _id: null, count: { $sum: 1 } } },
    ]),
    Loan.aggregate([
      { $match: query },
      { $unwind: '$transactions' },
      {
        $match: {
          'transactions.transactionDate': { $gte: range.start, $lte: range.end },
          'transactions.transactionType': { $in: ['emi_payment', 'advance_deduction'] },
        },
      },
      { $group: { _id: null, recovered: { $sum: '$transactions.amount' } } },
    ]),
  ]);

  return {
    approvedCount: approvedAgg[0]?.count || 0,
    disbursedCount: disbursedAgg[0]?.count || 0,
    disbursedAmount: round2(disbursedAgg[0]?.amount || 0),
    recoveredInPeriod: round2(recoveryAgg[0]?.recovered || 0),
    periodLoanCount: disbursedAgg[0]?.count || 0,
  };
}

async function computePersonalStats(employeeId, query, startDate, endDate, requestType) {
  if (!employeeId) return null;

  const empObjectId = toObjectId(employeeId);
  const personalQuery = { ...query, employeeId: empObjectId };

  const lifetime = await computeLifetimeStats(personalQuery, requestType);
  const period = await computePeriodStats(personalQuery, startDate, endDate);

  const present = await getPresentPayPeriod();
  const currentPayMonth = present.payrollMonthKey;

  let currentPeriodEmi = 0;
  let currentPeriodAdvance = 0;

  if (!requestType || requestType === 'loan') {
    const emi = await calculateTotalEMI(employeeId, currentPayMonth);
    currentPeriodEmi = emi.totalEMI || 0;
  }
  if (!requestType || requestType === 'salary_advance') {
    const advances = await Loan.find({
      employeeId: empObjectId,
      requestType: 'salary_advance',
      status: { $in: ['active', 'disbursed'] },
      'repayment.remainingBalance': { $gt: 0 },
    }).lean();
    for (const advDoc of advances) {
      const perCycle =
        advDoc.advanceConfig?.deductionPerCycle || advDoc.repayment?.remainingBalance || 0;
      currentPeriodAdvance += perCycle;
    }
    currentPeriodAdvance = round2(currentPeriodAdvance);
  }

  const interestPaidAgg = await Loan.aggregate([
    { $match: personalQuery },
    {
      $group: {
        _id: null,
        totalInterestOnLoans: { $sum: '$loanConfig.totalInterest' },
        interestPaid: {
          $sum: {
            $cond: [
              { $gt: ['$loanConfig.totalAmount', 0] },
              {
                $multiply: [
                  '$loanConfig.totalInterest',
                  { $divide: ['$repayment.totalPaid', '$loanConfig.totalAmount'] },
                ],
              },
              0,
            ],
          },
        },
      },
    },
  ]);

  return {
    ...lifetime,
    period,
    currentPeriodEmi: round2(currentPeriodEmi),
    currentPeriodAdvanceDue: round2(currentPeriodAdvance),
    totalInterestOnLoans: round2(interestPaidAgg[0]?.totalInterestOnLoans || 0),
    interestPaid: round2(interestPaidAgg[0]?.interestPaid || 0),
    payPeriodMonth: currentPayMonth,
  };
}

async function loadGroupNameMap(groupBy, groupIds) {
  const nameMap = new Map();
  if (!groupIds.length) return nameMap;

  if (groupBy === 'division') {
    const docs = await Division.find({ _id: { $in: groupIds } }).select('name').lean();
    docs.forEach((d) => nameMap.set(String(d._id), d.name));
  } else if (groupBy === 'department') {
    const docs = await Department.find({ _id: { $in: groupIds } }).select('name').lean();
    docs.forEach((d) => nameMap.set(String(d._id), d.name));
  } else if (groupBy === 'designation') {
    const docs = await Designation.find({ _id: { $in: groupIds } }).select('name').lean();
    docs.forEach((d) => nameMap.set(String(d._id), d.name));
  } else if (groupBy === 'employee_group') {
    const docs = await EmployeeGroup.find({ _id: { $in: groupIds } }).select('name').lean();
    docs.forEach((d) => nameMap.set(String(d._id), d.name));
  } else if (groupBy === 'employee') {
    const docs = await Employee.find({ _id: { $in: groupIds } })
      .select('employee_name emp_no')
      .lean();
    docs.forEach((e) => nameMap.set(String(e._id), `${e.employee_name} (${e.emp_no})`));
  }

  return nameMap;
}

async function computeGroupedSummaries(query, groupBy) {
  const validGroups = ['division', 'department', 'designation', 'employee_group', 'employee'];
  if (!validGroups.includes(groupBy)) return [];

  let pipeline = [{ $match: query }];

  if (groupBy === 'employee_group') {
    pipeline.push(
      {
        $lookup: {
          from: 'employees',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'empDoc',
        },
      },
      { $unwind: { path: '$empDoc', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$empDoc.employee_group_id',
          distributed: { $sum: '$amount' },
          recovered: { $sum: '$repayment.totalPaid' },
          outstanding: { $sum: '$repayment.remainingBalance' },
          interest: { $sum: '$loanConfig.totalInterest' },
          activeCount: {
            $sum: { $cond: [{ $in: ['$status', ['active', 'disbursed']] }, 1, 0] },
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          count: { $sum: 1 },
        },
      }
    );
  } else {
    const groupField =
      groupBy === 'division'
        ? '$division_id'
        : groupBy === 'department'
          ? '$department'
          : groupBy === 'designation'
            ? '$designation'
            : '$employeeId';

    pipeline.push({
      $group: {
        _id: groupField,
        distributed: { $sum: '$amount' },
        recovered: { $sum: '$repayment.totalPaid' },
        outstanding: { $sum: '$repayment.remainingBalance' },
        interest: { $sum: '$loanConfig.totalInterest' },
        activeCount: {
          $sum: { $cond: [{ $in: ['$status', ['active', 'disbursed']] }, 1, 0] },
        },
        completedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        count: { $sum: 1 },
      },
    });
  }

  pipeline.push({ $match: { count: { $gt: 0 }, _id: { $ne: null } } });

  const grouped = await Loan.aggregate(pipeline);
  const groupIds = grouped.map((g) => g._id).filter(Boolean);
  const nameMap = await loadGroupNameMap(groupBy, groupIds);

  return grouped
    .map((g) => ({
      id: String(g._id),
      name: nameMap.get(String(g._id)) || 'Unknown',
      distributed: round2(g.distributed),
      recovered: round2(g.recovered),
      outstanding: round2(g.outstanding),
      interest: round2(g.interest),
      activeCount: g.activeCount || 0,
      completedCount: g.completedCount || 0,
      count: g.count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getEmployeeIdsFromLoanQuery(query) {
  const ids = await Loan.distinct('employeeId', query);
  return ids.filter(Boolean);
}

async function sumAdvanceDueForEmployee(empId) {
  const advances = await Loan.find({
    employeeId: empId,
    requestType: 'salary_advance',
    status: { $in: ['active', 'disbursed'] },
    'repayment.remainingBalance': { $gt: 0 },
  }).lean();

  let due = 0;
  for (const adv of advances) {
    due += adv.advanceConfig?.deductionPerCycle || adv.repayment?.remainingBalance || 0;
  }
  return due;
}

async function computeCurrentPeriodEmiDue(employeeIds, requestType, payMonth) {
  let totalEmiDue = 0;
  let totalAdvanceDue = 0;
  let employeeCount = 0;

  const isLoan = !requestType || requestType === 'loan';
  const isAdvance = !requestType || requestType === 'salary_advance';

  for (const empId of employeeIds) {
    let emiPart = 0;
    let advPart = 0;

    if (isLoan) {
      const emi = await calculateTotalEMI(String(empId), payMonth);
      emiPart = emi.totalEMI || 0;
    }
    if (isAdvance) {
      advPart = await sumAdvanceDueForEmployee(empId);
    }

    if (emiPart > 0 || advPart > 0) {
      employeeCount += 1;
      totalEmiDue += emiPart;
      totalAdvanceDue += advPart;
    }
  }

  return {
    totalEmiDue: round2(totalEmiDue),
    totalAdvanceDue: round2(totalAdvanceDue),
    totalDue: round2(totalEmiDue + totalAdvanceDue),
    employeeCount,
    payPeriodMonth: payMonth,
  };
}

async function computeLastPeriodRecovery(employeeIds, requestType, lastPayMonth) {
  if (!employeeIds.length || !lastPayMonth) {
    return {
      scheduledEmi: 0,
      recoveredEmi: 0,
      scheduledAdvance: 0,
      recoveredAdvance: 0,
      shortfallTotal: 0,
      underpaidEmployees: [],
      payPeriodMonth: lastPayMonth,
    };
  }

  const payrollMatch = {
    employeeId: { $in: employeeIds },
    month: lastPayMonth,
    status: { $in: ['calculated', 'approved', 'processed'] },
  };

  const records = await PayrollRecord.find(payrollMatch)
    .populate('employeeId', 'employee_name emp_no')
    .select('employeeId emp_no loanAdvance month')
    .lean();

  let scheduledEmi = 0;
  let recoveredEmi = 0;
  let scheduledAdvance = 0;
  let recoveredAdvance = 0;
  const underpaidEmployees = [];

  for (const rec of records) {
    const la = rec.loanAdvance || {};
    const schedEmi = Number(la.scheduledTotalEMI) || 0;
    const actualEmi = Number(la.totalEMI) || 0;
    const schedAdv = Number(la.scheduledAdvanceDeduction) || Number(la.totalAdvanceBalance) || 0;
    const actualAdv = Number(la.advanceDeduction) || 0;

    const includeLoan = !requestType || requestType === 'loan';
    const includeAdv = !requestType || requestType === 'salary_advance';

    const emiSched = includeLoan ? schedEmi || actualEmi : 0;
    const emiRec = includeLoan ? actualEmi : 0;
    const advSched = includeAdv ? schedAdv || actualAdv : 0;
    const advRec = includeAdv ? actualAdv : 0;

    if (emiSched === 0 && emiRec === 0 && advSched === 0 && advRec === 0) continue;

    scheduledEmi += emiSched;
    recoveredEmi += emiRec;
    scheduledAdvance += advSched;
    recoveredAdvance += advRec;

    const shortfall = round2(Math.max(0, emiSched - emiRec) + Math.max(0, advSched - advRec));
    if (shortfall > 0.01) {
      underpaidEmployees.push({
        employeeId: rec.employeeId?._id || rec.employeeId,
        emp_no: rec.emp_no,
        employee_name: rec.employeeId?.employee_name || 'N/A',
        scheduledEmi: round2(emiSched),
        recoveredEmi: round2(emiRec),
        scheduledAdvance: round2(advSched),
        recoveredAdvance: round2(advRec),
        shortfall,
      });
    }
  }

  const shortfallTotal = round2(
    Math.max(0, scheduledEmi - recoveredEmi) + Math.max(0, scheduledAdvance - recoveredAdvance)
  );

  return {
    scheduledEmi: round2(scheduledEmi),
    recoveredEmi: round2(recoveredEmi),
    scheduledAdvance: round2(scheduledAdvance),
    recoveredAdvance: round2(recoveredAdvance),
    shortfallTotal,
    underpaidEmployees: underpaidEmployees.sort((a, b) => b.shortfall - a.shortfall),
    payPeriodMonth: lastPayMonth,
  };
}

async function fetchLoanRecords(query, { page = 1, limit = 50, startDate, endDate } = {}) {
  let listQuery = { ...query };
  const range = periodDateFilter(startDate, endDate);
  if (range) {
    listQuery = {
      ...listQuery,
      $or: [
        { 'disbursement.disbursedAt': { $gte: range.start, $lte: range.end } },
        {
          appliedAt: { $gte: range.start, $lte: range.end },
          status: { $nin: ['rejected', 'cancelled'] },
        },
      ],
    };
  }

  const skip = (page - 1) * limit;
  const [loans, total] = await Promise.all([
    Loan.find(listQuery)
      .populate('employeeId', 'employee_name emp_no profilePhoto department_id designation_id division_id leftDate')
      .populate('department', 'name')
      .populate('division_id', 'name')
      .populate('designation', 'name')
      .sort({ appliedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Loan.countDocuments(listQuery),
  ]);

  return { loans, total, page, totalPages: Math.ceil(total / limit) || 1 };
}

async function buildLoanReport(filters = {}, scopeFilter = {}) {
  const query = await buildLoanQuery(filters, scopeFilter);
  const { startDate, endDate, groupBy, employeeId } = filters;

  const [stats, periodStats, summaries, employeeIds] = await Promise.all([
    computeLifetimeStats(query, filters.requestType),
    computePeriodStats(query, startDate, endDate),
    groupBy ? computeGroupedSummaries(query, groupBy) : Promise.resolve([]),
    getEmployeeIdsFromLoanQuery(query),
  ]);

  const present = await getPresentPayPeriod();
  const currentPayMonth = present.payrollMonthKey;
  const lastPayMonth = addCalendarMonthsToYm(currentPayMonth, -1);

  const [currentPeriod, lastPeriod, personalStats] = await Promise.all([
    computeCurrentPeriodEmiDue(employeeIds, filters.requestType, currentPayMonth),
    computeLastPeriodRecovery(employeeIds, filters.requestType, lastPayMonth),
    employeeId && parseIdList(employeeId).length === 1
      ? computePersonalStats(parseIdList(employeeId)[0], query, startDate, endDate, filters.requestType)
      : Promise.resolve(null),
  ]);

  const page = parseInt(filters.page, 10) || 1;
  const limit = parseInt(filters.limit, 10) || 50;
  const { loans, total, totalPages } = await fetchLoanRecords(query, {
    page,
    limit,
    startDate,
    endDate,
  });

  return {
    stats,
    periodStats,
    summaries,
    personalStats,
    payPeriod: {
      current: currentPeriod,
      last: lastPeriod,
      currentPayMonth,
      lastPayMonth,
    },
    data: loans,
    total,
    page,
    totalPages,
  };
}

function loanToExportRow(loan, index) {
  return {
    'S.No': index + 1,
    'Emp No': loan.employeeId?.emp_no || loan.emp_no,
    'Employee Name': loan.employeeId?.employee_name || 'N/A',
    Division: loan.division_id?.name || 'N/A',
    Department: loan.department?.name || 'N/A',
    Designation: loan.designation?.name || 'N/A',
    Type: loan.requestType === 'loan' ? 'Loan' : 'Salary Advance',
    Amount: loan.amount,
    Recovered: loan.repayment?.totalPaid || 0,
    Outstanding: loan.repayment?.remainingBalance || 0,
    Interest: loan.loanConfig?.totalInterest || 0,
    'Total Payable': (loan.amount || 0) + (loan.loanConfig?.totalInterest || 0),
    Status: loan.status,
    'Applied Date': loan.appliedAt ? dayjs(loan.appliedAt).format('DD-MMM-YYYY') : 'N/A',
    'Disbursed Date': loan.disbursement?.disbursedAt
      ? dayjs(loan.disbursement.disbursedAt).format('DD-MMM-YYYY')
      : 'N/A',
  };
}

function summaryToExportRow(item, index) {
  return {
    'S.No': index + 1,
    Name: item.name,
    Distributed: item.distributed,
    Recovered: item.recovered,
    Outstanding: item.outstanding,
    Interest: item.interest,
    Active: item.activeCount,
    Completed: item.completedCount,
    'Total Count': item.count,
  };
}

module.exports = {
  buildLoanQuery,
  buildLoanReport,
  computeGroupedSummaries,
  computeLifetimeStats,
  computePeriodStats,
  fetchLoanRecords,
  loanToExportRow,
  summaryToExportRow,
  round2,
};
