const assert = require('assert').strict;
const { buildLeftDuringPeriodOrClause } = require('../services/attendanceEmployeeQuery');

function testAttendanceRosterVisibilityClause() {
  const clause = buildLeftDuringPeriodOrClause('2026-04-26', '2026-05-25');
  const firstBranch = clause?.$or?.[0];
  const secondBranch = clause?.$or?.[1];

  assert.ok(firstBranch, 'expected a first branch for active employees during the period');
  assert.ok(secondBranch, 'expected a second branch for employees who left during the period');

  const firstPayload = JSON.stringify(firstBranch);
  const secondPayload = JSON.stringify(secondBranch);

  assert.match(firstPayload, /2026-05-25/, 'active branch should include join date up to period end');
  assert.match(firstPayload, /2026-04-26/, 'active branch should exclude employees who left before the period start');
  assert.match(secondPayload, /2026-04-26/, 'left-during-period branch should include leave dates within the period');

  console.log('✅ Attendance roster visibility clause respects join and leave boundaries.');
}

if (require.main === module) {
  try {
    testAttendanceRosterVisibilityClause();
    process.exit(0);
  } catch (error) {
    console.error('❌ Attendance roster visibility test failed:', error.message);
    process.exit(1);
  }
}
