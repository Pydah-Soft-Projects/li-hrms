const PayRegisterSummary = require('../model/PayRegisterSummary');
const Employee = require('../../employees/model/Employee');
const { populatePayRegisterFromSources, getAllDatesInMonth } = require('./autoPopulationService');
const { calculateTotals } = require('./totalsCalculationService');
const mongoose = require('mongoose');

/**
 * Summary Upload Service
 * Handles bulk uploading of monthly summaries and distributing them across daily records
 */

/**
 * Process bulk upload of monthly summaries
 * @param {String} month - Month in YYYY-MM format
 * @param {Array} rows - Array of objects from Excel
 * @param {String} userId - ID of user performing upload
 * @returns {Object} Result summary
 */
async function processSummaryBulkUpload(month, rows, userId) {
    const [year, monthNum] = month.split('-').map(Number);
    const results = {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [],
    };

    for (const row of rows) {
        try {
            const empNo = row['Employee Code']?.toString()?.trim();
            if (!empNo) {
                results.failed++;
                results.errors.push(`Row ${rows.indexOf(row) + 1}: Missing Employee Code`);
                continue;
            }

            // 1. Find employee
            const employee = await Employee.findOne({ emp_no: empNo })
                .populate('department_id', 'name')
                .populate('division_id', 'name');

            if (!employee) {
                results.failed++;
                results.errors.push(`Employee ${empNo}: Not found in system`);
                continue;
            }

            // 2. Optional validation (Dept/Div)
            const excelDept = row['Department']?.toString()?.trim();
            const excelDiv = row['Division']?.toString()?.trim();

            if (excelDept && employee.department_id?.name && excelDept.toLowerCase() !== employee.department_id.name.toLowerCase()) {
                // Log warning but continue? Or fail? Let's proceed but note it if needed.
            }

            // 3. Get or Create Pay Register
            let payRegister = await PayRegisterSummary.findOne({ employeeId: employee._id, month });

            if (!payRegister) {
                const dailyRecords = await populatePayRegisterFromSources(employee._id, employee.emp_no, year, monthNum);
                payRegister = new PayRegisterSummary({
                    employeeId: employee._id,
                    emp_no: employee.emp_no,
                    month,
                    monthName: new Date(year, monthNum - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
                    year,
                    monthNumber: monthNum,
                    totalDaysInMonth: new Date(year, monthNum, 0).getDate(),
                    dailyRecords,
                    status: 'draft',
                });
            }

            // 4. Reset Daily Records for counts but preserve Holiday/Weekoff
            // We want to keep the "Off" days fixed so we don't accidentally fill work there.
            const workingDates = [];
            payRegister.dailyRecords.forEach(dr => {
                const status = dr.status || dr.firstHalf?.status;
                if (status !== 'holiday' && status !== 'week_off') {
                    workingDates.push(dr.date);
                    // Set to default absent before distributing
                    dr.status = 'absent';
                    dr.firstHalf.status = 'absent';
                    dr.secondHalf.status = 'absent';
                    dr.isSplit = false;
                    dr.leaveType = null;
                    dr.leaveNature = null;
                    dr.isOD = false;
                }
            });

            // 5. Distribute statuses sequentially
            let currentIndex = 0;

            const distribute = (count, status, leaveNature = null) => {
                let remaining = Number(count) || 0;
                while (remaining > 0 && currentIndex < workingDates.length) {
                    const date = workingDates[currentIndex];
                    const dr = payRegister.dailyRecords.find(d => d.date === date);

                    if (remaining >= 1) {
                        dr.status = status;
                        dr.firstHalf.status = status;
                        dr.secondHalf.status = status;
                        if (status === 'leave') {
                            dr.leaveNature = leaveNature;
                            dr.firstHalf.leaveNature = leaveNature;
                            dr.secondHalf.leaveNature = leaveNature;
                        }
                        if (status === 'od') dr.isOD = true;
                        remaining -= 1;
                    } else {
                        // Half day logic
                        dr.isSplit = true;
                        dr.firstHalf.status = status;
                        if (status === 'leave') dr.firstHalf.leaveNature = leaveNature;
                        if (status === 'od') dr.firstHalf.isOD = true;
                        remaining = 0;
                    }
                    currentIndex++;
                }
            };

            // Order of distribution priority: OD > Present > Paid Leave > LOP > Absent
            // Note: Total OD is a SUBSET of Total Present. 
            // We distribute OD first, then only the remaining 'Pure Present' days.
            const totalODCount = Number(row['Total OD']) || 0;
            const totalPresentInput = Number(row['Total Present']) || 0;
            const remainingPresent = Math.max(0, totalPresentInput - totalODCount);

            distribute(totalODCount, 'od');
            distribute(remainingPresent, 'present');
            distribute(row['Paid Leaves'], 'leave', 'paid');
            distribute(row['LOP Count'], 'leave', 'lop');
            distribute(row['Holidays'] || row['Holidays & Weekoffs'], 'holiday');
            distribute(row['Total Absent'], 'absent');

            // 6. Update other metrics
            payRegister.set('totals.totalOTHours', Number(row['Total OT Hours']) || 0);
            payRegister.set('totals.lateCount', Number(row['Lates']) || 0);

            // Handle shift-based incentive units (Extra Days)
            const extraDays = Number(row['Total Extra Days']) || 0;
            const totalPresent = Number(row['Total Present']) || 0;
            const totalOD = Number(row['Total OD']) || 0;
            const paidLeaves = Number(row['Paid Leaves']) || 0;

            // 7. Finalize
            payRegister.lastEditedBy = userId;
            payRegister.lastEditedAt = new Date();
            payRegister.recalculateTotals();

            // Store manually uploaded extra days for persistent incentive calculation
            payRegister.set('totals.extraDays', extraDays);

            // Recalculate will now include extraDays into totalPayableShifts automatically
            payRegister.recalculateTotals();

            // Override absents if explicitly provided to ensure audit parity
            if (row['Total Absent'] !== undefined) {
                payRegister.set('totals.totalAbsentDays', Number(row['Total Absent']) || 0);
            }

            await payRegister.save();

            results.success++;
        } catch (err) {
            results.failed++;
            results.errors.push(`Row ${rows.indexOf(row) + 1}: ${err.message}`);
        }
    }

    return results;
}

module.exports = {
    processSummaryBulkUpload,
};
