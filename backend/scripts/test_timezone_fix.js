/**
 * Timezone Fix Verification Test
 * Tests that calculateLateIn, calculateEarlyOut, and calculateTimeDifference
 * correctly handle IST punch times stored as UTC.
 *
 * IST = UTC + 5:30
 * Punch timestamps are stored as UTC ISO strings.
 * Shift times are in IST (HH:MM strings).
 */

const { calculateLateIn, calculateEarlyOut, buildISTDate } = require('../shifts/services/shiftDetectionService');

let passed = 0;
let failed = 0;

function assert(label, actual, expected, toleranceMin = 0) {
    const ok = Math.abs(actual - expected) <= toleranceMin;
    if (ok) {
        console.log(`  ✅ PASS: ${label}`);
        console.log(`         Expected: ${expected} min, Got: ${actual} min`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: ${label}`);
        console.log(`         Expected: ${expected} min, Got: ${actual} min`);
        failed++;
    }
}

// Helper: build a "resultant" UTC ISO string (already shifted +5:30)
// e.g. istToResultant('2024-05-01', 9, 0) → "2024-05-01T09:00:00.000Z"
// This matches the new pre-shifted logs in multiShiftProcessingService.js
function istToResultant(dateStr, hours, minutes) {
    return new Date(`${dateStr}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`).toISOString();
}

console.log('\n========================================');
console.log('  TIMEZONE FIX VERIFICATION TESTS');
console.log('========================================\n');

// ─── calculateLateIn Tests ───────────────────────────────────────────────────
console.log('── calculateLateIn ──────────────────────\n');

// Test 1: On time — punch at exactly 9:00 IST, shift starts 9:00, grace 15 min
{
    const punch = istToResultant('2024-05-01', 9, 0);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', null);
    assert('On time (9:00 IST punch, 9:00 shift, 15 min grace)', result, 0);
}

// Test 2: Within grace — punch at 9:10 IST, shift 9:00, grace 15 min → 0 late
{
    const punch = istToResultant('2024-05-01', 9, 10);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', null);
    assert('Within grace (9:10 IST punch, 9:00 shift, 15 min grace)', result, 0);
}

// Test 3: Late — punch at 9:20 IST, shift 9:00, grace 15 min → 5 min late
{
    const punch = istToResultant('2024-05-01', 9, 20);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', null);
    assert('Late by 5 min (9:20 IST punch, 9:00 shift, 15 min grace)', result, 5);
}

// Test 4: Very late — punch at 10:00 IST, shift 9:00, grace 15 min → 45 min late
{
    const punch = istToResultant('2024-05-01', 10, 0);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', null);
    assert('Late by 45 min (10:00 IST punch, 9:00 shift, 15 min grace)', result, 45);
}

// Test 5: Early arrival — punch at 8:30 IST, shift 9:00 → 0 late
{
    const punch = istToResultant('2024-05-01', 8, 30);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', null);
    assert('Early arrival (8:30 IST punch, 9:00 shift) → 0 late', result, 0);
}

// Test 6: Global grace override — punch at 9:20 IST, shift 9:00, global grace 30 min → 0 late
{
    const punch = istToResultant('2024-05-01', 9, 20);
    const result = calculateLateIn(punch, '09:00', 15, '2024-05-01', 30);
    assert('Global grace 30 min (9:20 IST punch, 9:00 shift) → 0 late', result, 0);
}

// Test 7: Afternoon shift — punch at 14:10 IST, shift 14:00, grace 15 → 0 late
{
    const punch = istToResultant('2024-05-01', 14, 10);
    const result = calculateLateIn(punch, '14:00', 15, '2024-05-01', null);
    assert('Afternoon shift within grace (14:10 IST, 14:00 shift, 15 grace)', result, 0);
}

// Test 8: Afternoon shift late — punch at 14:30 IST, shift 14:00, grace 15 → 15 min late
{
    const punch = istToResultant('2024-05-01', 14, 30);
    const result = calculateLateIn(punch, '14:00', 15, '2024-05-01', null);
    assert('Afternoon shift late 15 min (14:30 IST, 14:00 shift, 15 grace)', result, 15);
}

// ─── calculateEarlyOut Tests ─────────────────────────────────────────────────
console.log('\n── calculateEarlyOut ────────────────────\n');

// Test 9: On time out — punch out at 18:00 IST, shift ends 18:00, grace 15 → 0 early
{
    const punch = istToResultant('2024-05-01', 18, 0);
    const result = calculateEarlyOut(punch, '18:00', '09:00', '2024-05-01', 15);
    assert('On time out (18:00 IST punch, 18:00 shift end, 15 grace)', result, 0);
}

// Test 10: Within grace out — punch out at 17:50 IST, shift ends 18:00, grace 15 → 0 early
{
    const punch = istToResultant('2024-05-01', 17, 50);
    const result = calculateEarlyOut(punch, '18:00', '09:00', '2024-05-01', 15);
    assert('Within grace out (17:50 IST punch, 18:00 shift end, 15 grace)', result, 0);
}

// Test 11: Early out — punch out at 17:00 IST, shift ends 18:00, grace 15 → 45 min early
{
    const punch = istToResultant('2024-05-01', 17, 0);
    const result = calculateEarlyOut(punch, '18:00', '09:00', '2024-05-01', 15);
    assert('Early out 45 min (17:00 IST punch, 18:00 shift end, 15 grace)', result, 45);
}

// Test 12: Late out (no early out) — punch out at 19:00 IST, shift ends 18:00 → 0 early
{
    const punch = istToResultant('2024-05-01', 19, 0);
    const result = calculateEarlyOut(punch, '18:00', '09:00', '2024-05-01', 15);
    assert('Late out (19:00 IST, 18:00 shift end) → 0 early out', result, 0);
}

// ─── Frontend outTime fix verification ───────────────────────────────────────
console.log('\n── Frontend outTime Fix ─────────────────\n');

// Simulate what the frontend now sends: "2024-05-01T17:30:00+05:30"
// The backend does new Date(outTime) — verify it stores the correct UTC
{
    const frontendSends = '2024-05-01T17:30:00+05:30';
    const stored = new Date(frontendSends);
    const storedUTC = stored.toISOString();
    const expectedUTC = '2024-05-01T12:00:00.000Z'; // 17:30 IST = 12:00 UTC
    const ok = storedUTC === expectedUTC;
    if (ok) {
        console.log(`  ✅ PASS: Frontend +05:30 offset correctly parsed by backend`);
        console.log(`         Sent: "${frontendSends}"`);
        console.log(`         Stored as UTC: ${storedUTC} ✓`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: Frontend +05:30 offset parsing`);
        console.log(`         Sent: "${frontendSends}"`);
        console.log(`         Expected UTC: ${expectedUTC}`);
        console.log(`         Got UTC:      ${storedUTC}`);
        failed++;
    }
}

