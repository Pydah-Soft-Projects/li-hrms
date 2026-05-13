/**
 * 1) Optionally writes global Leave Policy EL settings (attendance-based + cumulative ranges).
 * 2) Previews EL calculation for April (or --month/--year) for active employees in a division
 *    (match Division.code or Division.name, default PYDAHSOFT).
 *
 * Usage:
 *   # Preview only (no DB policy change) — uses whatever EL settings are already in DB
 *   node scripts/apply_el_policy_and_test_april_division.js
 *
 *   # Apply the EL policy below to leave_policy_settings, then preview for division
 *   node scripts/apply_el_policy_and_test_april_division.js --apply-settings
 *
 *   # Custom division / period / sample size
 *   node scripts/apply_el_policy_and_test_april_division.js --apply-settings --division PYDAHSOFT --month 4 --year 2026 --limit 30
 *
 * After preview looks correct, run accrual for that payroll month:
 *   node scripts/runMonthlyAccrualForPayrollMonth.js 4 2026
 *   node scripts/runMonthlyAccrualForPayrollMonth.js 4 2026 Civil
 * Reconcile posted EL auto-credits vs current policy (optional dept / dry-run): see scripts/reconcileEarnedLeaveAccrualCredits.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

require('../departments/model/Department');
require('../departments/model/Division');
require('../departments/model/Designation');
require('../employees/model/Employee');

const LeavePolicySettings = require('../settings/model/LeavePolicySettings');
const Division = require('../departments/model/Division');
const Employee = require('../employees/model/Employee');
const { calculateEarnedLeave } = require('../leaves/services/earnedLeaveService');

/** Same structure as discussed for EL earning rules (global policy). */
const EL_POLICY_TEMPLATE = {
  enabled: true,
  earningType: 'attendance_based',
  useAsPaidInPayroll: true,
  attendanceRules: {
    minDaysForFirstEL: 20,
    daysPerEL: 20,
    maxELPerMonth: 2,
    maxELPerYear: 24,
    considerPresentDays: true,
    considerHolidays: true,
    attendanceRanges: [
      { minDays: 1, maxDays: 10, elEarned: 0, description: '01-10 days = 0 EL' },
      { minDays: 11, maxDays: 20, elEarned: 2, description: '11-20 days = 2 EL' },
      { minDays: 21, maxDays: 31, elEarned: 1, description: '21-31 days = 1 EL' },
    ],
  },
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {
    applySettings: false,
    divisionKey: 'PYDAHSOFT',
    month: 4,
    year: 2026,
    limit: 50,
  };
  for (const a of argv) {
    if (a === '--apply-settings') out.applySettings = true;
    else if (a.startsWith('--division=')) out.divisionKey = a.split('=')[1].trim();
    else if (a.startsWith('--month=')) out.month = Math.max(1, Math.min(12, Number(a.split('=')[1]) || 4));
    else if (a.startsWith('--year=')) out.year = Number(a.split('=')[1]) || 2026;
    else if (a.startsWith('--limit=')) out.limit = Math.max(1, Math.min(500, Number(a.split('=')[1]) || 50));
  }
  return out;
}

async function applyElPolicyTemplate() {
  const doc = await LeavePolicySettings.getSettings();
  const plain = doc.toObject ? doc.toObject() : doc;
  const prevEl = plain.earnedLeave || {};
  const merged = {
    ...prevEl,
    ...EL_POLICY_TEMPLATE,
    attendanceRules: {
      ...(prevEl.attendanceRules || {}),
      ...EL_POLICY_TEMPLATE.attendanceRules,
      attendanceRanges: EL_POLICY_TEMPLATE.attendanceRules.attendanceRanges,
    },
    fixedRules: prevEl.fixedRules || { elPerMonth: 1, maxELPerYear: 12 },
  };
  doc.set('earnedLeave', merged);
  await doc.save();
  console.log('[apply_el_policy] Saved LeavePolicySettings.earnedLeave (global).');
}

async function findDivision(q) {
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Division.findOne({
    $or: [{ code: new RegExp(`^${esc}$`, 'i') }, { name: new RegExp(esc, 'i') }],
  })
    .select('_id name code')
    .lean();
}

function pickEffectiveDays(calc) {
  const b = calc.calculationBreakdown;
  if (!Array.isArray(b) || b.length === 0) return null;
  const first = b[0];
  if (first && first.effectiveDays != null) return Number(first.effectiveDays);
  return null;
}

async function main() {
  const opts = parseArgs();
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/hrms';
  await mongoose.connect(uri);
  console.log(`[test_el_division] Connected: ${uri.replace(/\/\/.*@/, '//***@')}`);

  if (opts.applySettings) {
    await applyElPolicyTemplate();
  } else {
    console.log('[test_el_division] Skipping policy write (pass --apply-settings to persist EL_POLICY_TEMPLATE).');
  }

  const div = await findDivision(opts.divisionKey);
  if (!div) {
    console.error(`[test_el_division] No division matching "${opts.divisionKey}" (code or name).`);
    process.exit(1);
  }
  console.log(`[test_el_division] Division: ${div.name} (${div.code})  _id=${div._id}`);

  const emps = await Employee.find({ division_id: div._id, is_active: true })
    .select('_id emp_no employee_name')
    .sort({ emp_no: 1 })
    .limit(opts.limit)
    .lean();

  console.log(
    `[test_el_division] Preview calculateEarnedLeave for payroll month ${opts.month}/${opts.year}, employees=${emps.length} (limit ${opts.limit})\n`
  );

  const rows = [];
  for (const e of emps) {
    try {
      const calc = await calculateEarnedLeave(e._id, opts.month, opts.year);
      const eff = pickEffectiveDays(calc);
      rows.push({
        emp_no: e.emp_no,
        name: e.employee_name,
        eligible: calc.eligible,
        elEarned: calc.elEarned,
        effectiveDays: eff,
        reason: calc.reason || '',
        earningType: calc.earningType || '',
      });
    } catch (err) {
      rows.push({
        emp_no: e.emp_no,
        name: e.employee_name,
        eligible: false,
        elEarned: 0,
        effectiveDays: null,
        reason: err.message || String(err),
        earningType: '',
      });
    }
  }

  console.table(rows);
  const sumEl = rows.reduce((s, r) => s + (Number(r.elEarned) || 0), 0);
  const eligibleN = rows.filter((r) => r.eligible && r.elEarned > 0).length;
  console.log(`\n[test_el_division] Rows with EL>0: ${eligibleN}/${rows.length}, sum elEarned (sample)= ${sumEl}`);
  console.log(
    '[test_el_division] To post EL credits + CCL expiry + pool carry for ALL active employees this month, run:\n' +
      `  node scripts/runMonthlyAccrualForPayrollMonth.js ${opts.month} ${opts.year}`
  );

  await mongoose.disconnect();
  console.log('[test_el_division] Done.');
}

main().catch(async (e) => {
  console.error('[test_el_division] Failed:', e?.message || e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
