
/**
 * Test Script: Timestamp Parsing Logic
 * Simulates how the biometric service parses raw timestamps with an explicit offset.
 * 
 * Usage: node scripts/test_timestamp_parsing.js
 */

// 1. Simulate the input (Raw string from ADMS device)
// The device sends: "2023-10-27 10:00:00" (which implies 10:00 AM local time)
const rawTimestamp = "2023-10-27 10:00:00";

// 2. Define the Offset (simulating process.env.TIMEZONE_OFFSET)
const offset = '+05:30';

console.log('--- Environment Simulation ---');
console.log(`Current Server Timezone Offset: ${new Date().getTimezoneOffset()} minutes (Positive means BEHIND UTC, Negative means AHEAD)`);
console.log(`Raw Input from Device: "${rawTimestamp}"`);
console.log(`Configured Offset:     "${offset}"`);

// 3. Apply the Logic from admsParser.js
// Logic: const timeStr = parts[1].replace(/-/g, '/') + ' ' + offset;
const timeStr = rawTimestamp.replace(/-/g, '/') + ' ' + offset;

console.log(`\n--- Parsing Logic ---`);
console.log(`Constructed Time String: "${timeStr}"`);

// 4. Create Date Object
const parsedDate = new Date(timeStr);

console.log(`\n--- Resulting Date Object ---`);
console.log(`1. .toString() (Local Server View):  ${parsedDate.toString()}`);
console.log(`2. .toISOString() (Absolute UTC):    ${parsedDate.toISOString()}`);
console.log(`3. .toUTCString():                   ${parsedDate.toUTCString()}`);

// 5. Verification
const expectedUTC = "2023-10-27T04:30:00.000Z"; // 10:00 - 5:30 = 04:30
console.log(`\n--- Verification ---`);
console.log(`Expected UTC for 10:00 IST:          ${expectedUTC}`);
console.log(`Match?                               ${parsedDate.toISOString() === expectedUTC ? '✅ YES' : '❌ NO'}`);
