#!/usr/bin/env node
/**
 * Multi-shift payable accumulation — unit + optional live DB.
 * Usage: node scripts/run_pay_register_multishift_payable_test.js [EMP_NO] [YYYY-MM]
 */
const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const cmd = `npx jest pay-register/services/__tests__/payRegisterMultiShiftPayable.test.js --forceExit ${args.join(' ')}`;

console.log('\n========================================');
console.log(' MULTI-SHIFT PAYABLE ACCUMULATION TEST');
console.log('========================================\n');

let exitCode = 0;
try {
  execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
} catch (e) {
  exitCode = e.status || 1;
}

if (process.env.MONGODB_URI && process.argv[2]) {
  console.log('\n--- Live data test (real employee) ---\n');
  try {
    execSync(
      `node scripts/test_multi_shift_payable_accumulation.js ${process.argv[2]} ${process.argv[3] || '2026-05'}`,
      { stdio: 'inherit', cwd: path.join(__dirname, '..') }
    );
  } catch (e) {
    console.error('Live test failed:', e.message);
    exitCode = 1;
  }
}

process.exit(exitCode);
