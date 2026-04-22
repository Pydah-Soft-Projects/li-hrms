const mongoose = require('mongoose');
const PromotionTransferRequest = require('../model/PromotionTransferRequest');
const Employee = require('../../employees/model/Employee');
const EmployeeHistory = require('../../employees/model/EmployeeHistory');
const Division = require('../../departments/model/Division');
const Department = require('../../departments/model/Department');
const Designation = require('../../departments/model/Designation');
const { createISTDate, getPayrollDateRange, formatPayrollPeriodRangeEnIn } = require('../../shared/utils/dateUtils');
const { getPromotionPayrollContext, toLabel: ptToLabel, addMonths: ptAddMonths } = require('../services/promotionPayrollCycleContextService');
const { createDirectArrearForApprovedPromotion } = require('../services/promotionArrearService');
const { notifyPromotionTransferCompleted } = require('../services/promotionTransferNotificationService');

const {
  buildWorkflowVisibilityFilter,
  getEmployeeIdsInScope,
  checkJurisdiction,
} = require('../../shared/middleware/dataScopeMiddleware');
const { resolvePromotionTransferWorkflowSettings } = require('../../departments/services/divisionWorkflowResolver');
const { buildApprovalChain, chainStepLabel } = require('../utils/promotionWorkflowUtils');

/** Normalize stored chain rows so API always returns a clear approver-type label (HOD, manager, etc.). */
function hydrateApprovalChainLabels(doc) {
  const chain = doc?.workflow?.approvalChain;
  if (!Array.isArray(chain) || chain.length === 0) return;
  for (const step of chain) {
    const role = step?.role;
    if (!role) continue;
    step.label = chainStepLabel(String(role), step.label);
  }
}

async function resolveTargetEmployee(req) {
  const userRole = (req.user?.role || '').toLowerCase();
  let empNo = req.body.emp_no;

  if (userRole === 'employee') {
    empNo = req.user?.employeeId || req.user?.emp_no;
    if (req.body.emp_no && String(req.body.emp_no).toUpperCase() !== String(empNo).toUpperCase()) {
      return { error: { status: 403, message: 'You can only submit a request for yourself.' } };
    }
    if (!empNo) {
      return { error: { status: 400, message: 'Your employee record could not be identified.' } };
    }
  }

  if (!empNo) {
    return { error: { status: 400, message: 'Employee number is required' } };
  }

  const employee = await Employee.findOne({ emp_no: String(empNo).toUpperCase() })
    .populate('department_id', 'name')
    .populate('division_id', 'name')
    .populate('designation_id', 'name');

  if (!employee) {
    return { error: { status: 404, message: 'Employee not found' } };
  }

  if (!['employee', 'super_admin', 'sub_admin'].includes(userRole)) {
    const ok = checkJurisdiction(req.scopedUser, {
      employeeId: employee._id,
      division_id: employee.division_id,
      department_id: employee.department_id,
    });
    if (!ok) {
      return { error: { status: 403, message: 'Employee is outside your data scope' } };
    }
  }

  return { employee };
}

function idsDiffer(a, b) {
  const sa = a ? a.toString() : '';
  const sb = b ? b.toString() : '';
  return sa !== sb;
}

