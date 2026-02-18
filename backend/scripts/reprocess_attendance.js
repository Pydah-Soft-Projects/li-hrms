/**
 * ============================================================
 * ATTENDANCE FULL REPROCESSING SCRIPT
 * ============================================================
 * Reprocesses ALL attendance daily records from raw punch logs.
 * 
 * What it does for each employee/date:
 *   1. Fetches raw punch logs (IN/OUT) from AttendanceRawLog
 *   2. Re-runs processMultiShiftAttendance:
 *      - Shift detection (closest shift matching)
 *      - Late-in calculation (IST-corrected)
 *      - Early-out calculation (IST-corrected)
 *      - Working hours, status (PRESENT/HALF_DAY/ABSENT)
 *      - Payable shift calculation
 *   3. Re-runs recalculateOnAttendanceUpdate → monthly summary
 * 
 * Usage:
 *   node scripts/reprocess_attendance.js
 *   node scripts/reprocess_attendance.js --from 2024-01-01 --to 2024-05-31
 *   node scripts/reprocess_attendance.js --employee EMP001
 *   node scripts/reprocess_attendance.js --dry-run   (preview only, no DB writes)
 * ============================================================
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : null;
};
const DRY_RUN = args.includes('--dry-run');
const FROM_DATE = getArg('--from');   // YYYY-MM-DD, optional
const TO_DATE = getArg('--to');     // YYYY-MM-DD, optional
const EMP_FILTER = getArg('--employee'); // single employee number, optional
const BATCH_SIZE = parseInt(getArg('--batch') || '20'); // employees per batch

// ── Connect ───────────────────────────────────────────────────
const MONGO_URI = 'mongodb://localhost:27017/li-hrms';

async function main() {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║        ATTENDANCE FULL REPROCESSING SCRIPT           ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');

    if (DRY_RUN) console.log('⚠️  DRY RUN MODE — No changes will be saved to DB\n');
    if (FROM_DATE) console.log(`📅 From: ${FROM_DATE}`);
    if (TO_DATE) console.log(`📅 To:   ${TO_DATE}`);
    if (EMP_FILTER) console.log(`👤 Employee filter: ${EMP_FILTER}`);
    console.log(`📦 Batch size: ${BATCH_SIZE} employees\n`);

    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const AttendanceRawLog = require('../attendance/model/AttendanceRawLog');
    const AttendanceDaily = require('../attendance/model/AttendanceDaily');
    const Settings = require('../settings/model/Settings');
    const { processMultiShiftAttendance } = require('../attendance/services/multiShiftProcessingService');
    const { recalculateOnAttendanceUpdate } = require('../attendance/services/summaryCalculationService');

    // ── Load global settings ──────────────────────────────────
    const generalConfig = await Settings.getSettingsByCategory('general');
    console.log('⚙️  Global settings loaded:');
    console.log(`   late_in_grace_time:   ${generalConfig.late_in_grace_time ?? 'not set (will use shift default)'} min`);
    console.log(`   early_out_grace_time: ${generalConfig.early_out_grace_time ?? 'not set (will use 15 min default)'} min\n`);

    // ── Build query for raw logs ──────────────────────────────
    const rawLogQuery = {
        $and: [
            {
                $or: [
                    { type: { $in: ['IN', 'OUT'] } },
                    { logType: { $in: ['CHECK-IN', 'CHECK-OUT', 'IN', 'OUT'] } }
                ]
            },
            { timestamp: { $gte: new Date('2020-01-01') } }
        ]
    };
    if (FROM_DATE) rawLogQuery.$and.push({ date: { $gte: FROM_DATE } });
    if (TO_DATE) rawLogQuery.$and.push({ date: { $lte: TO_DATE } });
    if (EMP_FILTER) {
        rawLogQuery.$and.push({
            $or: [
                { employeeNumber: EMP_FILTER.toUpperCase() },
                { employeeId: EMP_FILTER.toUpperCase() }
            ]
        });
    }

    // ── Get distinct employees with logs ─────────────────────
    console.log('🔍 Finding employees with attendance logs...');

    // We need to check both fields for distinct values
    const distinctNumbers = await AttendanceRawLog.distinct('employeeNumber', rawLogQuery);
    const distinctIds = await AttendanceRawLog.distinct('employeeId', rawLogQuery);

    // Combine and unique
    const distinctEmployees = [...new Set([...distinctNumbers, ...distinctIds])].filter(Boolean);
    console.log(`   Found ${distinctEmployees.length} employees to process\n`);

    if (distinctEmployees.length === 0) {
        console.log('⚠️  No employees found. Exiting.');
        await mongoose.disconnect();
        return;
    }

    // ── Stats ─────────────────────────────────────────────────
    const stats = {
        employeesProcessed: 0,
        datesProcessed: 0,
        datesSucceeded: 0,
        datesFailed: 0,
        summariesUpdated: 0,
        errors: [],
        startTime: Date.now(),
    };

    // ── Process in batches ────────────────────────────────────
    for (let batchStart = 0; batchStart < distinctEmployees.length; batchStart += BATCH_SIZE) {
        const batch = distinctEmployees.slice(batchStart, batchStart + BATCH_SIZE);
        const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(distinctEmployees.length / BATCH_SIZE);
        console.log(`\n── Batch ${batchNum}/${totalBatches} (${batch.length} employees) ──────────────────`);

        for (const employeeNumber of batch) {
            try {
                // Get all raw logs for this employee in the date range
                // Use a $or query to handle both employeeNumber and employeeId field inconsistencies
                const empLogQuery = {
                    $or: [
                        { employeeNumber },
                        { employeeId: employeeNumber }
                    ],
                    $or: [
                        { type: { $in: ['IN', 'OUT'] } },
                        { logType: { $in: ['CHECK-IN', 'CHECK-OUT'] } }
                    ],
                    timestamp: { $gte: new Date('2020-01-01') },
                };
                if (FROM_DATE) empLogQuery.date = { ...empLogQuery.date, $gte: FROM_DATE };
                if (TO_DATE) empLogQuery.date = { ...empLogQuery.date, $lte: TO_DATE };

                // Fix $or syntax if multiple $ors exist (need to use $and)
                const finalQuery = {
                    $and: [
                        { $or: [{ employeeNumber }, { employeeId: employeeNumber }] },
                        { $or: [{ type: { $in: ['IN', 'OUT'] } }, { logType: { $in: ['CHECK-IN', 'CHECK-OUT', 'IN', 'OUT'] } }] },
                        { timestamp: { $gte: new Date('2020-01-01') } }
                    ]
                };
                if (FROM_DATE) finalQuery.$and.push({ date: { $gte: FROM_DATE } });
                if (TO_DATE) finalQuery.$and.push({ date: { $lte: TO_DATE } });

                const allLogs = await AttendanceRawLog.find(finalQuery)
                    .sort({ timestamp: 1 })
                    .lean();

                if (allLogs.length === 0) continue;

                // Get distinct dates for this employee
                const dates = [...new Set(allLogs.map(l => l.date))].sort();

                console.log(`\n  👤 ${employeeNumber} — ${dates.length} date(s)`);

                // Track which months need summary recalculation
                const monthsToRecalculate = new Set();

                for (const date of dates) {
                    stats.datesProcessed++;
                    try {
                        if (!DRY_RUN) {
                            // Normalize logs for processMultiShiftAttendance
                            const normalizedLogs = allLogs.map(l => {
                                let type = l.type || (l.logType === 'CHECK-IN' ? 'IN' : 'OUT');
                                return {
                                    timestamp: new Date(l.timestamp),
                                    type: type,
                                    punch_state: type === 'IN' ? 0 : 1,
                                    _id: l._id,
                                };
                            });

                            // Re-run the full processing pipeline for this employee/date
                            const result = await processMultiShiftAttendance(
                                employeeNumber,
                                date,
                                normalizedLogs,
                                generalConfig
                            );

                            if (result.success) {
                                stats.datesSucceeded++;
                                const [y, m] = date.split('-');
                                monthsToRecalculate.add(`${y}-${m}`);
                                process.stdout.write(`    ✅ ${date}`);
                                if (result.shifts && result.shifts.length > 0) {
                                    const s = result.shifts[0];
                                    process.stdout.write(` | ${s.shiftName || 'Unknown'}`);
                                    if (s.lateInMinutes > 0) process.stdout.write(` | Late: ${s.lateInMinutes}min`);
                                    if (s.earlyOutMinutes > 0) process.stdout.write(` | EarlyOut: ${s.earlyOutMinutes}min`);
                                    process.stdout.write(` | ${s.status || '?'}`);
                                }
                                process.stdout.write('\n');
                            } else {
                                stats.datesFailed++;
                                console.log(`    ⚠️  ${date} — ${result.reason || result.error || 'No result'}`);
                            }
                        } else {
                            // Dry run — just show what would be processed
                            const dayLogs = allLogs.filter(l => l.date === date);
                            const ins = dayLogs.filter(l => l.type === 'IN').length;
                            const outs = dayLogs.filter(l => l.type === 'OUT').length;
                            console.log(`    🔍 ${date} — ${ins} IN, ${outs} OUT (dry run)`);
                            stats.datesSucceeded++;
                        }
                    } catch (dateErr) {
                        stats.datesFailed++;
                        const errMsg = `${employeeNumber}/${date}: ${dateErr.message}`;
                        stats.errors.push(errMsg);
                        console.log(`    ❌ ${date} — ${dateErr.message}`);
                    }
                }

                // Recalculate monthly summaries for all affected months
                if (!DRY_RUN && monthsToRecalculate.size > 0) {
                    for (const ym of monthsToRecalculate) {
                        try {
                            // Use any date in that month to trigger recalculation
                            await recalculateOnAttendanceUpdate(employeeNumber, `${ym}-01`);
                            stats.summariesUpdated++;
                            console.log(`    📊 Monthly summary updated: ${ym}`);
                        } catch (summaryErr) {
                            console.log(`    ⚠️  Summary update failed for ${ym}: ${summaryErr.message}`);
                        }
                    }
                }

                stats.employeesProcessed++;
            } catch (empErr) {
                const errMsg = `Employee ${employeeNumber}: ${empErr.message}`;
                stats.errors.push(errMsg);
                console.log(`  ❌ ${employeeNumber} — ${empErr.message}`);
            }
        }
    }

    // ── Final summary ─────────────────────────────────────────
    const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║                    FINAL RESULTS                     ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  Employees processed:   ${String(stats.employeesProcessed).padEnd(28)}║`);
    console.log(`║  Dates processed:       ${String(stats.datesProcessed).padEnd(28)}║`);
    console.log(`║  Dates succeeded:       ${String(stats.datesSucceeded).padEnd(28)}║`);
    console.log(`║  Dates failed:          ${String(stats.datesFailed).padEnd(28)}║`);
    console.log(`║  Monthly summaries:     ${String(stats.summariesUpdated).padEnd(28)}║`);
    console.log(`║  Time taken:            ${String(`${mins}m ${secs}s`).padEnd(28)}║`);
    console.log('╚══════════════════════════════════════════════════════╝');

    if (stats.errors.length > 0) {
        console.log(`\n⚠️  ${stats.errors.length} error(s):`);
        stats.errors.slice(0, 20).forEach(e => console.log(`   • ${e}`));
        if (stats.errors.length > 20) console.log(`   ... and ${stats.errors.length - 20} more`);
    }

    if (DRY_RUN) {
        console.log('\n⚠️  DRY RUN — No changes were saved. Remove --dry-run to apply.\n');
    } else {
        console.log('\n✅ Reprocessing complete. All attendance records have been updated.\n');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('\n❌ Fatal error:', err);
    mongoose.disconnect();
    process.exit(1);
});
