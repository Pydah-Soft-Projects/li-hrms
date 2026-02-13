const admsParser = require('../src/utils/admsParser');
require('dotenv').config();

// Standard ADMS-style text data: EmployeeId \t Timestamp \t InOutMode \t Status
const testData = "123\t2026-02-13 10:45:00\t0\t0";

console.log('--- Testing Timezone Parsing ---');
console.log('Current TIMEZONE_OFFSET in .env:', process.env.TIMEZONE_OFFSET || '(default to +05:30)');

const records = admsParser.parseTextRecords(testData);

if (records.length > 0) {
    const record = records[0];
    console.log('Original String:', "2026-02-13 10:45:00");
    console.log('Parsed ISO String:', record.timestamp.toISOString());
    console.log('Parsed Locale String (Machine Time):', record.timestamp.toLocaleString());

    // Check if it matches expectation: 
    // If it's 10:45:00 IST (+05:30), the UTC (ISO) string should be 05:15:00.
    const expectedISOStart = "2026-02-13T05:15:00";
    if (record.timestamp.toISOString().startsWith(expectedISOStart)) {
        console.log('\n✅ SUCCESS: Timestamp correctly parsed as IST (+05:30).');
    } else {
        console.log('\n❌ FAILURE: Timestamp interpreted incorrectly.');
        console.log('Expected UTC:', expectedISOStart);
        console.log('Actual UTC:', record.timestamp.toISOString());
    }
} else {
    console.log('❌ No records parsed.');
}