exports.getPayrollMonths = async (req, res) => {
  try {
    let pastCount = parseInt(req.query.past, 10);
    let futureCount = parseInt(req.query.future, 10);
    if (!Number.isFinite(pastCount) && !Number.isFinite(futureCount)) {
      const count = Math.min(72, Math.max(6, parseInt(req.query.count, 10) || 48));
      pastCount = Math.ceil(count / 2);
      futureCount = Math.ceil(count / 2);
    } else {
      pastCount = Math.min(84, Math.max(0, Number.isFinite(pastCount) ? pastCount : 36));
      futureCount = Math.min(84, Math.max(0, Number.isFinite(futureCount) ? futureCount : 24));
    }

    const toLabel = (year, month) => ptToLabel(year, month);
    const addMonths = (year, month, offset) => ptAddMonths(year, month, offset);

    const ctx = await getPromotionPayrollContext();
    /** Centre the list on the pay run that *contains today* (settings-based range), not the oldest incomplete batch. */
    const anchorYear = ctx.currentCycle.year;
    const anchorMonth = ctx.currentCycle.month;
    const containingKey = ctx.containingKey;

    // eslint-disable-next-line no-await-in-loop
    const containingPr = await getPayrollDateRange(ctx.currentCycle.year, ctx.currentCycle.month);
    const containingRangeDisplay = formatPayrollPeriodRangeEnIn(
      containingPr.startDate,
      containingPr.endDate
    );

    const cycles = [];
    for (let i = -pastCount; i <= futureCount; i += 1) {
      const target = addMonths(anchorYear, anchorMonth, i);
      // eslint-disable-next-line no-await-in-loop
      const pr = await getPayrollDateRange(target.year, target.month);
      const label = toLabel(target.year, target.month);
      const periodRangeDisplay = formatPayrollPeriodRangeEnIn(pr.startDate, pr.endDate);
      cycles.push({
        payrollYear: target.year,
        payrollMonth: target.month,
        periodStart: createISTDate(pr.startDate),
        periodEnd: createISTDate(pr.endDate, '23:59'),
        label,
        periodRangeDisplay,
        rangeStartDate: pr.startDate,
        rangeEndDate: pr.endDate,
        isOngoing: label === containingKey,
      });
    }

    res.status(200).json({
      success: true,
      data: cycles,
      promotionPayroll: {
        /** Oldest payroll month with a non-complete batch (backlog); may differ from containingKey. */
        ongoingLabel: ctx.ongoingLabel,
        incompleteOngoingLabel: ctx.ongoingLabel,
        arrearProrationEndLabel: ctx.arrearProrationEndLabel,
        currentCycleLabel: toLabel(ctx.currentCycle.year, ctx.currentCycle.month),
        containingKey,
        containingRangeDisplay,
        containingRangeStart: containingPr.startDate,
        containingRangeEnd: containingPr.endDate,
        settingsStartDay: containingPr.startDay,
        settingsEndDay: containingPr.endDay,
      },
    });
  } catch (error) {
    console.error('getPayrollMonths:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to list payroll months' });
  }
};

