const leaveRegisterService = require('../services/leaveRegisterService');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const dateCycleService = require('../services/dateCycleService');
const { extractISTComponents } = require('../../shared/utils/dateUtils');

/**
 * @desc    Get Leave Register data
 * @route   GET /api/leaves/register
 * @access  Private (Manager, HOD, HR, Admin)
 */
exports.getRegister = async (req, res) => {
    try {
        const { divisionId, departmentId, searchTerm, month, year, employeeId, empNo, balanceAsOf, baseDate } = req.query;

        // Build filters object based on user role and query (empNo allows employee self-service when Employee _id not available)
        const filters = {
            divisionId,
            departmentId,
            searchTerm,
            employeeId,
            empNo,
            balanceAsOf: balanceAsOf === 'true' || balanceAsOf === '1',
        };

        // Employee can only fetch their own register (for CL balance on apply form)
        if (req.user.role === 'employee') {
            filters.employeeId = req.user.employeeRef; // Employee document _id
            filters.empNo = req.user.employeeId;       // emp_no string
            if (!filters.employeeId && !filters.empNo) {
                return res.status(403).json({
                    success: false,
                    message: 'Employee identity not found; cannot fetch leave register.',
                });
            }
        }

        // If user is HOD/Manager, ensure their scope is applied
        // (This is usually handled by applyScopeFilter middleware, 
        // but we can pass it explicitly if needed)
        if (req.user.role === 'hod' || req.user.role === 'manager') {
            if (req.user.divisionMapping) {
                filters.divisionId = req.user.divisionMapping.division_id;
                filters.departmentId = req.user.divisionMapping.department_id;
            }
        }

        // Determine effective month/year from pay cycle:
        // - If baseDate is provided (e.g. leave start date from apply form), resolve the payroll period
        //   that contains that calendar day so monthly limit is correct for the selected date.
        //   Parse as date-only (YYYY-MM-DD) at noon UTC so the correct period is used regardless of server TZ.
        // - Otherwise use explicit month/year for admin register view.
        let effectiveMonth = month;
        let effectiveYear = year;
        let basePeriodInfo = null;
        if (baseDate && String(baseDate).trim()) {
            try {
                // Strip time part if present (e.g. 2026-01-31T00:00:00.000Z -> 2026-01-31)
                const dateStr = String(baseDate).trim().split(/[T\s]/)[0];
                let y, m, d;
                // YYYY-MM-DD or YYYY/MM/DD (API / HTML date input)
                const isoMatch = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
                // DD-MM-YYYY or DD/MM/YYYY (locale e.g. 31-01-2026)
                const dmyMatch = dateStr.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
                if (isoMatch) {
                    y = parseInt(isoMatch[1], 10);
                    m = parseInt(isoMatch[2], 10) - 1;
                    d = parseInt(isoMatch[3], 10);
                } else if (dmyMatch) {
                    d = parseInt(dmyMatch[1], 10);
                    m = parseInt(dmyMatch[2], 10) - 1;
                    y = parseInt(dmyMatch[3], 10);
                }
                const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
                const valid = y != null && m >= 0 && m <= 11 && d >= 1 && d <= (daysInMonth(y, m) || 31);
                let base = valid ? new Date(Date.UTC(y, m, d, 12, 0, 0)) : new Date(dateStr);
                if (isNaN(base.getTime()) && dateStr) base = new Date(dateStr);
                if (!isNaN(base.getTime())) {
                    basePeriodInfo = await dateCycleService.getPeriodInfo(base);
                    effectiveMonth = String(basePeriodInfo.payrollCycle.month);
                    effectiveYear = String(basePeriodInfo.payrollCycle.year);
                }
            } catch (err) {
                console.error('Error resolving payroll month/year from baseDate in getRegister:', err);
            }
            // If baseDate was sent but we still have no period (parse failed), resolve from baseDate string so limit is never wrong
            if (baseDate && (effectiveMonth == null || effectiveYear == null)) {
                try {
                    const fallback = new Date(String(baseDate).trim());
                    if (!isNaN(fallback.getTime())) {
                        basePeriodInfo = await dateCycleService.getPeriodInfo(fallback);
                        effectiveMonth = String(basePeriodInfo.payrollCycle.month);
                        effectiveYear = String(basePeriodInfo.payrollCycle.year);
                    }
                } catch (e) {
                    console.error('Fallback baseDate period resolve failed:', e.message);
                }
            }
        }

        const registerData = await leaveRegisterService.getLeaveRegister(filters, effectiveMonth, effectiveYear);

        // CL: 2 per pay cycle (minus pending in period). CCL is added on top for total usable in period.
        // Service sets casualLeave.allowedRemaining (2 - pending) and casualLeave.monthlyCLLimit (2).
        let dataWithLimit = registerData;
        try {
            dataWithLimit = registerData.map((entry) => {
                const clBal = Number(entry.casualLeave?.balance) || 0;
                const cclBal = Number(entry.compensatoryOff?.balance) || 0;
                const monthlyCLLimit = entry.casualLeave?.monthlyCLLimit != null
                    ? Number(entry.casualLeave.monthlyCLLimit)
                    : clBal;
                const allowedRemaining = entry.casualLeave?.allowedRemaining != null
                    ? Number(entry.casualLeave.allowedRemaining)
                    : monthlyCLLimit;
                const monthlyAllowedLimit = allowedRemaining + cclBal;
                return {
                    ...entry,
                    monthlyCLLimit,
                    monthlyAllowedLimit,
                    pendingCLThisMonth: entry.casualLeave?.pendingThisMonth ?? 0,
                };
            });
        } catch (e) {
            console.error('Error computing monthly allowed limit for leave register:', e);
        }

        // Derive payroll-cycle period and return in IST (YYYY-MM-DD) so frontend shows correct period.
        let startDate = null;
        let endDate = null;
        try {
            let periodStart = null;
            let periodEnd = null;
            if (basePeriodInfo) {
                periodStart = basePeriodInfo.payrollCycle.startDate;
                periodEnd = basePeriodInfo.payrollCycle.endDate;
            } else {
                const today = new Date();
                const baseYearNum = effectiveYear ? Number(effectiveYear) : today.getFullYear();
                const baseMonthNum = effectiveMonth ? Number(effectiveMonth) : (today.getMonth() + 1);
                const midOfMonth = new Date(baseYearNum, baseMonthNum - 1, 15);
                const periodInfo = await dateCycleService.getPeriodInfo(midOfMonth);
                periodStart = periodInfo.payrollCycle.startDate;
                periodEnd = periodInfo.payrollCycle.endDate;
            }
            if (periodStart) startDate = extractISTComponents(periodStart).dateStr;
            if (periodEnd) endDate = extractISTComponents(periodEnd).dateStr;
        } catch (err) {
            console.error('Error resolving payroll period for leave register response:', err);
        }

        res.status(200).json({
            success: true,
            count: dataWithLimit.length,
            data: dataWithLimit,
            startDate,
            endDate,
        });
    } catch (error) {
        console.error('Error fetching leave register:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching leave register',
            error: error.message,
        });
    }
};

