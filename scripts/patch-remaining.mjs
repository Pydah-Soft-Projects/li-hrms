import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'frontend', 'src');
const d = (s) => s.replaceAll('__D__', 'div');

function patch(rel, from, to) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) { console.log('MISSING', rel); return; }
  let s = fs.readFileSync(fp, 'utf8');
  const f = d(from);
  if (!s.includes(f)) { console.log('NF', rel); return; }
  s = s.replace(f, to);
  fs.writeFileSync(fp, s);
  console.log('OK', rel);
}

function imp(rel) {
  const fp = path.join(root, rel);
  let s = fs.readFileSync(fp, 'utf8');
  const line = "import { EmployeeIdentityCell } from '@/components/employee/EmployeeIdentityCell';";
  if (s.includes(line)) return;
  const m = s.match(/^('use client';\s*\n)/);
  s = m ? s.replace(m[0], m[0] + line + '\n') : line + '\n' + s;
  fs.writeFileSync(fp, s);
}

// AssignmentsView workspace
imp('app/(workspace)/shift-roster/components/AssignmentsView.tsx');
patch('app/(workspace)/shift-roster/components/AssignmentsView.tsx',
  d(`                            <__D__>
                                <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-tight leading-tight">
                                    {item.employee.employee_name || item.employee.emp_no}
                                </h3>
                                <__D__ className="flex flex-col gap-0.5 mt-0.5">
                                    <__D__ className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.employee.emp_no}</span>
                                        <__D__ className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-slate-700"></__D__>
                                        <span className="text-[8px] font-black text-slate-500/80 dark:text-slate-400/80 uppercase tracking-wider">{item.employee.designation?.name || 'Staff'}</span>
                                    </__D__>
                                    <span className="text-[8px] font-black text-blue-500/80 dark:text-blue-400/80 uppercase tracking-wider truncate max-w-[120px]">
                                        {item.employee.department?.name || 'No Dept'}
                                    </span>
                                </__D__>
                            </__D__>`),
  `                            <EmployeeIdentityCell employee={item.employee} showDepartment size="sm" />`);

// Superadmin arrears
imp('app/superadmin/arrears/page.tsx');
patch('app/superadmin/arrears/page.tsx',
  d(`                        <__D__ className="min-w-0">
                          <p className="text-sm font-bold text-slate-950 dark:text-white whitespace-normal break-words leading-5">{getEmployeeName(ar.employee)}</p>
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-normal break-words leading-5">
                            {(() => {
                              const empNo = sanitizeDisplayValue(ar.employee.emp_no);
                              const designation = getDesignationName(ar.employee);
                              if (empNo && designation) return \`\${empNo} · \${designation}\`;
                              return empNo || designation || '—';
                            })()}
                          </p>
                        </__D__>`),
  `                        <EmployeeIdentityCell
                          employee={ar.employee}
                          name={getEmployeeName(ar.employee)}
                          designation={getDesignationName(ar.employee)}
                          size="sm"
                          className="min-w-0"
                        />`);

// Mirror roster to superadmin
for (const [ws, sa] of [
  ['app/(workspace)/shift-roster/components/RosterGrid.tsx', 'app/superadmin/shift-roster/components/RosterGrid.tsx'],
  ['app/(workspace)/shift-roster/components/AssignmentsView.tsx', 'app/superadmin/shift-roster/components/AssignmentsView.tsx'],
]) {
  if (fs.existsSync(path.join(root, sa))) {
    imp(sa);
    let wsContent = fs.readFileSync(path.join(root, ws), 'utf8');
    let saContent = fs.readFileSync(path.join(root, sa), 'utf8');
    if (wsContent.includes('EmployeeIdentityCell employee={emp}') && saContent.includes('emp.employee_name')) {
      saContent = saContent.replace(
        d(`                    <__D__ className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate max-w-[140px]">{emp.employee_name}</span>
                        <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-1 rounded">#{emp.emp_no}</span>
                    </__D__>
                    <__D__ className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[160px]">{emp.designation?.name || 'Staff'}</span>
                        {emp.department && (
                            <span className="text-[8px] font-bold text-blue-500/80 dark:text-blue-400/80 uppercase tracking-widest truncate max-w-[160px]">{emp.department.name}</span>
                        )}
                    </__D__>`),
        `                    <EmployeeIdentityCell employee={emp} showDepartment size="sm" className="max-w-[180px]" />`
      );
      fs.writeFileSync(path.join(root, sa), saContent);
      console.log('mirror roster', sa);
    }
    if (wsContent.includes('EmployeeIdentityCell employee={item.employee}') && saContent.includes('item.employee.employee_name || item.employee.emp_no')) {
      saContent = fs.readFileSync(path.join(root, sa), 'utf8');
      saContent = saContent.replace(
        d(`                            <__D__>
                                <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-tight leading-tight">
                                    {item.employee.employee_name || item.employee.emp_no}
                                </h3>
                                <__D__ className="flex flex-col gap-0.5 mt-0.5">
                                    <__D__ className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.employee.emp_no}</span>
                                        <__D__ className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-slate-700"></__D__>
                                        <span className="text-[8px] font-black text-slate-500/80 dark:text-slate-400/80 uppercase tracking-wider">{item.employee.designation?.name || 'Staff'}</span>
                                    </__D__>
                                    <span className="text-[8px] font-black text-blue-500/80 dark:text-blue-400/80 uppercase tracking-wider truncate max-w-[120px]">
                                        {item.employee.department?.name || 'No Dept'}
                                    </span>
                                </__D__>
                            </__D__>`),
        `                            <EmployeeIdentityCell employee={item.employee} showDepartment size="sm" />`
      );
      fs.writeFileSync(path.join(root, sa), saContent);
      console.log('mirror assignments', sa);
    }
  }
}

// Loans approval list pattern
const loanBlock = (varName) => d(`                            <__D__ className="flex items-center gap-3 mb-2">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {${varName}.employeeId?.employee_name || ${varName}.emp_no || 'Unknown'}
                              </span>
                              <span className="text-xs text-slate-500">({${varName}.emp_no || ${varName}.employeeId?.emp_no || 'N/A'})</span>`);

const loanNew = (varName) => `                            <EmployeeIdentityCell
                              employee={${varName}.employeeId}
                              name={${varName}.employeeId?.employee_name || ${varName}.emp_no || 'Unknown'}
                              empNo={${varName}.emp_no || ${varName}.employeeId?.emp_no}
                              size="sm"
                              className="mb-2"
                            />`;

for (const rel of ['app/(workspace)/loans/page.tsx', 'app/superadmin/loans/page.tsx']) {
  imp(rel);
  let s = fs.readFileSync(path.join(root, rel), 'utf8');
  let c = 0;
  for (const v of ['loan', 'advance']) {
    const f = loanBlock(v);
    if (s.includes(f)) { s = s.replace(f, loanNew(v)); c++; }
  }
  // guarantor cards
  const gc = d(`                            <__D__>
                              <__D__ className="font-bold text-slate-900 dark:text-white line-clamp-1">
                                {req.employeeId?.employee_name || 'Unknown'}
                              </__D__>
                              <__D__ className="text-xs font-bold text-slate-500">{req.emp_no || 'N/A'}</__D__>
                            </__D__>`);
  if (s.includes(gc)) { s = s.replace(gc, `<EmployeeIdentityCell employee={req.employeeId} empNo={req.emp_no} size="sm" />`); c++; }
  if (c) { fs.writeFileSync(path.join(root, rel), s); console.log('OK loans', rel, c); }
  else console.log('NF loans', rel);
}

console.log('remaining done');