exports.createRequest = async (req, res) => {
  try {
    const { requestType, remarks } = req.body;
    if (!requestType || !['promotion', 'demotion', 'transfer', 'increment'].includes(requestType)) {
      return res.status(400).json({
        success: false,
        message: 'requestType must be promotion, demotion, transfer, or increment',
      });
    }

    const resolved = await resolveTargetEmployee(req);
    if (resolved.error) {
      return res.status(resolved.error.status).json({ success: false, message: resolved.error.message });
    }
    const { employee } = resolved;

    const divisionId = employee.division_id?._id || employee.division_id || null;
    const workflowSettings = await resolvePromotionTransferWorkflowSettings(divisionId);
    const { approvalSteps, firstRole, finalAuthority, reportingManagerIds } = buildApprovalChain(
      employee,
      workflowSettings
    );

    const docPayload = {
      requestType,
      employeeId: employee._id,
      emp_no: employee.emp_no,
      division_id: employee.division_id?._id || employee.division_id,
      department_id: employee.department_id?._id || employee.department_id,
      remarks: remarks || '',
      status: 'pending',
      requestedBy: req.user._id,
      workflow: {
        currentStepRole: firstRole,
        nextApproverRole: firstRole,
        isCompleted: false,
        approvalChain: approvalSteps,
        finalAuthority,
        reportingManagerIds,
        history: [
          {
            step: 'submitted',
            action: 'submitted',
            actionBy: req.user._id,
            actionByName: req.user.name,
            actionByRole: req.user.role,
            comments: `${requestType} request submitted`,
            timestamp: new Date(),
          },
        ],
      },
    };

    if (requestType === 'promotion' || requestType === 'demotion' || requestType === 'increment') {
      const {
        newGrossSalary,
        incrementAmount,
        effectivePayrollYear,
        effectivePayrollMonth,
        proposedDesignationId,
        toDivisionId,
        toDepartmentId,
        toDesignationId,
      } = req.body;

      const y = parseInt(effectivePayrollYear, 10);
      const m = parseInt(effectivePayrollMonth, 10);
      if (!y || m < 1 || m > 12) {
        return res.status(400).json({
          success: false,
          message: 'effectivePayrollYear and effectivePayrollMonth (1–12) are required',
        });
      }

      const prevGross =
        employee.gross_salary === null || employee.gross_salary === undefined
          ? null
          : Number(employee.gross_salary);

      let newGross;
      if (requestType === 'increment') {
        const inc = Number(incrementAmount);
        if (!Number.isFinite(inc) || inc <= 0) {
          return res.status(400).json({
            success: false,
            message: 'incrementAmount must be a positive number',
          });
        }
        if (prevGross == null || !Number.isFinite(prevGross)) {
          return res.status(400).json({
            success: false,
            message: 'Employee must have a current gross salary for increment requests',
          });
        }
        newGross = prevGross + inc;
        docPayload.incrementAmount = inc;
      } else {
        newGross = Number(newGrossSalary);
        if (!Number.isFinite(newGross) || newGross < 0) {
          return res.status(400).json({ success: false, message: 'newGrossSalary must be a valid non-negative number' });
        }
        if (prevGross !== null && Number.isFinite(prevGross) && newGross === prevGross) {
          return res.status(400).json({
            success: false,
            message: 'New gross salary must differ from the current gross salary',
          });
        }
      }

      if (requestType === 'promotion' && prevGross != null && Number.isFinite(prevGross) && newGross <= prevGross) {
        return res.status(400).json({
          success: false,
          message: 'Promotion requires new gross salary greater than current',
        });
      }
      if (requestType === 'demotion' && prevGross != null && Number.isFinite(prevGross) && newGross >= prevGross) {
        return res.status(400).json({
          success: false,
          message: 'Demotion requires new gross salary less than current',
        });
      }

      if (proposedDesignationId) {
        if (!mongoose.Types.ObjectId.isValid(proposedDesignationId)) {
          return res.status(400).json({ success: false, message: 'Invalid proposedDesignationId' });
        }
        const des = await Designation.findById(proposedDesignationId);
        if (!des) {
          return res.status(400).json({ success: false, message: 'Proposed designation not found' });
        }
        docPayload.proposedDesignationId = des._id;
      }

      docPayload.newGrossSalary = newGross;
      docPayload.effectivePayrollYear = y;
      docPayload.effectivePayrollMonth = m;
      docPayload.previousGrossSalary = prevGross;
      docPayload.previousDesignationId = employee.designation_id?._id || employee.designation_id || null;

      // Optional org structure change alongside promotion/demotion
      if (toDivisionId || toDepartmentId || toDesignationId) {
        const fromDiv = employee.division_id?._id || employee.division_id;
        const fromDept = employee.department_id?._id || employee.department_id;
        const fromDesig = employee.designation_id?._id || employee.designation_id;

        const ids = [
          ['toDivisionId', toDivisionId],
          ['toDepartmentId', toDepartmentId],
          ['toDesignationId', toDesignationId],
        ];
        for (const [name, val] of ids) {
          if (val && !mongoose.Types.ObjectId.isValid(val)) {
            return res
              .status(400)
              .json({ success: false, message: `${name} is required and must be a valid id when provided` });
          }
        }

        const div = toDivisionId ? await Division.findById(toDivisionId) : null;
        const dept = toDepartmentId ? await Department.findById(toDepartmentId) : null;
        const des = toDesignationId ? await Designation.findById(toDesignationId) : null;

        if ((toDivisionId && !div) || (toDepartmentId && !dept) || (toDesignationId && !des)) {
          return res
            .status(400)
            .json({ success: false, message: 'Target division, department, or designation not found' });
        }

        const anyChanged =
          (toDivisionId && idsDiffer(fromDiv, toDivisionId)) ||
          (toDepartmentId && idsDiffer(fromDept, toDepartmentId)) ||
          (toDesignationId && idsDiffer(fromDesig, toDesignationId));

        if (!anyChanged) {
          return res.status(400).json({
            success: false,
            message: 'At least one of division, department, or designation must change when specified',
          });
        }

        docPayload.fromDivisionId = fromDiv || null;
        docPayload.fromDepartmentId = fromDept || null;
        docPayload.fromDesignationId = fromDesig || null;
        if (div) docPayload.toDivisionId = div._id;
        if (dept) docPayload.toDepartmentId = dept._id;
        if (des) docPayload.toDesignationId = des._id;
      }
    } else {
      const { toDivisionId, toDepartmentId, toDesignationId } = req.body;

      const fromDiv = employee.division_id?._id || employee.division_id;
      const fromDept = employee.department_id?._id || employee.department_id;
      const fromDesig = employee.designation_id?._id || employee.designation_id;

      for (const [name, val] of [
        ['toDivisionId', toDivisionId],
        ['toDepartmentId', toDepartmentId],
        ['toDesignationId', toDesignationId],
      ]) {
        if (!val || !mongoose.Types.ObjectId.isValid(val)) {
          return res.status(400).json({ success: false, message: `${name} is required and must be a valid id` });
        }
      }

      const div = await Division.findById(toDivisionId);
      const dept = await Department.findById(toDepartmentId);
      const des = await Designation.findById(toDesignationId);
      if (!div || !dept || !des) {
        return res.status(400).json({ success: false, message: 'Target division, department, or designation not found' });
      }

      const changed =
        idsDiffer(fromDiv, toDivisionId) ||
        idsDiffer(fromDept, toDepartmentId) ||
        idsDiffer(fromDesig, toDesignationId);
      if (!changed) {
        return res.status(400).json({
          success: false,
          message: 'Transfer must change at least one of division, department, or designation',
        });
      }

      docPayload.fromDivisionId = fromDiv || null;
      docPayload.fromDepartmentId = fromDept || null;
      docPayload.fromDesignationId = fromDesig || null;
      docPayload.toDivisionId = div._id;
      docPayload.toDepartmentId = dept._id;
      docPayload.toDesignationId = des._id;
    }

    const doc = await PromotionTransferRequest.create(docPayload);

    try {
      await EmployeeHistory.create({
        emp_no: employee.emp_no,
        event: 'promotion_transfer_submitted',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          requestId: doc._id,
          requestType: doc.requestType,
        },
        comments: remarks || '',
      });
    } catch (e) {
      console.error('EmployeeHistory promotion_transfer_submitted:', e.message);
    }

    const populated = await PromotionTransferRequest.findById(doc._id)
      .populate('employeeId', 'employee_name emp_no department_id division_id designation_id gross_salary')
      .populate('requestedBy', 'name email')
      .populate('proposedDesignationId', 'name')
      .populate('fromDivisionId', 'name')
      .populate('fromDepartmentId', 'name')
      .populate('fromDesignationId', 'name')
      .populate('toDivisionId', 'name')
      .populate('toDepartmentId', 'name')
      .populate('toDesignationId', 'name')
      .lean();

    hydrateApprovalChainLabels(populated);
    res.status(201).json({
      success: true,
      message: 'Request submitted for approval',
      data: populated,
    });
  } catch (error) {
    console.error('createRequest:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to create request' });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const userRole = (req.user.role || '').toLowerCase();
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);

    let filter = { status: 'pending' };

    if (!isSuperOrSubAdmin) {
      const workflowFilter = buildWorkflowVisibilityFilter(req.user);
      const scopeFilter = req.scopeFilter || { _id: null };
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);

      let jurisdictionFilter = scopeFilter;
      let visibilityFilter = workflowFilter;

      if (Array.isArray(scopedEmployeeIds) && scopedEmployeeIds.length > 0) {
        jurisdictionFilter = {
          $or: [scopeFilter, { employeeId: { $in: scopedEmployeeIds } }],
        };
        visibilityFilter = {
          $or: [workflowFilter, { employeeId: { $in: scopedEmployeeIds } }],
        };
      }

      filter = {
        $and: [{ status: 'pending' }, jurisdictionFilter, visibilityFilter],
      };
    }

    const list = await PromotionTransferRequest.find(filter)
      .populate('employeeId', 'employee_name emp_no department_id division_id designation_id gross_salary')
      .populate('requestedBy', 'name email')
      .populate('proposedDesignationId', 'name')
      .populate('fromDivisionId', 'name')
      .populate('fromDepartmentId', 'name')
      .populate('fromDesignationId', 'name')
      .populate('toDivisionId', 'name')
      .populate('toDepartmentId', 'name')
      .populate('toDesignationId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    list.forEach((row) => hydrateApprovalChainLabels(row));
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('getPendingApprovals:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch pending approvals' });
  }
};

