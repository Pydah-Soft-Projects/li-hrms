const fs = require('fs');
const raw = fs.readFileSync(__dirname + '/_scan_all_transfer_audit.json', 'utf8');
const start = raw.indexOf('{\n  "database"');
const j = JSON.parse(raw.slice(start >= 0 ? start : raw.indexOf('{\n  "financialYear"')));
const allEmp = new Set();
const byMonthLt = {};
for (const [month, cats] of Object.entries(j.issuesByMonth || {})) {
  for (const [cat, data] of Object.entries(cats)) {
    if (!data.count) continue;
    for (const emp of data.empNos || []) {
      allEmp.add(emp);
      const key = `${month}|${cat}`;
      if (!byMonthLt[key]) byMonthLt[key] = [];
      byMonthLt[key].push(emp);
    }
  }
}
const lt = { CL: 0, CCL: 0, EL: 0 };
for (const s of j.sampleIssues?.display_vs_ledger_used || []) {
  lt[s.leaveType] = (lt[s.leaveType] || 0) + 1;
}
console.log(JSON.stringify({
  uniqueEmployeesWithIssues: [...allEmp].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })),
  uniqueCount: allEmp.size,
  sampleLeaveTypes: lt,
}, null, 2));
