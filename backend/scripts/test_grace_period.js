/**
 * Test script for Dynamic Grace Period Logic
 * Verifies that Late In and Early Out calculations correctly handle global overrides and fallbacks.
 */
const { calculateLateIn, calculateEarlyOut } = require('../shifts/services/shiftDetectionService');

function runTests() {
    console.log('--- GRACE PERIOD LOGIC TESTS ---\n');

    const shiftStartTime = '09:00';
    const shiftEndTime = '18:00';
    const today = '2025-01-24';

    // Helper to create punch time
    const createPunch = (timeStr) => new Date(`${today}T${timeStr}:00`);

    const scenarios = [
        {
            name: 'Scenario 1: Global Override (Late In)',
            desc: 'Global grace = 20, Punch = 09:18. Should be 0 mins late.',
            run: () => calculateLateIn(createPunch('09:18'), shiftStartTime, 15, today, 20),
            expected: 0
        },
        {
            name: 'Scenario 2: Global Override Exceeded (Late In)',
            desc: 'Global grace = 20, Punch = 09:25. Should be 5 mins late (25 - 20).',
            run: () => calculateLateIn(createPunch('09:25'), shiftStartTime, 15, today, 20),
            expected: 5
        },
        {
            name: 'Scenario 3: Shift Fallback (Late In)',
            desc: 'Global grace = null, Shift grace = 10, Punch = 09:12. Should be 2 mins late (12 - 10).',
            run: () => calculateLateIn(createPunch('09:12'), shiftStartTime, 10, today, null),
            expected: 2
        },
        {
            name: 'Scenario 4: System Default (Late In)',
            desc: 'Global grace = null, Shift grace = null, Punch = 09:14. Should be 0 mins late (Default 15).',
            run: () => calculateLateIn(createPunch('09:14'), shiftStartTime, null, today, null),
            expected: 0
        },
        {
            name: 'Scenario 5: Global Grace (Early Out)',
            desc: 'Global grace = 10, OutTime = 17:52. Should be 0 mins early (8 mins early < 10).',
            run: () => calculateEarlyOut(createPunch('17:52'), shiftEndTime, shiftStartTime, today, 10),
            expected: 0
        },
        {
            name: 'Scenario 6: Global Grace Exceeded (Early Out)',
            desc: 'Global grace = 10, OutTime = 17:45. Should be 5 mins early (15 - 10).',
            run: () => calculateEarlyOut(createPunch('17:45'), shiftEndTime, shiftStartTime, today, 10),
            expected: 5
        }
    ];

    let passed = 0;
    scenarios.forEach((s, i) => {
        const result = s.run();
        const isOk = result === s.expected;
        console.log(`[${isOk ? 'PASS' : 'FAIL'}] ${s.name}`);
        console.log(`   Description: ${s.desc}`);
        console.log(`   Result: ${result}, Expected: ${s.expected}\n`);
        if (isOk) passed++;
    });

    console.log(`--- TOTAL: ${passed}/${scenarios.length} PASSED ---`);
}

runTests();
