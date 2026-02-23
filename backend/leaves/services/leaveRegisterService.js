const Employee = require('../../employees/model/Employee');
const DepartmentSettings = require('../../departments/model/DepartmentSettings');
const Leave = require('../model/Leave');
const CCLRequest = require('../model/CCLRequest');
const MonthlyLeaveRecord = require('../model/MonthlyLeaveRecord');
const { extractISTComponents, createISTDate } = require('../../shared/utils/dateUtils');
const { getFinancialYear } = require('./leaveBalanceService');

/**
 * Get the Leave Register data for a specific financial year and month
 * @param {Object} filters - Search and scope filters (division, department, searchTerm)
 * @param {String} targetMonth - Optional target month (YYYY-MM), defaults to current
 * @returns {Array} List of employees with their leave register details
 */
async function getLeaveRegister(filters = {}, targetMonth = null) {
    try {
        const query = { is_active: true };

        if (filters.divisionId) query.division_id = filters.divisionId;
        if (filters.departmentId) query.department_id = filters.departmentId;
        if (filters.searchTerm) {
            query.$or = [
                { employee_name: { $regex: filters.searchTerm, $options: 'i' } },
                { emp_no: { $regex: filters.searchTerm, $options: 'i' } },
            ];
        }

        const employees = await Employee.find(query)
            .select('employee_name emp_no division_id department_id paidLeaves compensatoryOffs doj')
            .populate('division_id', 'name')
            .populate('department_id', 'name');

        // Use current month if not provided
        const now = new Date();
        const currentMonthStr = targetMonth || extractISTComponents(now).dateStr.substring(0, 7);
        const [targetYear, targetMonthNum] = currentMonthStr.split('-').map(Number);
        const financialYear = getFinancialYear(createISTDate(`${currentMonthStr}-01`));

        // Determine the start of the financial year
        const fyStartYear = parseInt(financialYear.split('-')[0]);
        const fyStartDate = createISTDate(`${fyStartYear}-04-01`);

        const results = [];

        for (const emp of employees) {
            // 1. Get Department Settings for CL rules
            const deptSettings = await DepartmentSettings.getByDeptAndDiv(emp.department_id, emp.division_id);
            const clPerYear = deptSettings?.leaves?.casualLeavePerYear || 0;
            const maxClPerMonth = deptSettings?.leaves?.maxCasualLeavesPerMonth || 0;
            const monthlyAccrual = clPerYear / 12;

            // 2. Calculate Months elapsed in FY (for cumulative accrual)
            let monthsElapsed = 0;
            if (targetYear > fyStartYear) {
                monthsElapsed = targetMonthNum + (12 - 4 + 1); // e.g. Jan (1) -> 1 + 9 = 10 months
            } else {
                monthsElapsed = targetMonthNum - 4 + 1; // e.g. July (7) -> 7 - 4 + 1 = 4 months
            }

            // Ensure monthsElapsed is non-negative and capped at 12
            monthsElapsed = Math.max(0, Math.min(12, monthsElapsed));

            const totalAccruedSoFar = monthlyAccrual * monthsElapsed;
            const currentMonthNewAccrual = monthlyAccrual;

            // 3. Get Earned CCLs in this Financial Year up to target month
            const earnedCCLs = await CCLRequest.find({
                employeeId: emp._id,
                status: 'approved',
                date: { $gte: `${fyStartYear}-04-01`, $lte: `${targetYear}-${String(targetMonthNum).padStart(2, '0')}-31` }
            });
            const totalEarnedCCL = earnedCCLs.reduce((sum, req) => sum + (req.isHalfDay ? 0.5 : 1), 0);

            // 4. Get Used CLs in this Financial Year up to target month
            // We look at MonthlyLeaveRecord for efficiency, or sum up individual leaves
            const usedLeaves = await Leave.find({
                employeeId: emp._id,
                status: 'approved',
                leaveType: 'CL',
                isActive: true,
                fromDate: { $gte: fyStartDate },
                toDate: { $lte: createISTDate(`${targetYear}-${String(targetMonthNum).padStart(2, '0')}-31`) }
            });

            const totalUsedCL = usedLeaves.reduce((sum, leave) => sum + leave.numberOfDays, 0);

            // 5. Calculate Current Month Usage
            const currentMonthUsedCL = usedLeaves.filter(leave => {
                const { dateStr } = extractISTComponents(leave.fromDate);
                return dateStr.startsWith(currentMonthStr);
            }).reduce((sum, leave) => sum + leave.numberOfDays, 0);

            // 6. Calculate Carry Forward (Everything but current month)
            const cumulativePoolBeforeThisMonth = (monthlyAccrual * (monthsElapsed - 1)) + totalEarnedCCL;
            // Note: This is simplified; true CF needs to subtract usage from previous months correctly.
            // Let's do it better:
            const totalUsedBeforeThisMonth = totalUsedCL - currentMonthUsedCL;
            const carryForward = Math.max(0, (monthlyAccrual * (monthsElapsed - 1)) + totalEarnedCCL - totalUsedBeforeThisMonth);

            // 7. Final CL Balance
            const netCLAvailable = Math.max(0, totalAccruedSoFar + totalEarnedCCL - totalUsedCL);

            results.push({
                employee: {
                    id: emp._id,
                    name: emp.employee_name,
                    emp_no: emp.emp_no,
                    division: emp.division_id?.name,
                    department: emp.department_id?.name,
                },
                casualLeave: {
                    carryForward,
                    accruedThisMonth: currentMonthNewAccrual,
                    earnedCCL: totalEarnedCCL, // Total earned in FY
                    usedThisMonth: currentMonthUsedCL,
                    totalUsedInFY: totalUsedCL,
                    balance: netCLAvailable,
                    maxUsageLimit: maxClPerMonth
                },
                earnedLeave: {
                    balance: emp.paidLeaves || 0
                },
                compensatoryOff: {
                    balance: emp.compensatoryOffs || 0 // Currently maintained in Employee model
                },
                totalPaidBalance: netCLAvailable + (emp.paidLeaves || 0) + (emp.compensatoryOffs || 0)
            });
        }

        return results;
    } catch (error) {
        console.error('Error calculating leave register:', error);
        throw error;
    }
}

module.exports = {
    getLeaveRegister
};