exports.getRequests = async (req, res) => {
  try {
    const { emp_no } = req.query;
    const userRole = (req.user.role || '').toLowerCase();
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);

    let filter = {};

    if (!isSuperOrSubAdmin) {
      const workflowFilter = buildWorkflowVisibilityFilter(req.user);
      const scopeFilter = req.scopeFilter || { _id: null };
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);

      let jurisdictionFilter = scopeFilter;
      let visibilityFilter = workflowFilter;

      if (Array.isArray(scopedEmployeeIds) && scopedEmployeeIds.length > 0) {
        jurisdictionFilter = {
          $or: [scopeFilter, { employeeId: { $in: scopedEmployeeIds } }],
        };
        visibilityFilter = {
          $or: [workflowFilter, { employeeId: { $in: scopedEmployeeIds } }],
        };
      }

      filter = { $and: [jurisdictionFilter, visibilityFilter] };
    }

    if (emp_no) {
      const empFilter = { emp_no: String(emp_no).toUpperCase() };
      if (filter.$and) {
        filter = { $and: [...filter.$and, empFilter] };
      } else {
        filter = empFilter;
      }
    }

    const list = await PromotionTransferRequest.find(filter)
      .populate('employeeId', 'employee_name emp_no department_id division_id designation_id gross_salary')
      .populate('requestedBy', 'name email')
      .populate('proposedDesignationId', 'name')
      .populate('fromDivisionId', 'name')
      .populate('fromDepartmentId', 'name')
      .populate('fromDesignationId', 'name')
      .populate('toDivisionId', 'name')
      .populate('toDepartmentId', 'name')
      .populate('toDesignationId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    list.forEach((row) => hydrateApprovalChainLabels(row));
    res.status(200).json({ success: true, data: list });
  } catch (error) {
    console.error('getRequests:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch requests' });
  }
};

