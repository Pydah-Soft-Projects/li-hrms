/**
 * Leave Register “zero credits + zero transfer” script (designation-scoped).
 *
 * Why this exists:
 * - The Leave Register UI shows, per payroll month:
 *   - “Credited” from ledger CREDIT transactions (CL/CCL/EL).
 *   - “Transfer” (xfer column) is derived from scheduled pool credits (clCredits/compensatoryOffs/elCredits)
 *     minus used/locked for that slot.
 *
 * To make both columns zero for a set of designations (driver/cleaner/security guard/scavenger):
 * 1) Set monthly scheduled pool credits to 0 for every month slot in every FY row.
 * 2) Remove all ledger CREDIT transactions for leave types CL/CCL/EL for those months.
 * 3) Recalculate balances after the mutation so opening/closing balances stay consistent.
 *
 * Usage examples:
 *   # DRY RUN (default; no DB writes)
 *   node scripts/reset_leave_register_and_balances.js --designations "driver,cleaner,security guard,scavenger"
 *
 *   # APPLY changes
 *   DRY_RUN=false node scripts/reset_leave_register_and_balances.js --designations "driver,cleaner,security guard,scavenger"
 *
 * Optional:
 *   --limit 50
 *   --financialYear "2025-2026"   (when set, only mutates LeaveRegisterYear docs for that FY string)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const Employee = require('../employees/model/Employee');
const Designation = require('../departments/model/Designation');
const LeaveRegisterYear = require('../leaves/model/LeaveRegisterYear');
const leaveRegisterYearLedgerService = require('../leaves/services/leaveRegisterYearLedgerService');
const dateCycleService = require('../leaves/services/dateCycleService');

function parseBool(v, defaultValue = true) {
  if (v == null) return defaultValue;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(s)) return false;
  return defaultValue;
}

function parseArg(name) {
  const key = String(name).replace(/^--/, '');
  const idx = process.argv.findIndex((a) => a === `--${key}`);
  if (idx >= 0 && process.argv[idx + 1] != null) return process.argv[idx + 1];
  return undefined;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniq(arr) {
  return [...new Set(arr)];
}

function maskMongoUri(uri) {
  const s = String(uri || '');
  // Hide credentials if present: mongodb+srv://user:pass@host/...
  return s.replace(/(\/\/)([^/:@]+):([^@]+)@/g, '$1$2:***@');
}

async function zeroCreditsAndTransfersForDesignations() {
  // Default is DRY RUN to keep this safe; user can set DRY_RUN=false.
  const dryRun = parseBool(process.env.DRY_RUN, true);

  const designationsRaw = parseArg('designations') || 'driver,cleaner,security guard,scavenger';
  const designationNames = uniq(
    String(designationsRaw)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(normalizeName)
  );

  const limit = Number(parseArg('limit') || process.env.LIMIT || 0);
  const financialYearFilter = parseArg('financialYear') || process.env.FINANCIAL_YEAR || null;
  const report = parseBool(parseArg('report'), false);
  const reportLimitPerDesignation = Number(parseArg('reportLimitPerDesignation') || 5);

  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URL ||
    null;
  if (!uri) {
    throw new Error(
      'Mongo URI not found in environment. Expected one of: MONGODB_URI, MONGO_URI, MONGODB_URL. ' +
        'Check backend/.env.'
    );
  }
  console.log(`[reset_leave_register_and_balances] Connecting to MongoDB: ${maskMongoUri(uri)}`);
  await mongoose.connect(uri);

  // Resolve designations (case-insensitive match on name).
  const nameOrRegex =
    designationNames.length > 0
      ? { $or: designationNames.map((n) => ({ name: new RegExp(`^${escapeRegExp(n)}$`, 'i') })) }
      : {};

  const designationDocs = await Designation.find(nameOrRegex).select('_id name').lean();
  const matched = designationDocs.map((d) => ({
    id: d._id,
    normalized: normalizeName(d.name),
    original: d.name,
  }));

  if (!matched.length) {
    throw new Error(
      `No matching designations found for: ${designationNames.join(', ')}. ` +
        `Check exact designation names in DB (Designation.name).`
    );
  }

  const designationIds = matched.map((d) => d.id);
  console.log(
    JSON.stringify(
      {
        dryRun,
        designations: matched.map((m) => ({ id: String(m.id), name: m.original })),
        financialYearFilter,
        limit: limit > 0 ? limit : null,
      },
      null,
      2
    )
  );

  // Determine reporting FY (for --report mode).
  let reportFyName = null;
  if (report) {
    if (financialYearFilter) {
      reportFyName = String(financialYearFilter).trim();
    } else {
      const fy = await dateCycleService.getFinancialYearForDate(new Date());
      reportFyName = fy?.name || null;
    }
  }

  function computeUiCreditedFromSlot(slot) {
    const txs = Array.isArray(slot?.transactions) ? slot.transactions : [];
    const isReversalCredit = (tx) => {
      if (!tx) return false;
      return (
        String(tx.transactionType || '').toUpperCase() === 'CREDIT' &&
        String(tx.reason || '').includes('Leave Application Cancelled/Reversed')
      );
    };

    let clAccrued = 0;
    let clEarnedCcl = 0;
    let clReversal = 0;

    let cclEarned = 0;
    let cclReversal = 0;

    let elAccrued = 0;
    let elReversal = 0;

    for (const t of txs) {
      const lt = String(t?.leaveType || '').toUpperCase();
      const tt = String(t?.transactionType || '').toUpperCase();
      if (tt !== 'CREDIT') continue;
      const days = Number(t?.days) || 0;
      if (!days) continue;

      const reversal = isReversalCredit(t) ? days : 0;

      if (lt === 'CL') {
        if (reversal) clReversal += reversal;
        if (String(t?.autoGeneratedType || '').toUpperCase() === 'INITIAL_BALANCE') clAccrued += days;
        else if (String(t?.reason || '').includes('CCL')) clEarnedCcl += days;
        else clAccrued += days;
      } else if (lt === 'CCL') {
        cclEarned += days;
        if (reversal) cclReversal += reversal;
      } else if (lt === 'EL') {
        elAccrued += days;
        if (reversal) elReversal += reversal;
      }
    }

    const clCredited = Math.max(0, clAccrued + clEarnedCcl - clReversal);
    const cclCredited = Math.max(0, cclEarned - cclReversal);
    const elCredited = Math.max(0, elAccrued - elReversal);

    return {
      cl: clCredited,
      ccl: cclCredited,
      el: elCredited,
    };
  }

  // --report mode: show per-employee current credits per month + expected after update (0).
  if (report) {
    if (!reportFyName) throw new Error('Unable to resolve report FY name.');
    const fyLabel = reportFyName;

    const designationNameById = new Map(matched.map((m) => [String(m.id), m.original]));

    const sampledEmployeesByDesignation = new Map();
    for (const desigId of designationIds) {
      const empRows = await Employee.find({ designation_id: desigId })
        .sort({ employee_name: 1, emp_no: 1 })
        .limit(reportLimitPerDesignation)
        .select('_id emp_no employee_name designation_id doj is_active')
        .lean();

      sampledEmployeesByDesignation.set(String(desigId), empRows);
    }

    for (const desigId of designationIds) {
      const desigName = designationNameById.get(String(desigId)) || String(desigId);
      const employeesSample = sampledEmployeesByDesignation.get(String(desigId)) || [];

      console.log(`\n=== Designation: ${desigName} (FY: ${fyLabel}) ===`);
      if (!employeesSample.length) {
        console.log('No employees found for this designation.');
        continue;
      }

      for (const emp of employeesSample) {
        const employeeId = emp._id;
        const doc = await LeaveRegisterYear.findOne({
          employeeId,
          financialYear: fyLabel,
        }).lean();

        if (!doc?.months?.length) {
          console.log(`\nEmployee ${emp.emp_no} (${emp.employee_name}): LeaveRegisterYear missing in FY ${fyLabel}`);
          continue;
        }

        // Keep month order stable (1..12) if present.
        const monthsOrdered = [...doc.months].sort((a, b) => {
          const ai = Number(a?.payrollMonthIndex) || 0;
          const bi = Number(b?.payrollMonthIndex) || 0;
          return ai - bi;
        });

        const rows = monthsOrdered.map((m) => {
          const label = m?.label || `${m?.payrollCycleMonth}/${m?.payrollCycleYear}`;
          const credited = computeUiCreditedFromSlot(m);
          return {
            Month: label,
            CL_Credited_before: credited.cl,
            CCL_Credited_before: credited.ccl,
            EL_Credited_before: credited.el,
            CL_Credited_after: 0,
            CCL_Credited_after: 0,
            EL_Credited_after: 0,
          };
        });

        console.log(`\nEmployee ${emp.emp_no} (${emp.employee_name}):`);
        // Keep the table readable in console by rounding values.
        const roundedRows = rows.map((r) => ({
          Month: r.Month,
          CL_Credited_before: Number(r.CL_Credited_before.toFixed ? r.CL_Credited_before.toFixed(2) : r.CL_Credited_before),
          CCL_Credited_before: Number(r.CCL_Credited_before.toFixed ? r.CCL_Credited_before.toFixed(2) : r.CCL_Credited_before),
          EL_Credited_before: Number(r.EL_Credited_before.toFixed ? r.EL_Credited_before.toFixed(2) : r.EL_Credited_before),
          CL_Credited_after: 0,
          CCL_Credited_after: 0,
          EL_Credited_after: 0,
        }));
        console.table(roundedRows);
      }
    }

    await mongoose.disconnect();
    return;
  }

  // Find all employees currently tagged with those designations.
  const empQuery = { designation_id: { $in: designationIds } };
  let employees = await Employee.find(empQuery)
    .select('_id emp_no employee_name designation_id is_active doj')
    .lean();

  if (limit > 0) employees = employees.slice(0, limit);
  if (!employees.length) {
    console.log('No employees found for matched designations. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let totalEmployeesProcessed = 0;
  let totalDocsProcessed = 0;
  let totalSlotsTouched = 0;
  let totalCreditTxRemoved = 0;
  const missingEmployees = [];

  for (const emp of employees) {
    const employeeId = emp._id;
    const docsQuery = { employeeId };
    if (financialYearFilter) docsQuery.financialYear = financialYearFilter;

    const yearDocs = await LeaveRegisterYear.find(docsQuery);
    if (!yearDocs.length) {
      missingEmployees.push({
        empNo: emp.emp_no,
        employeeName: emp.employee_name || '',
        designationId: emp.designation_id ? String(emp.designation_id) : null,
      });
      continue;
    }

    totalEmployeesProcessed++;

    for (const doc of yearDocs) {
      totalDocsProcessed++;

      let docChanged = false;
      let slotsChanged = 0;
      let creditTxRemovedInDoc = 0;

      for (const slot of doc.months || []) {
        if (!slot) continue;

        // Mutate scheduled pools for transfer to become 0 in UI.
        const beforeCl = Number(slot.clCredits) || 0;
        const beforeCcl = Number(slot.compensatoryOffs) || 0;
        const beforeEl = Number(slot.elCredits) || 0;

        if (beforeCl !== 0) slot.clCredits = 0;
        if (beforeCcl !== 0) slot.compensatoryOffs = 0;
        if (beforeEl !== 0) slot.elCredits = 0;
        if (slot.lockedCredits != null && Number(slot.lockedCredits) !== 0) slot.lockedCredits = 0;

        // Clear cached pool carry artifacts (for consistency in maintenance UI).
        slot.poolCarryForwardIn = { cl: 0, ccl: 0, el: 0 };
        slot.poolCarryForwardOut = { cl: 0, ccl: 0, el: 0 };
        slot.poolCarryForwardOutAt = null;
        slot.poolCarryForwardFromLabel = '';

        // Make cached ceiling 0 so monthly "Remaining" becomes 0.
        slot.monthlyApplyCeiling = 0;
        slot.monthlyApplySyncedAt = new Date();

        // Remove ledger credits so “Credited” columns become 0.
        if (Array.isArray(slot.transactions) && slot.transactions.length > 0) {
          const beforeCount = slot.transactions.length;
          const filtered = slot.transactions.filter((t) => {
            const lt = String(t?.leaveType || '').toUpperCase();
            const tt = String(t?.transactionType || '').toUpperCase();
            // Remove any CREDIT for the three pool types.
            if (tt === 'CREDIT' && (lt === 'CL' || lt === 'CCL' || lt === 'EL')) return false;
            return true;
          });
          creditTxRemovedInDoc += beforeCount - filtered.length;
          slot.transactions = filtered;
        }

        const afterCl = Number(slot.clCredits) || 0;
        const afterCcl = Number(slot.compensatoryOffs) || 0;
        const afterEl = Number(slot.elCredits) || 0;

        if (beforeCl !== afterCl || beforeCcl !== afterCcl || beforeEl !== afterEl) {
          slotsChanged++;
        }
      }

      // Keep FY totals consistent (ledger recalc also updates balances).
      doc.yearlyPolicyClScheduledTotal = 0;
      doc.yearlyClCreditDaysPosted = 0;
      doc.yearlyCclCreditDaysPosted = 0;

      if (creditTxRemovedInDoc > 0) docChanged = true;
      // slotsChanged is derived only from scheduled credits; if all were already 0, it's fine.
      if (slotsChanged > 0) docChanged = true;

      if (docChanged && !dryRun) {
        doc.markModified('months');
        doc.markModified('yearlyPolicyClScheduledTotal');
        doc.markModified('yearlyClCreditDaysPosted');
        doc.markModified('yearlyCclCreditDaysPosted');
        await doc.save();
      }

      totalSlotsTouched += slotsChanged;
      totalCreditTxRemoved += creditTxRemovedInDoc;
    }

    // Recalculate balances for this employee (ensures ledger opening/closing matches new tx sets).
    if (!dryRun) {
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CL');
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'CCL');
      await leaveRegisterYearLedgerService.recalculateRegisterBalances(employeeId, 'EL');
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        employeesFound: employees.length,
        employeesProcessed: totalEmployeesProcessed,
        leaveRegisterYearDocsProcessed: totalDocsProcessed,
        monthSlotsTouched: totalSlotsTouched,
        creditTxRemoved: totalCreditTxRemoved,
        missingEmployeesCount: missingEmployees.length,
      },
      null,
      2
    )
  );

  if (missingEmployees.length > 0) {
    console.log('\nEmployees without LeaveRegisterYear docs (skipped):');
    console.table(
      missingEmployees.map((e) => ({
        empNo: e.empNo,
        employeeName: e.employeeName,
        designationId: e.designationId,
      }))
    );
  } else {
    console.log('\nNo missing employees (all designation-matched employees have LeaveRegisterYear docs).');
  }

  await mongoose.disconnect();
}

// Default behavior of this script now targets “designations scoped zero credits + zero transfer”.
zeroCreditsAndTransfersForDesignations().catch(async (error) => {
  console.error('❌ Error:', error?.message || error);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