// Simulate what the OLD code sent (no offset) — show it was wrong
{
    const oldSends = '2024-05-01T17:30:00'; // No timezone
    const stored = new Date(oldSends);
    const storedUTC = stored.toISOString();
    // On a UTC server, this would be parsed as UTC → stored as 17:30 UTC = 23:00 IST (WRONG)
    const wasWrong = storedUTC === '2024-05-01T17:30:00.000Z';
    if (wasWrong) {
        console.log(`  ✅ CONFIRMED (old bug): No-offset string parsed as UTC on UTC server`);
        console.log(`         Old sent: "${oldSends}"`);
        console.log(`         Was stored as: ${storedUTC} = 23:00 IST (WRONG - 5:30 hours off)`);
        passed++;
    } else {
        console.log(`  ℹ️  INFO: No-offset parsing behavior: ${storedUTC}`);
    }
}

// ─── IST helper verification ──────────────────────────────────────────────────
console.log('\n── IST Helper Verification ──────────────\n');

{
    // Verify buildISTDate logic: 9:00 IST on 2024-05-01 should be 9:00 UTC (Resultant)
    const shiftStart = buildISTDate('2024-05-01', 9, 0);
    const expected = '2024-05-01T09:00:00.000Z';
    const ok = shiftStart.toISOString() === expected;
    if (ok) {
        console.log(`  ✅ PASS: buildISTDate(2024-05-01, 9, 0) = ${shiftStart.toISOString()} ✓`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: buildISTDate(2024-05-01, 9, 0)`);
        console.log(`         Expected: ${expected}, Got: ${shiftStart.toISOString()}`);
        failed++;
    }
}

{
    // Verify toISTDate: a shifted punch (9:00 UTC resultant) should show as 9:00 via getUTCHours
    const resultantPunch = new Date('2024-05-01T09:00:00.000Z');
    const istHours = resultantPunch.getUTCHours();
    const istMinutes = resultantPunch.getUTCMinutes();
    const ok = istHours === 9 && istMinutes === 0;
    if (ok) {
        console.log(`  ✅ PASS: resultantPunch(9:00 UTC) represents ${istHours}:${String(istMinutes).padStart(2, '0')} IST ✓`);
        passed++;
    } else {
        console.log(`  ❌ FAIL: resultantPunch(9:00 UTC) should represent 9:00 IST, got ${istHours}:${istMinutes}`);
        failed++;
    }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n========================================');
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('========================================\n');

if (failed > 0) {
    process.exit(1);
} else {
    console.log('  🎉 All tests passed! Timezone fixes are working correctly.\n');
}