exports.getRequestById = async (req, res) => {
  try {
    const doc = await PromotionTransferRequest.findById(req.params.id)
      .populate('employeeId', 'employee_name emp_no department_id division_id designation_id gross_salary')
      .populate('requestedBy', 'name email')
      .populate('proposedDesignationId', 'name')
      .populate('fromDivisionId', 'name')
      .populate('fromDepartmentId', 'name')
      .populate('fromDesignationId', 'name')
      .populate('toDivisionId', 'name')
      .populate('toDepartmentId', 'name')
      .populate('toDesignationId', 'name');

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);
    if (!isSuperOrSubAdmin) {
      const workflowFilter = buildWorkflowVisibilityFilter(req.user);
      const scopeFilter = req.scopeFilter || { _id: null };
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);
      let jurisdictionFilter = scopeFilter;
      let visibilityFilter = workflowFilter;
      if (Array.isArray(scopedEmployeeIds) && scopedEmployeeIds.length > 0) {
        jurisdictionFilter = { $or: [scopeFilter, { employeeId: { $in: scopedEmployeeIds } }] };
        visibilityFilter = { $or: [workflowFilter, { employeeId: { $in: scopedEmployeeIds } }] };
      }
      const match = await PromotionTransferRequest.findOne({
        _id: doc._id,
        $and: [jurisdictionFilter, visibilityFilter],
      });
      if (!match) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this request' });
      }
    }

    hydrateApprovalChainLabels(doc);
    res.status(200).json({ success: true, data: doc });
  } catch (error) {
    console.error('getRequestById:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch request' });
  }
};

