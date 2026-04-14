/**
 * Punch preprocessing regression checks (multi-shift dedupe + sync redundancy filter).
 *
 * Run:  npm run test:punch-pipeline --prefix backend
 *   or: node backend/attendance/test/simulateDedupeAndRedundancyScenarios.js
 *
 * Uses production exports: `dedupePunchesForMultiShift`, `filterRedundantLogs`.
 * Exits 0 on success, 1 on failure (CI-friendly).
 */

'use strict';

const assert = require('assert').strict;
const { filterRedundantLogs } = require('../services/attendanceSyncService');
const { dedupePunchesForMultiShift } = require('../services/multiShiftProcessingService');

function pass(name) {
  console.log(`  ✓ ${name}`);
}

function run(name, fn) {
  fn();
  pass(name);
}

function main() {
  console.log('\n========== Dedupe & redundancy simulation ==========\n');

  console.log('A. Multi-shift `dedupePunchesForMultiShift` (5 min, same-type consecutive only)\n');

  run('Overnight-style: OUT then IN 2 minutes apart — BOTH kept', () => {
    const punches = [
      { timestamp: '2026-04-12T00:50:00.000Z', type: 'OUT', _id: 'a' },
      { timestamp: '2026-04-12T00:52:00.000Z', type: 'IN', _id: 'b' },
    ];
    const out = dedupePunchesForMultiShift(punches);
    assert.equal(out.length, 2);
    assert.equal(out[0].type, 'OUT');
    assert.equal(out[1].type, 'IN');
  });

  run('Double IN: two IN 2 minutes apart — second dropped', () => {
    const punches = [
      { timestamp: '2026-04-12T09:00:00.000Z', type: 'IN' },
      { timestamp: '2026-04-12T09:02:00.000Z', type: 'IN' },
    ];
    assert.equal(dedupePunchesForMultiShift(punches).length, 1);
  });

  run('Double OUT: two OUT 3 minutes apart — second dropped', () => {
    const punches = [
      { timestamp: '2026-04-12T18:00:00.000Z', type: 'OUT' },
      { timestamp: '2026-04-12T18:03:00.000Z', type: 'OUT' },
    ];
    assert.equal(dedupePunchesForMultiShift(punches).length, 1);
  });

  run('Alternating IN–OUT–IN each 1 min apart — all kept (no same-type consecutive)', () => {
    const punches = [
      { timestamp: '2026-04-12T10:00:00.000Z', type: 'IN' },
      { timestamp: '2026-04-12T10:01:00.000Z', type: 'OUT' },
      { timestamp: '2026-04-12T10:02:00.000Z', type: 'IN' },
    ];
    assert.equal(dedupePunchesForMultiShift(punches).length, 3);
  });

  run('Same-type IN 6 minutes apart — both kept (> 5 min)', () => {
    const punches = [
      { timestamp: '2026-04-12T09:00:00.000Z', type: 'IN' },
      { timestamp: '2026-04-12T09:06:00.000Z', type: 'IN' },
    ];
    assert.equal(dedupePunchesForMultiShift(punches).length, 2);
  });

  run('Unsorted array order: helper sorts by time then OUT+IN 2 min apart — both kept', () => {
    const punches = [
      { timestamp: '2026-04-12T00:52:00.000Z', type: 'IN', _id: 'b' },
      { timestamp: '2026-04-12T00:50:00.000Z', type: 'OUT', _id: 'a' },
    ];
    const out = dedupePunchesForMultiShift(punches);
    assert.equal(out.length, 2);
    assert.equal(new Date(out[0].timestamp).getTime(), new Date('2026-04-12T00:50:00.000Z').getTime());
    assert.equal(out[0].type, 'OUT');
    assert.equal(out[1].type, 'IN');
  });

  console.log('\nB. `filterRedundantLogs` (30 min, last accepted per employee, same-type)\n');

  run('IN → OUT → IN within 20 min — all three kept', () => {
    const logs = [
      { employeeNumber: 'EMP_SIM', timestamp: '2026-04-12T09:00:00.000Z', type: 'IN' },
      { employeeNumber: 'EMP_SIM', timestamp: '2026-04-12T09:10:00.000Z', type: 'OUT' },
      { employeeNumber: 'EMP_SIM', timestamp: '2026-04-12T09:15:00.000Z', type: 'IN' },
    ];
    assert.equal(filterRedundantLogs(logs, 30).length, 3);
  });

  run('IN → IN 15 min apart — second IN dropped', () => {
    const logs = [
      { employeeNumber: 'EMP_SIM2', timestamp: '2026-04-12T09:00:00.000Z', type: 'IN' },
      { employeeNumber: 'EMP_SIM2', timestamp: '2026-04-12T09:15:00.000Z', type: 'IN' },
    ];
    assert.equal(filterRedundantLogs(logs, 30).length, 1);
  });

  run('OUT → OUT 10 min apart — second OUT dropped', () => {
    const logs = [
      { employeeNumber: 'EMP_SIM3', timestamp: '2026-04-12T06:20:00.000Z', type: 'OUT' },
      { employeeNumber: 'EMP_SIM3', timestamp: '2026-04-12T06:30:00.000Z', type: 'OUT' },
    ];
    assert.equal(filterRedundantLogs(logs, 30).length, 1);
  });

  run('Employee key case-insensitive: emp_x and EMP_X treated same person for redundancy', () => {
    const logs = [
      { employeeNumber: 'emp_case', timestamp: '2026-04-12T12:00:00.000Z', type: 'IN' },
      { employeeNumber: 'EMP_CASE', timestamp: '2026-04-12T12:10:00.000Z', type: 'IN' },
    ];
    assert.equal(filterRedundantLogs(logs, 30).length, 1);
  });

  run('OUT → IN → OUT (2 min gaps): redundancy keeps all 3; multi-shift dedupe keeps all 3', () => {
    const raw = [
      { employeeNumber: 'EMP_CHAIN', timestamp: '2026-04-12T06:20:00.000Z', type: 'OUT' },
      { employeeNumber: 'EMP_CHAIN', timestamp: '2026-04-12T06:22:00.000Z', type: 'IN' },
      { employeeNumber: 'EMP_CHAIN', timestamp: '2026-04-12T06:24:00.000Z', type: 'OUT' },
    ];
    const afterRedundancy = filterRedundantLogs(raw, 30);
    assert.equal(afterRedundancy.length, 3);
    const sorted = [...afterRedundancy].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const afterMulti = dedupePunchesForMultiShift(sorted);
    assert.equal(afterMulti.length, 3);
  });

  run('Pipeline: redundant filter then multi-shift dedupe — OUT+IN 2 min both kept', () => {
    const raw = [
      { employeeNumber: 'EMP_PIPE', timestamp: '2026-04-12T06:20:00.000Z', type: 'OUT' },
      { employeeNumber: 'EMP_PIPE', timestamp: '2026-04-12T06:22:00.000Z', type: 'IN' },
    ];
    const afterRedundancy = filterRedundantLogs(raw, 30);
    assert.equal(afterRedundancy.length, 2);
    const afterMultiDedupe = dedupePunchesForMultiShift(
      afterRedundancy.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    );
    assert.equal(afterMultiDedupe.length, 2);
  });

  console.log('\n========== All scenarios passed ==========\n');
}

try {
  main();
  setTimeout(() => process.exit(0), 150);
} catch (err) {
  console.error('\n========== SIMULATION FAILED ==========\n');
  console.error(err);
  process.exit(1);
}
