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
 * Process a bulk upload of monthly attendance summaries and apply them to each employee's pay register.
 * @param {String} month - Month in "YYYY-MM" format (e.g., "2024-07").
 * @param {Array<Object>} rows - Array of row objects from the uploaded sheet; keys may vary (function matches common variants).
 * @param {String} userId - ID of the user performing the upload; recorded as last editor on updated pay registers.
 * @returns {Object} Summary of the upload with fields:
 *  - total {number} - Number of rows processed.
 *  - success {number} - Number of rows successfully applied/saved.
 *  - failed {number} - Number of rows that failed processing.
 *  - errors {Array<string>} - Per-row error messages describing failures.
 */
async function processSummaryBulkUpload(month, rows, userId) {
    const [year, monthNum] = month.split('-').map(Number);
    const results = {
        total: rows.length,
        success: 0,
        failed: 0,
        errors: [],
    };

    // Helper to find value in row by various possible key names (case-insensitive, trimmed)
    const getValue = (row, variants) => {
        const keys = Object.keys(row);
        for (const variant of variants) {
            const match = keys.find(k => k.trim().toLowerCase() === variant.toLowerCase());
            if (match !== undefined) return row[match];
        }
        return undefined;
    };

    for (const row of rows) {
        try {
            const empNo = getValue(row, ['Employee Code', 'Emp Code', 'Emp No'])?.toString()?.trim();
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

            // 4. Identify Working and Off Days
            const workingDates = [];
            const offDates = []; // Holidays and Week-offs

            payRegister.dailyRecords.forEach(dr => {
                // RESET EVERY record before distributing new totals to prevent accumulation
                dr.isLate = false;
                dr.isEarlyOut = false;
                dr.otHours = 0;
                dr.remarks = null;
                dr.isManuallyEdited = false;

                const status = dr.status || dr.firstHalf?.status;
                if (status === 'holiday' || status === 'week_off') {
                    offDates.push({ date: dr.date, originalStatus: status });
                } else {
                    workingDates.push(dr.date);
                    // Reset working days to default absent before distributing
                    dr.status = 'absent';
                    dr.firstHalf.status = 'absent';
                    dr.secondHalf.status = 'absent';
                    dr.isSplit = false;
                    dr.leaveType = null;
                    dr.leaveNature = null;
                    dr.isOD = false;
                }
            });

            // 5. Extract values from Excel using robust matching
            const totalODCount = Number(getValue(row, ['Total OD', 'OD Days', 'OD'])) || 0;
            const totalPresentInput = Number(getValue(row, ['Total Present', 'Present Days', 'Present'])) || 0;
            const paidLeaves = Number(getValue(row, ['Paid Leaves', 'Paid Leave'])) || 0;
            const lopCount = Number(getValue(row, ['LOP Count', 'LOP'])) || 0;
            const totalAbsent = Number(getValue(row, ['Total Absent', 'Absent Days', 'Absent'])) || 0;
            const holidayCount = Number(getValue(row, ['Holidays', 'Holiday Count', 'Holidays & Weekoffs'])) || 0;
            const lateCountRaw = Number(getValue(row, ['Lates', 'Late Count', 'Late'])) || 0;
            const otHoursTotal = Number(getValue(row, ['Total OT Hours', 'OT Hours', 'OT'])) || 0;
            const extraDaysValue = Number(getValue(row, ['Total Extra Days', 'Extra Days', 'Extra'])) || 0;

            // 6. Distribute statuses sequentially
            let workingIndex = 0;
            let offIndex = 0;

            const distribute = (count, status, leaveNature = null) => {
                let remaining = Number(count) || 0;

                // First pass: Fill working days
                while (remaining > 0 && workingIndex < workingDates.length) {
                    const date = workingDates[workingIndex];
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
                        if (status === 'od') {
                            dr.isOD = true;
                            dr.firstHalf.isOD = true;
                            dr.secondHalf.isOD = true;
                        }
                        remaining -= 1;
                    } else {
                        // Half day logic
                        dr.isSplit = true;
                        dr.firstHalf.status = status;
                        if (status === 'leave') dr.firstHalf.leaveNature = leaveNature;
                        if (status === 'od') dr.firstHalf.isOD = true;
                        remaining = 0;
                    }
                    workingIndex++;
                }

                // Second pass: Overflow into Holidays/Week-offs (only for 'present' or 'od')
                if (remaining > 0 && (status === 'present' || status === 'od')) {
                    while (remaining > 0 && offIndex < offDates.length) {
                        const { date, originalStatus } = offDates[offIndex];
                        const dr = payRegister.dailyRecords.find(d => d.date === date);
                        const label = originalStatus === 'holiday' ? 'Holiday' : 'Week Off';

                        if (remaining >= 1) {
                            dr.status = 'present';
                            dr.firstHalf.status = 'present';
                            dr.secondHalf.status = 'present';
                            if (status === 'od') dr.isOD = true;

                            const remark = `Worked on ${label} (Uploaded)`;
                            dr.remarks = dr.remarks ? `${dr.remarks} | ${remark}` : remark;
                            dr.isManuallyEdited = true;

                            remaining -= 1;
                        } else {
                            // Half day overflow
                            dr.isSplit = true;
                            dr.firstHalf.status = 'present';
                            if (status === 'od') dr.firstHalf.isOD = true;

                            const remark = `Worked half-day on ${label} (Uploaded)`;
                            dr.remarks = dr.remarks ? `${dr.remarks} | ${remark}` : remark;
                            dr.isManuallyEdited = true;

                            remaining = 0;
                        }
                        offIndex++;
                    }
                }

                return remaining;
            };

            const remainingPresent = Math.max(0, totalPresentInput - totalODCount);

            distribute(totalODCount, 'od');
            distribute(remainingPresent, 'present');
            distribute(paidLeaves, 'leave', 'paid');
            distribute(lopCount, 'leave', 'lop');

            // 7. Handle Manual Holiday Assignment (If roster was empty but Excel provides them)
            if (holidayCount > 0 && offDates.length === 0) {
                distribute(holidayCount, 'holiday');
            }

            distribute(totalAbsent, 'absent');

            // 8. Handle Late Count Persistence
            if (lateCountRaw > 0) {
                let latesToApply = lateCountRaw;
                // Distribute lates across 'present' or 'od' records
                for (const dr of payRegister.dailyRecords) {
                    if (latesToApply <= 0) break;

                    const isFullPresent = dr.status === 'present' || dr.status === 'od';
                    const isHalfPresent = dr.isSplit && (dr.firstHalf.status === 'present' || dr.secondHalf.status === 'present');

                    if (isFullPresent || isHalfPresent) {
                        dr.isLate = true;
                        const remark = "Late Arrival (Uploaded)";
                        dr.remarks = dr.remarks ? `${dr.remarks} | ${remark}` : remark;
                        latesToApply -= 1;
                    }
                }
            }

            // 9. Handle OT Hours Persistence
            if (otHoursTotal > 0) {
                const targetRecord = payRegister.dailyRecords.find(dr =>
                    dr.status === 'present' || dr.status === 'od' ||
                    (dr.isSplit && (dr.firstHalf.status === 'present' || dr.secondHalf.status === 'present'))
                );
                if (targetRecord) {
                    targetRecord.otHours = otHoursTotal;
                }
            }

            // 10. Finalize with robust recalculation
            payRegister.lastEditedBy = userId;
            payRegister.lastEditedAt = new Date();

            // Recalculate will aggregate based on marks
            payRegister.recalculateTotals();

            // Set final manual overrides
            payRegister.set('totals.extraDays', extraDaysValue);

            // Final aggregate pass
            payRegister.recalculateTotals();

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