exports.cancelRequest = async (req, res) => {
  try {
    const doc = await PromotionTransferRequest.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (doc.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending requests can be cancelled' });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isSuperOrSub = ['super_admin', 'sub_admin'].includes(userRole);
    const isRequester = doc.requestedBy.toString() === req.user._id.toString();
    const isSubject =
      req.user.employeeRef &&
      doc.employeeId.toString() === req.user.employeeRef.toString();

    if (!isSuperOrSub && !isRequester && !isSubject) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this request' });
    }

    doc.status = 'cancelled';
    doc.workflow.isCompleted = true;
    doc.workflow.currentStepRole = null;
    doc.workflow.nextApproverRole = null;
    doc.workflow.history.push({
      step: userRole,
      action: 'cancelled',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: req.user.role,
      comments: req.body?.comments || 'Cancelled',
      timestamp: new Date(),
    });
    await doc.save();

    try {
      await EmployeeHistory.create({
        emp_no: doc.emp_no,
        event: 'promotion_transfer_cancelled',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: { requestId: doc._id, requestType: doc.requestType },
        comments: req.body?.comments || '',
      });
    } catch (e) {
      console.error('EmployeeHistory cancel:', e.message);
    }

    res.status(200).json({ success: true, message: 'Request cancelled', data: doc });
  } catch (error) {
    console.error('cancelRequest:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to cancel' });
  }
};

exports.deleteRequest = async (req, res) => {
  try {
    const doc = await PromotionTransferRequest.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    if (doc.status === 'approved') {
      return res.status(400).json({
        success: false,
        message:
          'Cannot delete an approved request. The employee record may already reflect this promotion or transfer.',
      });
    }

    const userRole = (req.user.role || '').toLowerCase();
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);

    if (!isSuperOrSubAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this request' });
    }

    if (userRole !== 'super_admin') {
      const workflowFilter = buildWorkflowVisibilityFilter(req.user);
      const scopeFilter = req.scopeFilter || { _id: null };
      const scopedEmployeeIds = await getEmployeeIdsInScope(req.user);
      let jurisdictionFilter = scopeFilter;
      let visibilityFilter = workflowFilter;
      if (Array.isArray(scopedEmployeeIds) && scopedEmployeeIds.length > 0) {
        jurisdictionFilter = { $or: [scopeFilter, { employeeId: { $in: scopedEmployeeIds } }] };
        visibilityFilter = { $or: [workflowFilter, { employeeId: { $in: scopedEmployeeIds } }] };
      }
      const match = await PromotionTransferRequest.findOne({
        _id: doc._id,
        $and: [jurisdictionFilter, visibilityFilter],
      });
      if (!match) {
        return res.status(403).json({ success: false, message: 'Not authorized to delete this request' });
      }
    }

    const empNo = doc.emp_no;
    const requestId = doc._id;
    const requestType = doc.requestType;
    await PromotionTransferRequest.deleteOne({ _id: doc._id });

    try {
      await EmployeeHistory.create({
        emp_no: empNo,
        event: 'promotion_transfer_deleted',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: { requestId, requestType },
        comments: 'Promotion/transfer request permanently removed',
      });
    } catch (e) {
      console.error('EmployeeHistory promotion_transfer_deleted:', e.message);
    }

    res.status(200).json({ success: true, message: 'Request deleted' });
  } catch (error) {
    console.error('deleteRequest:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete request' });
  }
};

async function applyApprovedChanges(doc) {
  const emp = await Employee.findById(doc.employeeId);
  if (!emp) return;

  if (doc.requestType === 'promotion' || doc.requestType === 'demotion' || doc.requestType === 'increment') {
    let nextGross = Number(doc.newGrossSalary);
    if (!Number.isFinite(nextGross) && doc.incrementAmount != null) {
      const base = Number(emp.gross_salary) || 0;
      nextGross = base + Number(doc.incrementAmount);
    }
    if (!Number.isFinite(nextGross)) {
      throw new Error('Salary change request is missing newGrossSalary');
    }
    emp.gross_salary = nextGross;
    if (doc.proposedDesignationId) {
      emp.designation_id = doc.proposedDesignationId;
    }
    // Apply optional org changes captured on the request
    if (doc.toDivisionId) {
      emp.division_id = doc.toDivisionId;
    }
    if (doc.toDepartmentId) {
      emp.department_id = doc.toDepartmentId;
    }
    if (doc.toDesignationId && !doc.proposedDesignationId) {
      // Fallback: if no separate proposedDesignationId, use the toDesignationId
      emp.designation_id = doc.toDesignationId;
    }
    await emp.save();
    return;
  }

  if (doc.requestType === 'transfer') {
    emp.division_id = doc.toDivisionId;
    emp.department_id = doc.toDepartmentId;
    emp.designation_id = doc.toDesignationId;
    await emp.save();
  }
}