/**
 * @desc    Get detailed leave register for a specific employee
 * @route   GET /api/leaves/register/employee/:employeeId
 * @access  Private (Manager, HOD, HR, Admin)
 */
exports.getEmployeeRegister = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required',
            });
        }

        // Get employee's complete leave register
        const employeeData = await leaveRegisterService.getEmployeeRegister(employeeId);

        // If date range is specified, filter transactions
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);

            // Filter transactions for each leave type
            Object.keys(employeeData.leaveTypes).forEach(leaveType => {
                employeeData.leaveTypes[leaveType].transactions =
                    employeeData.leaveTypes[leaveType].transactions.filter(transaction => {
                        const transactionDate = new Date(transaction.startDate);
                        return transactionDate >= start && transactionDate <= end;
                    });
            });
        }

        res.status(200).json({
            success: true,
            data: employeeData,
        });
    } catch (error) {
        console.error('Error fetching employee leave register:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employee leave register',
            error: error.message,
        });
    }
};

/**
 * @desc    Adjust Leave balance for an employee
 * @route   POST /api/leaves/register/adjust
 * @access  Private (HR, Admin, Super Admin)
 */
exports.adjustLeaveBalance = async (req, res) => {
    try {
        const { employeeId, leaveType, amount, transactionType, reason } = req.body;

        if (!employeeId || !leaveType || amount === undefined || !transactionType || !reason) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID, Leave Type, Amount, Transaction Type, and Reason are required'
            });
        }

        const days = Number(amount);
        if (!Number.isFinite(days) || days < 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be a non-negative number'
            });
        }

        if (transactionType.toUpperCase() !== 'ADJUSTMENT') {
            return res.status(400).json({
                success: false,
                message: 'Only ADJUSTMENT transaction type is supported for manual balance changes'
            });
        }

        const trimmedReason = reason.trim();
        const fullReason = `Manual Adjustment: ${trimmedReason}`;

        const adjustment = await leaveRegisterService.addAdjustment(employeeId, leaveType, days, fullReason);

        res.status(200).json({
            success: true,
            message: `${leaveType} balance adjusted successfully`,
            data: adjustment
        });
    } catch (error) {
        console.error('Error adjusting leave balance:', error);
        res.status(500).json({
            success: false,
            message: 'Error adjusting leave balance',
            error: error.message
        });
    }
};

/**
 * @desc    Get employee ledger for a specific leave type
 * @route   GET /api/leaves/register/employee/:employeeId/ledger/:leaveType
 * @access  Private (Manager, HOD, HR, Admin)
 */
exports.getEmployeeLedger = async (req, res) => {
    try {
        const { employeeId, leaveType } = req.params;
        const { startDate, endDate } = req.query;

        if (!employeeId || !leaveType) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID and leave type are required',
            });
        }

        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = endDate ? new Date(endDate) : new Date();

        const ledger = await leaveRegisterService.getEmployeeLedger(employeeId, leaveType, start, end);

        res.status(200).json({
            success: true,
            data: ledger,
        });
    } catch (error) {
        console.error('Error fetching employee ledger:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching employee ledger',
            error: error.message,
        });
    }
};
