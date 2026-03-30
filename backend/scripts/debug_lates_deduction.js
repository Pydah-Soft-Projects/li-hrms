const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

/**
 * Usage (from backend folder):
 *   node scripts/debug_lates_deduction.js <empNo> <YYYY-MM>
 *   node scripts/debug_lates_deduction.js <empNo> <YYYY-MM-DD> <YYYY-MM-DD>
 *   node scripts/debug_lates_deduction.js <empNo> <YYYY-MM-DD>..<YYYY-MM-DD>
 *
 * Examples:
 *   node scripts/debug_lates_deduction.js 1832 2026-03
 *   node scripts/debug_lates_deduction.js 1832 2026-02-26 2026-03-25
 *   node scripts/debug_lates_deduction.js 1832 2026-02-26..2026-03-25
 *
 * Date-range mode: AttendanceDaily + contributing-date slices use the inclusive range.
 * Stored monthly summary + live deduction still use the payroll month derived from the
 * range END date (same key as calculateMonthlySummary). If the range crosses two pay
 * months, a warning is printed — run once per cycle if you need both summaries.
 */

// Configuration
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/li-hrms';

function isYmd(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}
function isYm(s) {
    return /^\d{4}-\d{2}$/.test(String(s || '').trim());
}

/** @returns {{ start: string, end: string } | null} */
function parseInclusiveDateRange(arg3, arg4) {
    const a3 = String(arg3 || '').trim();
    if (!a3) return null;
    if (a3.includes('..')) {
        const [left, right] = a3.split('..').map((x) => String(x || '').trim());
        if (isYmd(left) && isYmd(right)) return { start: left, end: right };
        return null;
    }
    if (isYmd(a3) && isYmd(arg4)) return { start: a3, end: String(arg4).trim() };
    return null;
}

function filterByDateRange(entries, startStr, endStr) {
    if (!Array.isArray(entries)) return [];
    return entries.filter((d) => {
        const dateStr = typeof d === 'string' ? d : d?.date;
        return dateStr && dateStr >= startStr && dateStr <= endStr;
    });
}

/** Match payroll deductionService: combined = late_instances + early_instances (same day can add both). */
function lateEarlyDaysFromCombined(combinedIncidents, rules, perDayBasicPay = 0) {
    if (!rules?.combinedCountThreshold || !rules?.deductionType) {
        return { days: 0, effective: 0, multiplier: 0, remainder: 0 };
    }
    const threshold = Number(rules.combinedCountThreshold);
    const free = rules.freeAllowedPerMonth != null ? Number(rules.freeAllowedPerMonth) : 0;
    const effective = Math.max(0, combinedIncidents - free);
    if (effective < threshold) {
        return { days: 0, effective, multiplier: 0, remainder: effective };
    }
    const multiplier = Math.floor(effective / threshold);
    const remainder = effective % threshold;
    const mode = rules.calculationMode || 'floor';
    let days = 0;
    if (rules.deductionType === 'half_day') {
        days = multiplier * 0.5;
        if (mode === 'proportional' && remainder > 0 && threshold > 0) {
            days += (remainder / threshold) * 0.5;
        }
    } else if (rules.deductionType === 'full_day') {
        days = multiplier * 1;
        if (mode === 'proportional' && remainder > 0 && threshold > 0) {
            days += (remainder / threshold) * 1;
        }
    } else if (rules.deductionType === 'custom_days' && rules.deductionDays != null && rules.deductionDays > 0) {
        const d = Number(rules.deductionDays);
        days = multiplier * d;
        if (mode === 'proportional' && remainder > 0 && threshold > 0) {
            days += (remainder / threshold) * d;
        }
    } else if (rules.deductionType === 'custom_amount' && rules.deductionAmount && perDayBasicPay > 0) {
        const amt = Number(rules.deductionAmount);
        days = (multiplier * amt) / perDayBasicPay;
        if (mode === 'proportional' && remainder > 0 && threshold > 0) {
            days += ((remainder / threshold) * amt) / perDayBasicPay;
        }
    }
    return {
        days: Math.round(days * 100) / 100,
        effective,
        multiplier,
        remainder,
    };
}

