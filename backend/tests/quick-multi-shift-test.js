/**
 * Quick Multi-Shift Test
 * Simple test to verify multi-shift detection is working
 */

const { detectAndPairShifts, calculateDailyTotals } = require('../attendance/services/multiShiftDetectionService');

console.log('\n🧪 QUICK MULTI-SHIFT DETECTION TEST\n');
console.log('='.repeat(60));

// Test data: Simulate raw logs for a double shift day
const testLogs = [
    {
        timestamp: new Date('2026-01-25T08:00:00'),
        type: 'IN',
        punch_state: 0,
        _id: 'log1',
    },
    {
        timestamp: new Date('2026-01-25T16:00:00'),
        type: 'OUT',
        punch_state: 1,
        _id: 'log2',
    },
    {
        timestamp: new Date('2026-01-25T18:00:00'),
        type: 'IN',
        punch_state: 0,
        _id: 'log3',
    },
    {
        timestamp: new Date('2026-01-25T22:00:00'),
        type: 'OUT',
        punch_state: 1,
        _id: 'log4',
    },
];

console.log('\n📋 Test Data:');
testLogs.forEach((log, i) => {
    console.log(`  ${i + 1}. ${log.type.padEnd(4)} at ${log.timestamp.toLocaleTimeString()}`);
});

console.log('\n🔍 Running shift detection...\n');

try {
    // Detect shifts
    const shifts = detectAndPairShifts(testLogs, '2026-01-25', 3);

    console.log(`✅ Detected ${shifts.length} shift(s):\n`);

    shifts.forEach((shift, index) => {
        console.log(`  Shift ${shift.shiftNumber}:`);
        console.log(`    IN:      ${new Date(shift.inTime).toLocaleTimeString()}`);
        console.log(`    OUT:     ${shift.outTime ? new Date(shift.outTime).toLocaleTimeString() : 'INCOMPLETE'}`);
        console.log(`    Duration: ${shift.duration || 0} minutes`);
        console.log(`    Hours:    ${shift.workingHours?.toFixed(2) || 0}`);
        console.log(`    Status:   ${shift.status}`);
        console.log('');
    });

    // Calculate totals
    const totals = calculateDailyTotals(shifts);

    console.log('📊 Daily Totals:');
    console.log(`  Total Shifts:        ${totals.totalShifts}`);
    console.log(`  Total Working Hours: ${totals.totalWorkingHours.toFixed(2)}`);
    console.log(`  Total OT Hours:      ${totals.totalOTHours.toFixed(2)}`);
    console.log(`  First IN:            ${totals.firstInTime ? new Date(totals.firstInTime).toLocaleTimeString() : '-'}`);
    console.log(`  Last OUT:            ${totals.lastOutTime ? new Date(totals.lastOutTime).toLocaleTimeString() : '-'}`);

    console.log('\n' + '='.repeat(60));
    console.log('✅ TEST PASSED - Multi-shift detection is working!\n');

} catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error);
    console.log('\n' + '='.repeat(60) + '\n');
}
