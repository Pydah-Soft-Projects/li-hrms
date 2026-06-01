/**
 * Batch reconcile monthly pool transfers for a list of emp nos.
 *
 * Usage:
 *   node scripts/reconcile_transfer_batch_emp_nos.js --apply
 *   node scripts/reconcile_transfer_batch_emp_nos.js --empNos 06,128 --untilMonth 6 --untilYear 2026 --financialYear 2026 --apply
 */

const path = require('path');
const { spawnSync } = require('child_process');

function parseArg(name) {
  const key = String(name).replace(/^--/, '');
  const idx = process.argv.findIndex((a) => a === `--${key}`);
  if (idx >= 0 && process.argv[idx + 1] != null && !String(process.argv[idx + 1]).startsWith('--')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const DEFAULT_EMP_NOS =
  '06,128,71,5008,1823,2067,1644,1724,166,2163';
const empNos = String(parseArg('empNos') || DEFAULT_EMP_NOS)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const untilMonth = parseArg('untilMonth') || '6';
const untilYear = parseArg('untilYear') || '2026';
const financialYear = parseArg('financialYear') || '2026';
const apply = hasFlag('apply');
const skipAutoReject = hasFlag('skip-auto-reject') || true; // batch: don't auto-reject pending leaves

const scriptPath = path.join(__dirname, 'reconcile_leave_register_all_transfers_to_opening.js');
const rows = [];
const errors = [];

for (const empNo of empNos) {
  const args = [
    scriptPath,
    '--empNo',
    empNo,
    '--untilMonth',
    untilMonth,
    '--untilYear',
    untilYear,
    '--financialYear',
    financialYear,
    '--skip-auto-reject',
  ];
  if (apply) args.push('--apply');

  const run = spawnSync(process.execPath, args, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  const raw = `${run.stdout || ''}${run.stderr || ''}`;
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) {
    errors.push({ empNo, error: 'no_json_output', rawTail: raw.slice(-500) });
    continue;
  }
  try {
    const parsed = JSON.parse(raw.slice(jsonStart));
    rows.push({
      empNo,
      ok: parsed.ok,
      changed: parsed.changed,
      removedTransferRows: parsed.removedTransferRows,
      rebuiltEdges: parsed.rebuiltEdges,
      employeeName: parsed.employee?.employee_name,
      issueMonthsBefore: (parsed.before || []).filter((m) => {
        const outCl = m.transferLedger?.out?.cl ?? 0;
        const wouldCl = m.wouldCarryFromThisSlot?.cl ?? 0;
        const inCl = m.transferLedger?.in?.cl ?? 0;
        const poolInCl = m.poolCarryForwardIn?.cl ?? 0;
        return outCl !== wouldCl || inCl !== poolInCl;
      }).length,
    });
  } catch (e) {
    errors.push({ empNo, error: e.message, rawTail: raw.slice(jsonStart, jsonStart + 300) });
  }
}

console.log(
  JSON.stringify(
    {
      ok: errors.length === 0,
      dryRun: !apply,
      financialYear,
      targetOpening: { month: Number(untilMonth), year: Number(untilYear) },
      scanned: empNos.length,
      reconciled: rows.filter((r) => r.ok).length,
      changed: rows.filter((r) => r.changed).length,
      errors,
      rows,
    },
    null,
    2
  )
);

process.exit(errors.length > 0 ? 1 : 0);
