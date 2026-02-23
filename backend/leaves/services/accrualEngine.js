const Employee = require('../../employees/model/Employee');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const LeavePolicySettings = require('../../settings/model/LeavePolicySettings');
const LeaveRegister = require('../model/LeaveRegister');
const leaveRegisterService = require('./leaveRegisterService');
const earnedLeaveService = require('./earnedLeaveService');
const CCLRequest = require('../model/CCLRequest');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const dateCycleService = require('./dateCycleService');

/**
 * Accrual Engine
 * Handles systemic posting of leave credits (CL, EL) and expiration logic (CCL)
 */
class AccrualEngine {
    /**
     * Post monthly accruals for all active employees
     */
    async postMonthlyAccruals(monthNum, year) {
        try {
            const employees = await Employee.find({ is_active: true });
            const globalSettings = await LeavePolicySettings.getSettings();

            const results = {
                processed: 0,
                clCredits: 0,
                elCredits: 0,
                expiredCCLs: 0,
                errors: []
            };

            const cycleTargetDate = new Date(year, monthNum - 1, 15);
            const cycleInfo = await dateCycleService.getPayrollCycleForDate(cycleTargetDate);
            const cycleStart = cycleInfo.startDate;
            const cycleEnd = cycleInfo.endDate;
            const daysInCycle = Math.round((cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            for (const emp of employees) {
                try {
                    // 1. Fetch relevant settings (Dept overrides Global)
                    const deptSettings = await DepartmentSettings.getByDeptAndDiv(emp.department_id, emp.division_id);

                    // 2. Handle Casual Leave (CL) Accrual
                    const clCredit = await this.calculateCLAccrual(emp, deptSettings, globalSettings, cycleStart, cycleEnd, daysInCycle);
                    if (clCredit > 0) {
                        await this.postCredit(emp, 'CL', clCredit, cycleEnd, 'Monthly CL Accrual', monthNum, year);
                        results.clCredits++;
                    }

                    // 3. Handle Earned Leave (EL) Accrual
                    // Pass cycle dates to earnedLeaveService
                    const elCalculation = await earnedLeaveService.calculateEarnedLeave(emp._id, monthNum, year, cycleStart, cycleEnd);
                    if (elCalculation.eligible && elCalculation.elEarned > 0) {
                        await leaveRegisterService.addEarnedLeaveCredit(
                            emp._id,
                            elCalculation.elEarned,
                            monthNum,
                            year,
                            elCalculation.calculationBreakdown,
                            cycleEnd
                        );
                        results.elCredits++;
                    }

                    // 4. Handle CCL Expiration
                    const expired = await this.processCCLExpiration(emp, deptSettings, globalSettings, cycleStart, cycleEnd);
                    results.expiredCCLs += expired;

                    results.processed++;
                } catch (err) {
                    results.errors.push({ empNo: emp.emp_no, error: err.message });
                }
            }

            return results;
        } catch (error) {
            console.error('Error in AccrualEngine.postMonthlyAccruals:', error);
            throw error;
        }
    }

    /**
     * Calculate monthly CL accrual with pro-rata joining logic
     */
    async calculateCLAccrual(emp, deptSettings, globalSettings, cycleStart, cycleEnd, daysInCycle) {
        // Annual entitlement (priority: Department -> Global)
        const annualCL = deptSettings?.leaves?.casualLeavePerYear || globalSettings.annualCLReset.resetToBalance || 12;
        const monthlyBase = annualCL / 12;

        const doj = emp.doj ? new Date(emp.doj) : new Date();
        const joinedDate = new Date(doj.getFullYear(), doj.getMonth(), doj.getDate());
        const start = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate());
        const end = new Date(cycleEnd.getFullYear(), cycleEnd.getMonth(), cycleEnd.getDate());

        // Employee joined after this cycle ended -> 0 accrual
        if (joinedDate > end) return 0;

        // Employee joined on or before this cycle started -> full accrual
        if (joinedDate <= start) return monthlyBase;

        // Employee joined during this cycle -> pro-rata accrual
        const daysInService = Math.round((end.getTime() - joinedDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        let accrual = Math.round((daysInService / daysInCycle) * monthlyBase * 100) / 100;

        // Minimum grant: if any accrual (> 0 but < 0.5), grant at least 0.5 days. Then steps are 0.5, 1.0, 1.5, ...
        if (accrual > 0 && accrual < 0.5) accrual = 0.5;
        // Round to nearest 0.5 so we only ever grant 0, 0.5, 1.0, 1.5, ...
        if (accrual > 0) accrual = Math.round(accrual * 2) / 2;
        return accrual;
    }

    /**
     * Process CCL Expiration logic
     */
    async processCCLExpiration(emp, deptSettings, globalSettings, cycleStart, cycleEnd) {
        const expiryMonths = deptSettings?.leaves?.cclExpiryMonths || globalSettings.carryForward.compensatoryOff.expiryMonths || 6;
        if (expiryMonths <= 0) return 0;

        // The threshold is N months before the CURRENT cycle's start date
        const expiryThresholdDate = new Date(cycleStart);
        expiryThresholdDate.setMonth(expiryThresholdDate.getMonth() - expiryMonths);

        // Find approved CCLs earned before threshold that are still un-used
        const expiringCCLs = await CCLRequest.find({
            employeeId: emp._id,
            status: 'approved',
            date: { $lt: expiryThresholdDate },
            isExpired: { $ne: true },
            isUsed: { $ne: true }
        });

        let expiredCount = 0;
        for (const ccl of expiringCCLs) {
            const days = ccl.isHalfDay ? 0.5 : 1;

            // Post EXPIRY transaction to ledger on the exact cycle start date
            await leaveRegisterService.addTransaction({
                employeeId: emp._id,
                empNo: emp.emp_no,
                employeeName: emp.employee_name || 'N/A',
                designation: 'N/A',
                department: 'N/A',
                divisionId: emp.division_id,
                departmentId: emp.department_id,
                dateOfJoining: emp.doj || new Date(),
                employmentStatus: emp.is_active ? 'active' : 'inactive',
                leaveType: 'CCL',
                transactionType: 'EXPIRY',
                startDate: cycleStart,
                endDate: cycleStart,
                days: days,
                reason: `CCL Earned on ${extractISTComponents(ccl.date).dateStr} expired after ${expiryMonths} months`,
                status: 'APPROVED',
                autoGenerated: true,
                autoGeneratedType: 'EXPIRY'
            });

            ccl.isExpired = true;
            await ccl.save();
            expiredCount++;
        }

        return expiredCount;
    }

    /**
     * Helper to post credit transactions
     */
    async postCredit(emp, type, days, cycleEnd, reason, monthNum, year) {
        // Post credit strictly pinned to the cycle's target date (end date) for exact attribution
        return await leaveRegisterService.addTransaction({
            employeeId: emp._id,
            empNo: emp.emp_no,
            employeeName: emp.employee_name || 'N/A',
            designation: 'N/A',
            department: 'N/A',
            divisionId: emp.division_id,
            departmentId: emp.department_id,
            dateOfJoining: emp.doj || new Date(),
            employmentStatus: emp.is_active ? 'active' : 'inactive',
            leaveType: type,
            transactionType: 'CREDIT',
            startDate: cycleEnd,
            endDate: cycleEnd,
            days: days,
            reason: reason,
            status: 'APPROVED',
            autoGenerated: true,
            autoGeneratedType: type === 'EL' ? 'EARNED_LEAVE' : 'INITIAL_BALANCE'
        });
    }
}

module.exports = new AccrualEngine();