exports.approveOrReject = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, comments } = req.body;

    const doc = await PromotionTransferRequest.findById(id).populate('employeeId');
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Request not found' });
    }
    hydrateApprovalChainLabels(doc);
    if (doc.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Request is no longer pending' });
    }

    const emp = doc.employeeId;
    const divisionId =
      emp && typeof emp === 'object' ? emp.division_id?._id || emp.division_id || null : null;
    const workflowEffective = await resolvePromotionTransferWorkflowSettings(divisionId);
    const allowHigher = workflowEffective?.workflow?.allowHigherAuthorityToApproveLowerLevels === true;

    const chain = doc.workflow?.approvalChain || [];
    const activeIndex = chain.findIndex((s) => s.status === 'pending');
    if (activeIndex === -1) {
      return res.status(400).json({ success: false, message: 'No pending approval step' });
    }
    const step = chain[activeIndex];
    const userRole = (req.user.role || '').toLowerCase();
    const isReportingManager = doc.workflow?.reportingManagerIds?.includes(req.user._id.toString());
    const isSuperOrSubAdmin = ['super_admin', 'sub_admin'].includes(userRole);

    let canAct = false;
    let targetStep = step;

    if (isSuperOrSubAdmin) {
      canAct = true;
    } else {
      const isMatchCurrent =
        step.role === userRole ||
        (step.role === 'reporting_manager' && isReportingManager) ||
        (step.role === 'final_authority' && userRole === 'hr') ||
        (doc.workflow.finalAuthority === userRole && ['hr'].includes(userRole));

      if (isMatchCurrent) {
        canAct = true;
      } else if (allowHigher) {
        const laterSteps = chain.slice(activeIndex);
        const matchedLaterStep = laterSteps.find(
          (s) =>
            s.role === userRole ||
            (s.role === 'reporting_manager' && isReportingManager) ||
            (s.role === 'final_authority' && userRole === 'hr')
        );
        if (matchedLaterStep) {
          canAct = true;
          targetStep = matchedLaterStep;
        }
      }
    }

    if (!canAct) {
      return res.status(403).json({
        success: false,
        message: `Only ${step.role} can act on this step`,
      });
    }

    const actingStep = targetStep;
    const isApprove = action === 'approve';

    if (isApprove && allowHigher && targetStep !== step) {
      for (let i = activeIndex; i < chain.indexOf(targetStep); i++) {
        const skippedStep = chain[i];
        if (skippedStep.status === 'pending') {
          skippedStep.status = 'approved';
          skippedStep.actionBy = req.user._id;
          skippedStep.actionByName = req.user.name;
          skippedStep.actionByRole = `${userRole} (Higher Auth)`;
          skippedStep.comments = 'Auto-approved by higher authority';
          skippedStep.updatedAt = new Date();
          doc.workflow.history.push({
            step: skippedStep.role,
            action: 'approved',
            actionBy: req.user._id,
            actionByName: req.user.name,
            actionByRole: `${userRole} (Higher Auth)`,
            comments: 'Auto-approved by higher authority',
            timestamp: new Date(),
          });
        }
      }
    }

    actingStep.status = isApprove ? 'approved' : 'rejected';
    actingStep.actionBy = req.user._id;
    actingStep.actionByName = req.user.name;
    actingStep.actionByRole = userRole;
    actingStep.comments = comments || '';
    actingStep.updatedAt = new Date();

    doc.workflow.history.push({
      step: actingStep.role,
      action: isApprove ? 'approved' : 'rejected',
      actionBy: req.user._id,
      actionByName: req.user.name,
      actionByRole: userRole,
      comments: comments || '',
      timestamp: new Date(),
    });

    try {
      await EmployeeHistory.create({
        emp_no: doc.emp_no,
        event: isApprove ? 'promotion_transfer_step_approved' : 'promotion_transfer_step_rejected',
        performedBy: req.user._id,
        performedByName: req.user.name,
        performedByRole: req.user.role,
        details: {
          requestId: doc._id,
          requestType: doc.requestType,
          stepRole: actingStep.role,
          stepOrder: actingStep.stepOrder,
        },
        comments: comments || '',
      });
    } catch (e) {
      console.error('EmployeeHistory step:', e.message);
    }

    const actingIdx = chain.indexOf(actingStep);
    const nextIndex = actingIdx + 1;
    const isLastStep = nextIndex >= chain.length;

    if (!isApprove) {
      doc.status = 'rejected';
      doc.workflow.isCompleted = true;
      doc.workflow.currentStepRole = null;
      doc.workflow.nextApproverRole = null;
      await doc.save();
      try {
        await EmployeeHistory.create({
          emp_no: doc.emp_no,
          event: 'promotion_transfer_rejected',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: { requestId: doc._id, requestType: doc.requestType },
          comments: comments || '',
        });
      } catch (e) {
        console.error('EmployeeHistory rejected:', e.message);
      }
      return res.status(200).json({ success: true, message: 'Request rejected', data: doc });
    }

    if (isLastStep) {
      try {
        await applyApprovedChanges(doc);
      } catch (applyErr) {
        return res.status(400).json({
          success: false,
          message: applyErr.message || 'Failed to apply promotion/transfer to employee record',
        });
      }

      doc.status = 'approved';
      doc.workflow.isCompleted = true;
      doc.workflow.currentStepRole = null;
      doc.workflow.nextApproverRole = null;
      await doc.save();

      try {
        const n = await notifyPromotionTransferCompleted(doc, req.user);
        if (n && !n.skipped) {
          console.log(
            `[PromotionTransfer] Notifications: detail=${n.detailCount}, summary=${n.summaryCount} (orgMove=${n.hasOrgMove})`
          );
        }
      } catch (e) {
        console.error('[PromotionTransfer] notifyPromotionTransferCompleted:', e?.message || e, e?.stack);
      }

      try {
        await EmployeeHistory.create({
          emp_no: doc.emp_no,
          event: 'promotion_transfer_final_approved',
          performedBy: req.user._id,
          performedByName: req.user.name,
          performedByRole: req.user.role,
          details: {
            requestId: doc._id,
            requestType: doc.requestType,
            newGrossSalary: doc.newGrossSalary,
            previousGrossSalary: doc.previousGrossSalary,
            effectivePayrollYear: doc.effectivePayrollYear,
            effectivePayrollMonth: doc.effectivePayrollMonth,
            toDivisionId: doc.toDivisionId,
            toDepartmentId: doc.toDepartmentId,
            toDesignationId: doc.toDesignationId,
          },
          comments: comments || 'Final approval — employee master updated',
        });
      } catch (e) {
        console.error('EmployeeHistory final:', e.message);
      }

      let arrearResult = null;
      try {
        const approverId = req.user._id || req.user.userId;
        arrearResult = await createDirectArrearForApprovedPromotion(doc, approverId);
        if (arrearResult?.warning) {
          console.warn('[PromotionTransfer] Arrear side-effect:', arrearResult.warning);
        }
      } catch (arrearErr) {
        console.error('[PromotionTransfer] Unexpected arrears error:', arrearErr.message);
        arrearResult = { ok: false, warning: arrearErr.message };
      }

      const responseBody = {
        success: true,
        message: 'Request fully approved; employee record updated',
        data: doc,
      };
      if (arrearResult?.arrearsId) {
        responseBody.arrearId = arrearResult.arrearsId;
      }
      if (arrearResult?.warning) {
        responseBody.arrearWarning = arrearResult.warning;
      }

      return res.status(200).json(responseBody);
    }

    const nextStep = chain[nextIndex];
    nextStep.status = 'pending';
    nextStep.isCurrent = true;
    doc.workflow.currentStepRole = nextStep.role;
    doc.workflow.nextApproverRole = nextStep.role;
    await doc.save();

    res.status(200).json({
      success: true,
      message: 'Approved at this step; forwarded to next approver',
      data: doc,
    });
  } catch (error) {
    console.error('approveOrReject:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process action' });
  }
};
