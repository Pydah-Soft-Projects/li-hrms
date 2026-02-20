
/**
 * Verification of Timezone Agnostic Logic
 * 
 * Scenario:
 * - Server Timezone: UTC
 * - Shift: 10:00 - 19:00
 * - Punch: 10:00 IST (04:30 UTC)
 */

process.env.TZ = 'UTC';

const date = '2023-10-27';
const punchTimeUTC = new Date('2023-10-27T04:30:00Z'); // 10:00 IST

// --- NEW LOGIC TO TEST ---
const createDateWithOffset = (dateStr, timeStr, offset = '+05:30') => {
    return new Date(`${dateStr}T${timeStr}:00${offset}`);
};

const calculateLateIn_FIXED = (inTime, shiftStartTime) => {
    // 1. Construct Shift Start as IST
    // Shift is 10:00. Date is 2023-10-27.
    // "2023-10-27T10:00:00+05:30" should correspond to 04:30 UTC.
    const shiftStartDate = createDateWithOffset(date, shiftStartTime);

    console.log(`[Fixed Calc] Shift ${shiftStartTime} (IST) -> UTC: ${shiftStartDate.toISOString()}`);
    console.log(`[Fixed Calc] Punch (UTC):                         ${inTime.toISOString()}`);

    const diffMs = inTime.getTime() - shiftStartDate.getTime();
    return diffMs / (1000 * 60);
};
// -------------------------

console.log('--- Verification (Server TZ: UTC) ---');

const lateInB = calculateLateIn_FIXED(punchTimeUTC, '10:00');
console.log(`Late In vs Shift B (10:00): ${lateInB} min`);

const lateInA = calculateLateIn_FIXED(punchTimeUTC, '05:00');
console.log(`Late In vs Shift A (05:00): ${lateInA} min`);

if (Math.abs(lateInB) < 0.1) {
    console.log('✅ SUCCESS: 10:00 punch matches 10:00 shift exacty (0 min late)');
} else {
    console.log('❌ FAIL: Mismatch detected');
}
