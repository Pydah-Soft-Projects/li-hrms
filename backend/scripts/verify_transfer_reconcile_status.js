const path = require('path');
const { spawnSync } = require('child_process');

const empNos =
  String(process.argv[2] || '06,128,71,5008,1823,2067,1644,1724,166,2163')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const scriptPath = path.join(__dirname, 'reconcile_leave_register_all_transfers_to_opening.js');
const rows = [];

for (const empNo of empNos) {
  const run = spawnSync(
    process.execPath,
    [
      scriptPath,
      '--empNo',
      empNo,
      '--untilMonth',
      '6',
      '--untilYear',
      '2026',
      '--financialYear',
      '2026',
      '--skip-auto-reject',
    ],
    { cwd: path.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  const raw = `${run.stdout || ''}${run.stderr || ''}`;
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    rows.push({ empNo, error: 'no_json' });
    continue;
  }
  try {
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const monthRows = (parsed.monthDiffs || parsed.after || []).slice(0, 6);
    rows.push({
      empNo,
      employeeName: parsed.employee?.employee_name,
      changed: parsed.changed,
      removedTransferRows: parsed.removedTransferRows,
      rebuiltEdgeCount: Array.isArray(parsed.rebuiltEdges) ? parsed.rebuiltEdges.filter((e) => e.posted).length : 0,
      stillNeedsFix: !!parsed.changed,
    });
  } catch (e) {
    rows.push({ empNo, error: e.message });
  }
}

console.log(
  JSON.stringify(
    {
      dryRun: true,
      target: '6/2026 opening, FY 2026',
      scanned: empNos.length,
      stillNeedsFix: rows.filter((r) => r.stillNeedsFix).length,
      alreadyCorrect: rows.filter((r) => r.changed === false).length,
      rows,
    },
    null,
    2
  )
);
