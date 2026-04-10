/**
 * Simulation harness (no DB required for section A):
 *   A) Logs merged EL policy for sample global + department overrides.
 *   B) Optional: with MONGODB_URI, resolves policy for a real department id (DEPT_ID, optional DIVISION_ID).
 *
 * Run:
 *   node scripts/simulate_department_el_accrual_payroll.js
 *   node scripts/simulate_department_el_accrual_payroll.js --mongo
 *
 * With mongo:
 *   set DEPT_ID=... in env (and MONGODB_URI in .env or env)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { resolveEffectiveEarnedLeave, resolveEffectiveEarnedLeaveForDepartment } = require('../leaves/services/earnedLeavePolicyResolver');

const sampleGlobal = {
  enabled: true,
  earningType: 'attendance_based',
  useAsPaidInPayroll: true,
  attendanceRules: {
    minDaysForFirstEL: 20,
    daysPerEL: 20,
    maxELPerMonth: 2,
    maxELPerYear: 12,
    attendanceRanges: [],
  },
  fixedRules: { elPerMonth: 1, maxELPerYear: 12 },
};

const sampleDeptLeaves = {
  earnedLeave: {
    attendanceRules: { maxELPerMonth: 1, daysPerEL: 25 },
    useAsPaidInPayroll: false,
  },
};

function sectionA() {
  console.log('\n=== A) Offline merge simulation (resolver only) ===\n');
  const merged = resolveEffectiveEarnedLeave(sampleGlobal, sampleDeptLeaves);
  console.log('Global maxELPerMonth:', sampleGlobal.attendanceRules.maxELPerMonth);
  console.log('Dept override maxELPerMonth:', sampleDeptLeaves.earnedLeave.attendanceRules.maxELPerMonth);
  console.log('Effective policy:', JSON.stringify(merged, null, 2));
  console.log('\nExpected: maxELPerMonth=1, daysPerEL=25, useAsPaidInPayroll=false, enabled=true\n');
}

async function sectionB() {
  const useMongo = process.argv.includes('--mongo');
  if (!useMongo) {
    console.log('=== B) Skipped (pass --mongo to load department from DB) ===\n');
    return;
  }
  const uri = process.env.MONGODB_URI;
  const deptId = process.env.DEPT_ID;
  if (!uri || !deptId) {
    console.warn('Need MONGODB_URI and DEPT_ID in environment for --mongo run.');
    return;
  }
  const mongoose = require('mongoose');
  await mongoose.connect(uri);
  try {
    const divId = process.env.DIVISION_ID || null;
    const eff = await resolveEffectiveEarnedLeaveForDepartment(deptId, divId || null);
    console.log('\n=== B) Effective EL for department', deptId, '===\n');
    console.log(JSON.stringify(eff, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  sectionA();
  await sectionB();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