async function run() {
    const empNo = process.argv[2] || '2067';
    const arg3 = process.argv[3];
    const arg4 = process.argv[4];

    let monthStr;
    let rangeStartStr;
    let rangeEndStr;
    let rangeMode = false;

    try {
        await mongoose.connect(MONGO_URI);

        const dateCycleService = require('../leaves/services/dateCycleService');

        const explicitRange = parseInclusiveDateRange(arg3, arg4);
        if (String(arg3 || '').includes('..') && !explicitRange) {
            console.error('ERROR: Invalid date range. Use YYYY-MM-DD..YYYY-MM-DD (inclusive).');
            process.exit(1);
        }
        if (explicitRange) {
            rangeMode = true;
            rangeStartStr = explicitRange.start;
            rangeEndStr = explicitRange.end;
            if (rangeStartStr > rangeEndStr) {
                console.error('ERROR: START date must be <= END date.');
                process.exit(1);
            }
            const pEnd = await dateCycleService.getPeriodInfo(new Date(`${rangeEndStr}T12:00:00+05:30`));
            const pStart = await dateCycleService.getPeriodInfo(new Date(`${rangeStartStr}T12:00:00+05:30`));
            const key = (pc) => `${pc.year}-${String(pc.month).padStart(2, '0')}`;
            const monthKeyEnd = key(pEnd.payrollCycle);
            const monthKeyStart = key(pStart.payrollCycle);
            monthStr = monthKeyEnd;
            if (monthKeyStart !== monthKeyEnd) {
                console.warn(
                    `[!] Range spans two payroll summary months (${monthKeyStart} vs ${monthKeyEnd}). Using END month ${monthStr} for stored summary / live deduction. Re-run with ranges inside one cycle if needed.\n`
                );
            }
        } else {
            monthStr = isYm(arg3) ? String(arg3).trim() : '2026-03';
            const [y, m] = monthStr.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            rangeStartStr = `${monthStr}-01`;
            rangeEndStr = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
        }

        console.log(`\n=============================================================`);
        console.log(`   ATTENDANCE DEDUCTION DEBUGGER`);
        console.log(`   Employee: ${empNo} | Summary month key: ${monthStr}`);
        console.log(
            `   Daily slice: ${rangeStartStr} .. ${rangeEndStr}${rangeMode ? ' (date-range mode)' : ' (calendar month)'}`
        );
        console.log(`=============================================================\n`);

        // Models
        const Employee = require('../employees/model/Employee');
        const MonthlyAttendanceSummary = require('../attendance/model/MonthlyAttendanceSummary');
        const deductionService = require('../payroll/services/deductionService');

        // 1. Fetch Employee
        const empNorm = String(empNo).trim().toUpperCase();
        const employee = await Employee.findOne({ emp_no: empNorm }).lean();
        if (!employee) {
            console.error(`ERROR: Employee ${empNorm} not found.`);
            process.exit(1);
        }

        console.log(`[1] EMPLOYEE PROFILE`);
        console.table({
            'Name': employee.employee_name,
            'EMP No': employee.emp_no,
            'Dept ID': employee.department_id?.toString(),
            'Apply Deduc.': employee.applyAttendanceDeduction !== false ? 'YES' : 'NO',
            'Deduct Late': employee.deductLateIn !== false ? 'YES' : 'NO',
            'Deduct Early': employee.deductEarlyOut !== false ? 'YES' : 'NO'
        });

        // 2. Fetch Summary & Calculate Live Breakdown
        const summary = await MonthlyAttendanceSummary.findOne({ 
            employeeId: employee._id, 
            month: monthStr 
        }).lean();

        let storedBreakdown = summary?.attendanceDeductionBreakdown || {};
        let liveBreakdown = {};

        // Recalculate Live Breakdown for comparison
        try {
            const gross = Number(employee.gross_salary) || 0;
            const totalDays = summary?.totalDaysInMonth || 30;
            const perDayBasicPay = Math.round((gross / totalDays) * 100) / 100;
            
            // We need to fetch absent settings for the live call
            const DepartmentSettings = require('../departments/model/DepartmentSettings');
            const AttendanceDeductionSettings = require('../attendance/model/AttendanceDeductionSettings');
            
            const deptSettings = await DepartmentSettings.getByDeptAndDiv(employee.department_id, employee.division_id);
            const globalSettings = await AttendanceDeductionSettings.getActiveSettings();
            
            const lopDaysPerAbsent = deptSettings?.attendance?.absentDeductionRules?.lopDaysPerAbsent ?? 1;
            const enableAbsentDeduction = deptSettings?.attendance?.absentDeductionRules?.enableAbsentDeduction ?? false;

            const attDed = await deductionService.calculateAttendanceDeduction(
                employee._id,
                monthStr,
                employee.department_id,
                perDayBasicPay,
                employee.division_id,
                {
                    absentDays: summary?.totalAbsentDays || 0,
                    enableAbsentDeduction: enableAbsentDeduction,
                    lopDaysPerAbsent: lopDaysPerAbsent,
                    employee: employee
                }
            );
            liveBreakdown = attDed.breakdown || {};
        } catch (e) {
            console.warn(`[!] Live deduction calculation failed: ${e.message}`);
        }

        if (!summary) {
            console.warn(`\n[!] Monthly summary not found for ${monthStr}. Please run recalculation first.\n`);
        } else {
            console.log(`\n[2] MONTHLY ATTENDANCE SUMMARY (STORED)`);
            console.table({
                'Present Days': summary.totalPresentDays,
                'OD Days': summary.totalODs,
                'LOP Days (Absents)': summary.totalAbsentDays,
                'Extra Penalty (Absents)': summary.absentExtraDays || 0,
                'Lates Count': summary.lateInCount,
                'Combined Count': summary.lateOrEarlyCount
            });

            console.log(`\n[3] DEDUCTION CALCULATION BREAKDOWN (STORED)`);
            console.table({
                'Threshold (N)': storedBreakdown.combinedCountThreshold || 'N/A',
                'Free Allowed': storedBreakdown.freeAllowedPerMonth || 0,
                'Effective Count': storedBreakdown.effectiveCount || 0,
                'Deduction Type': storedBreakdown.deductionType || 'None',
                'Days Deducted': storedBreakdown.daysDeducted || 0
            });

            if (summary.contributingDates && summary.contributingDates.absent?.length > 0) {
                const absentInRange = filterByDateRange(summary.contributingDates.absent, rangeStartStr, rangeEndStr);
                console.log(`\n[4] CONTRIBUTING DATES (ABSENCES) — within ${rangeStartStr} .. ${rangeEndStr}`);
                if (absentInRange.length === 0) {
                    console.log('   (none in this date slice; full month may still have absences)');
                } else {
                    console.table(
                        absentInRange.map((d) => ({
                            Date: d.date,
                            Value: d.value,
                            Label: d.label,
                        }))
                    );
                }
            }

            if (summary.contributingDates && summary.contributingDates.lateIn?.length > 0) {
                const latesInRange = filterByDateRange(summary.contributingDates.lateIn, rangeStartStr, rangeEndStr);
                console.log(`\n[5] CONTRIBUTING DATES (LATE-INS REPORTED) — within ${rangeStartStr} .. ${rangeEndStr}`);
                if (latesInRange.length === 0) {
                    console.log('   (none in this date slice)');
                } else {
                    console.table(
                        latesInRange.map((d) => ({
                            Date: d.date,
                            'Late (Mins)': d.value,
                            Label: d.label,
                        }))
                    );
                }
            }
        }

        // 3. Fetch Resolved Rules (Live)
        console.log(`\n[6] ACTIVE DEDUCTION SETTINGS (LIVE SYSTEM)`);
        const rules = await deductionService.getResolvedAttendanceDeductionRules(
            employee.department_id, 
            employee.division_id
        );

        // Fetch Department Settings (for Absents)
        const DepartmentSettings = require('../departments/model/DepartmentSettings');
        const deptSettings = await DepartmentSettings.getByDeptAndDiv(employee.department_id, employee.division_id);
        const lopDaysPerAbsent = deptSettings?.attendance?.absentDeductionRules?.lopDaysPerAbsent ?? 1;
        const enableAbsentDeduction = deptSettings?.attendance?.absentDeductionRules?.enableAbsentDeduction ?? false;
        
        console.table({
            'Threshold': rules.combinedCountThreshold || 'Not Configured',
            'Deduc. Type': rules.deductionType || 'No Deduction',
            'Absent Extra Penalty': enableAbsentDeduction ? `EXTRA ${(lopDaysPerAbsent - 1)} per absent` : 'None',
            'Total LOP per Absent': enableAbsentDeduction ? lopDaysPerAbsent : '1 (Standard)'
        });

        const AttendanceDaily = require('../attendance/model/AttendanceDaily');
        const dailyRecords = await AttendanceDaily.find({
            employeeNumber: empNorm,
            date: { $gte: rangeStartStr, $lte: rangeEndStr },
        })
            .select('date status totalLateInMinutes totalEarlyOutMinutes lateInWaved earlyOutWaved')
            .lean();

        const lateDates = dailyRecords
            .filter((r) => r.status === 'PRESENT' && (Number(r.totalLateInMinutes) || 0) > 0 && !r.lateInWaved)
            .map((r) => `${r.date}`);
        const earlyDates = dailyRecords
            .filter((r) => r.status === 'PRESENT' && (Number(r.totalEarlyOutMinutes) || 0) > 0 && !r.earlyOutWaved)
            .map((r) => `${r.date}`);
        const skippedLates = dailyRecords
            .filter((r) => r.status !== 'PRESENT' && (Number(r.totalLateInMinutes) || 0) > 0 && !r.lateInWaved)
            .map((r) => `${r.date} (${r.status})`);

        // 4. Unified Analysis Table
        console.log(`\n[7] UNIFIED DEDUCTION AUDIT`);
        const unifiedData = [
            { 'Feature': 'Lates Count', 'Summary (Stored)': summary?.lateInCount || 0, 'Live Logic (Recalculated)': liveBreakdown.lateInsCount || 0, 'Status': summary?.lateInCount === liveBreakdown.lateInsCount ? 'OK' : 'MISMATCH' },
            { 'Feature': 'Early Count', 'Summary (Stored)': summary?.earlyOutCount || 0, 'Live Logic (Recalculated)': liveBreakdown.earlyOutsCount || 0, 'Status': summary?.earlyOutCount === liveBreakdown.earlyOutsCount ? 'OK' : 'MISMATCH' },
            { 'Feature': 'Combined Count', 'Summary (Stored)': summary?.lateOrEarlyCount || 0, 'Live Logic (Recalculated)': liveBreakdown.combinedCount || 0, 'Status': summary?.lateOrEarlyCount === liveBreakdown.combinedCount ? 'OK' : 'MISMATCH' },
            { 'Feature': 'Effective Count', 'Stored': storedBreakdown.effectiveCount || 0, 'Live Logic (Recalculated)': liveBreakdown.effectiveCount || 0, 'Status': storedBreakdown.effectiveCount === liveBreakdown.effectiveCount ? 'OK' : 'MISMATCH' },
            { 'Feature': 'Threshold (N)', 'Stored': storedBreakdown.combinedCountThreshold || 'N/A', 'Live Logic (Recalculated)': liveBreakdown.combinedCountThreshold || 'N/A', 'Status': '-' },
            { 'Feature': 'Late/Early Ded (Days)', 'Stored': storedBreakdown.lateEarlyDaysDeducted || 0, 'Live Logic (Recalculated)': liveBreakdown.lateEarlyDaysDeducted || 0, 'Status': '-' },
            { 'Feature': 'Absent Days', 'Summary (Stored)': summary?.totalAbsentDays || 0, 'Live Logic (Recalculated)': liveBreakdown.absentDays || 0, 'Status': summary?.totalAbsentDays === liveBreakdown.absentDays ? 'OK' : 'MISMATCH' },
            { 'Feature': 'Absent Extra (Days)', 'Stored': storedBreakdown.absentExtraDays || 0, 'Live Logic (Recalculated)': liveBreakdown.absentExtraDays || 0, 'Status': '-' },
            { 'Feature': 'TOTAL DEDUCTION (DAYS)', 'Summary (Stored)': summary?.totalAttendanceDeductionDays || 0, 'Live Logic (Recalculated)': liveBreakdown.daysDeducted || 0, 'Status': summary?.totalAttendanceDeductionDays === liveBreakdown.daysDeducted ? 'OK' : 'MISMATCH' }
        ];
        console.table(unifiedData);

        if (summary?.lateInCount !== liveBreakdown.lateInsCount || summary?.earlyOutCount !== liveBreakdown.earlyOutsCount) {
             console.log(`\n[!] WARNING: Mismatch detected between stored counts and live logic.`);
             console.log(`    This can happen if lates are on HALF_DAY records (currently skipped in summary).`);
             console.log(
                `    Please run recalculation: node recalculate_attendance.js ${empNorm} ${rangeStartStr}..${rangeEndStr}`
            );
        }

        // 5. Projection tables (payroll uses combined = late_instances + early_instances)
        console.log(`\n[8] DEDUCTION SIMULATION — LATES ONLY (early-outs treated as 0)`);
        console.log(
            `    Row "3" means combined incident count = 3 from lates alone, NOT "3 late dates while also having earlies".`
        );
        console.log(`    Use [8b] for true combined totals (late + early), same as payroll.`);
        if (rules.combinedCountThreshold && rules.deductionType) {
            const simulation = [];
            const threshold = Number(rules.combinedCountThreshold);
            const free = rules.freeAllowedPerMonth != null ? Number(rules.freeAllowedPerMonth) : 0;

            for (let i = 1; i <= 5; i++) {
                const { days, effective } = lateEarlyDaysFromCombined(i, rules);
                simulation.push({
                    'Lates only': i,
                    'Combined (=col1)': i,
                    'Free Allowed': free,
                    Effective: effective,
                    Threshold: threshold,
                    'Deducted Days': days,
                    Note: 'early-outs=0; real payroll adds earlies → [8b]',
                });
            }
            console.table(simulation);
        } else {
            console.log('Skipping simulation: Threshold or Deduction Type not configured.');
        }

        console.log(`\n[8b] DEDUCTION SIMULATION — COMBINED (late + early incidents, payroll formula)`);
        if (rules.combinedCountThreshold && rules.deductionType) {
            const threshold = Number(rules.combinedCountThreshold);
            const free = rules.freeAllowedPerMonth != null ? Number(rules.freeAllowedPerMonth) : 0;
            const combinedSim = [];
            for (let c = 1; c <= 10; c++) {
                const { days, effective } = lateEarlyDaysFromCombined(c, rules);
                combinedSim.push({
                    Combined: c,
                    'Free Allowed': free,
                    Effective: effective,
                    Threshold: threshold,
                    'Deducted Days': days,
                });
            }
            console.table(combinedSim);
        } else {
            console.log('Skipping [8b]: Threshold or Deduction Type not configured.');
        }

        console.log(`\n=============================================================`);
        console.log(`>>> FINAL AUDIT RESULT FOR EMP ${empNorm} (${monthStr}, dailies ${rangeStartStr}–${rangeEndStr}) <<<`);

        const sliceCombinedFinal = lateDates.length + earlyDates.length;
        const sliceDeductionDays = lateEarlyDaysFromCombined(sliceCombinedFinal, rules).days;

        // Counts must match the date lines below: these are from the daily slice only.
        // liveBreakdown.lateInsCount / earlyOutsCount are full-month payroll logic (see [7]), not this range.
        console.log(
            `Lates Detected (PRESENT only, in ${rangeStartStr}–${rangeEndStr}): ${lateDates.length}`
        );
        if (lateDates.length > 0) console.log(`   Dates: ${lateDates.join(', ')}`);

        if (skippedLates.length > 0) {
            console.log(`Lates Ignored (Non-PRESENT): ${skippedLates.length}`);
            console.log(`   Dates: ${skippedLates.join(', ')}`);
        }

        console.log(
            `Early-Outs Detected (PRESENT only, in ${rangeStartStr}–${rangeEndStr}): ${earlyDates.length}`
        );
        if (earlyDates.length > 0) console.log(`   Dates: ${earlyDates.join(', ')}`);

        console.log(
            `Slice-based late/early deduction (same formula, PRESENT rows in range): combined ${sliceCombinedFinal} → ${sliceDeductionDays} days`
        );
        console.log(
            `Live payroll line (full month ${monthStr}, attendance_logs source): combined ${liveBreakdown.combinedCount ?? 'n/a'} → ${liveBreakdown.daysDeducted || 0} days`
        );
        const liveLateEarlyOnly = Number(liveBreakdown.lateEarlyDaysDeducted ?? 0);
        if (Math.abs(sliceDeductionDays - liveLateEarlyOnly) > 0.001) {
            console.log(
                `    ↑ vs live late/early-only (${liveLateEarlyOnly} d): slice combined uses PRESENT dailies in range; live uses full-month logs (see [7]).`
            );
        }
        console.log(`=============================================================\n`);

    } catch (error) {
        console.error('Execution failed:', error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
