import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'frontend', 'src');

function d(s) {
  return s.replaceAll('__D__', 'div');
}

function patch(rel, from, to) {
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath)) {
    console.log('MISSING', rel);
    return false;
  }
  let s = fs.readFileSync(filePath, 'utf8');
  const fixedFrom = d(from);
  if (!s.includes(fixedFrom)) {
    console.log('NOT FOUND:', rel);
    return false;
  }
  s = s.replace(fixedFrom, to);
  fs.writeFileSync(filePath, s);
  console.log('OK:', rel);
  return true;
}

function addImport(rel) {
  const filePath = path.join(root, rel);
  let s = fs.readFileSync(filePath, 'utf8');
  const imp = "import { EmployeeIdentityCell } from '@/components/employee/EmployeeIdentityCell';";
  if (s.includes(imp)) return;
  const m = s.match(/^('use client';\s*\n)/);
  if (m) s = s.replace(m[0], m[0] + imp + '\n');
  else if (s.startsWith("import ")) s = imp + '\n' + s;
  else s = imp + '\n' + s;
  fs.writeFileSync(filePath, s);
}

const summaryOld = d(`                        <__D__>
                          <__D__ className="font-semibold truncate">{empName}</__D__>
                          <__D__ className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 truncate">
                            <span className="truncate">{empNo}</span>
                            {row.pr.summaryLocked && (
                              <span className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0" title="Summary locked — skipped on Sync All unless overridden">
                                Locked
                              </span>
                            )}
                            {department && <span className="truncate">• {department}</span>}
                          </__D__>
                          {leftDateStr && (
                            <__D__ className="text-[9px] text-amber-600 dark:text-amber-400 font-medium mt-0.5" title="Left in this payroll period">
                              Left {leftDateStr}
                            </__D__>
                          )}
                        </__D__>`);

const summaryNew = `                        <EmployeeIdentityCell
                          employee={employee}
                          name={empName}
                          empNo={empNo}
                          showDepartment
                          empNoExtra={
                            row.pr.summaryLocked ? (
                              <span className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0" title="Summary locked — skipped on Sync All unless overridden">
                                Locked
                              </span>
                            ) : undefined
                          }
                        />`;

// RosterGrid
addImport('app/(workspace)/shift-roster/components/RosterGrid.tsx');
patch(
  'app/(workspace)/shift-roster/components/RosterGrid.tsx',
  d(`                <__D__ className="flex flex-col gap-0.5">
                    <__D__ className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate max-w-[140px]">{emp.employee_name}</span>
                        <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-1 rounded">#{emp.emp_no}</span>
                    </__D__>
                    <__D__ className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[160px]">{emp.designation?.name || 'Staff'}</span>
                        {emp.department && (
                            <span className="text-[8px] font-bold text-blue-500/80 dark:text-blue-400/80 uppercase tracking-widest truncate max-w-[160px]">{emp.department.name}</span>
                        )}
                    </__D__>`),
  `                <EmployeeIdentityCell employee={emp} showDepartment size="sm" className="max-w-[180px]" />`
);

// AssignmentsView workspace
addImport('app/(workspace)/shift-roster/components/AssignmentsView.tsx');
patch(
  'app/(workspace)/shift-roster/components/AssignmentsView.tsx',
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

// Superadmin copies of roster components
for (const rel of [
  'app/superadmin/shift-roster/components/RosterGrid.tsx',
  'app/superadmin/shift-roster/components/AssignmentsView.tsx',
]) {
  if (fs.existsSync(path.join(root, rel))) {
    addImport(rel);
    const wsRel = rel.replace('superadmin', '(workspace)');
    const wsPath = path.join(root, wsRel);
    const saPath = path.join(root, rel);
    if (fs.existsSync(wsPath)) {
      let ws = fs.readFileSync(wsPath, 'utf8');
      let sa = fs.readFileSync(saPath, 'utf8');
      const imp = "import { EmployeeIdentityCell } from '@/components/employee/EmployeeIdentityCell';";
      if (!sa.includes(imp) && ws.includes(imp)) {
        const m = sa.match(/^('use client';\s*\n)/);
        if (m) sa = sa.replace(m[0], m[0] + imp + '\n');
        else sa = imp + '\n' + sa;
      }
      // copy EmployeeIdentityCell usage blocks from workspace if superadmin still has old pattern
      if (sa.includes('emp.employee_name') && ws.includes('EmployeeIdentityCell')) {
        const gridOld = d(`                <__D__ className="flex flex-col gap-0.5">
                    <__D__ className="flex items-center gap-1.5">`);
        if (rel.includes('RosterGrid') && sa.includes(d('<span className="text-[10px] font-bold'))) {
          patch(rel, d(`                <__D__ className="flex flex-col gap-0.5">
                    <__D__ className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate max-w-[140px]">{emp.employee_name}</span>
                        <span className="text-[8px] font-bold text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 px-1 rounded">#{emp.emp_no}</span>
                    </__D__>
                    <__D__ className="flex flex-col gap-0.5">
                        <span className="text-[8px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate max-w-[160px]">{emp.designation?.name || 'Staff'}</span>
                        {emp.department && (
                            <span className="text-[8px] font-bold text-blue-500/80 dark:text-blue-400/80 uppercase tracking-widest truncate max-w-[160px]">{emp.department.name}</span>
                        )}
                    </__D__>`), `                <EmployeeIdentityCell employee={emp} showDepartment size="sm" className="max-w-[180px]" />`);
        }
        if (rel.includes('AssignmentsView') && sa.includes('item.employee.employee_name || item.employee.emp_no')) {
          patch(rel, d(`                            <__D__>
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
                            </__D__>`), `                            <EmployeeIdentityCell employee={item.employee} showDepartment size="sm" />`);
        }
      }
    }
  }
}

// Superadmin arrears
addImport('app/superadmin/arrears/page.tsx');
patch(
  'app/superadmin/arrears/page.tsx',
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
                        />`
);

// Superadmin pay-register summary
addImport('app/superadmin/pay-register/page.tsx');
patch('app/superadmin/pay-register/page.tsx', summaryOld, summaryNew);

console.log('batch complete');
