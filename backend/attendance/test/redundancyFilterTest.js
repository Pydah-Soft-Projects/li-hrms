/**
 * Test Redundancy Filter Logic (30-minute window, last-accepted same-type rule)
 *
 * Run:  npm run test:punch-pipeline --prefix backend
 *   or: node backend/attendance/test/redundancyFilterTest.js
 */

'use strict';

const assert = require('assert').strict;
const { filterRedundantLogs } = require('../services/attendanceSyncService');

function testRedundancyFilter() {
  console.log('🧪 Testing 30-Minute Redundancy Filter...\n');

  // Case 1: Same employee, same type, within 30 minutes
  const testLogs1 = [
    { employeeNumber: 'EMP001', timestamp: '2026-02-23T09:00:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP001', timestamp: '2026-02-23T09:15:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP001', timestamp: '2026-02-23T09:45:00Z', type: 'IN', source: 'test' },
  ];
  const filtered1 = filterRedundantLogs(testLogs1, 30);
  console.log('📋 Case 1: same employee, duplicate IN — middle dropped');
  assert.equal(filtered1.length, 2, 'expected first + third IN');
  console.log('   ✓ pass\n');

  // Case 2: Different types
  const testLogs2 = [
    { employeeNumber: 'EMP002', timestamp: '2026-02-23T09:00:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP002', timestamp: '2026-02-23T09:15:00Z', type: 'OUT', source: 'test' },
  ];
  assert.equal(filterRedundantLogs(testLogs2, 30).length, 2);
  console.log('📋 Case 2: IN then OUT — both kept');
  console.log('   ✓ pass\n');

  // Case 3: Different employees
  const testLogs3 = [
    { employeeNumber: 'EMP003', timestamp: '2026-02-23T09:00:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP004', timestamp: '2026-02-23T09:15:00Z', type: 'IN', source: 'test' },
  ];
  assert.equal(filterRedundantLogs(testLogs3, 30).length, 2);
  console.log('📋 Case 3: different employees');
  console.log('   ✓ pass\n');

  // Case 4: Exactly 30 minutes apart (inclusive window → second dropped)
  const testLogs4 = [
    { employeeNumber: 'EMP005', timestamp: '2026-02-23T09:00:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP005', timestamp: '2026-02-23T09:30:00Z', type: 'IN', source: 'test' },
  ];
  assert.equal(filterRedundantLogs(testLogs4, 30).length, 1);
  console.log('📋 Case 4: two IN exactly 30 min apart — second redundant');
  console.log('   ✓ pass\n');

  // Case 5: IN → OUT → IN (regression: second IN must not be dropped vs first IN)
  const testLogs5 = [
    { employeeNumber: 'EMP006', timestamp: '2026-02-23T08:00:00Z', type: 'IN', source: 'test' },
    { employeeNumber: 'EMP006', timestamp: '2026-02-23T08:10:00Z', type: 'OUT', source: 'test' },
    { employeeNumber: 'EMP006', timestamp: '2026-02-23T08:20:00Z', type: 'IN', source: 'test' },
  ];
  assert.equal(filterRedundantLogs(testLogs5, 30).length, 3);
  console.log('📋 Case 5: IN → OUT → IN within 30 min — all kept');
  console.log('   ✓ pass\n');

  console.log('🎯 Redundancy filter: all cases passed.');
}

if (require.main === module) {
  try {
    testRedundancyFilter();
    setTimeout(() => process.exit(0), 150);
  } catch (e) {
    console.error('❌ Redundancy filter test failed:', e.message);
    process.exit(1);
  }
}

module.exports = { testRedundancyFilter };
