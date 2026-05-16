import fs from 'fs';

const patches = [
  {
    file: 'frontend/src/app/(workspace)/reports/leave-reports-tab.tsx',
    old: '                                                {leave.employeeId?.employee_name || \'Unknown\'}',
    neu: '                                                <EmployeeIdentityCell employee={leave.employeeId} name={leave.employeeId?.employee_name || \'Unknown\'} empNo={leave.employeeId?.emp_no} size="sm" />',
  },
  {
    file: 'frontend/src/app/(workspace)/reports/od-reports-tab.tsx',
    old: '                                                {od.employeeId?.employee_name || \'Unknown\'}',
    neu: '                                                <EmployeeIdentityCell employee={od.employeeId} name={od.employeeId?.employee_name || \'Unknown\'} empNo={od.employeeId?.emp_no} size="sm" />',
  },
  {
    file: 'frontend/src/app/(workspace)/reports/loan-reports-tab.tsx',
    old: '                                            <p className="text-xs font-black text-slate-900 dark:text-white">{loan.employeeId?.employee_name || \'N/A\'}</p>',
    neu: '                                            <EmployeeIdentityCell employee={loan.employeeId} name={loan.employeeId?.employee_name || \'N/A\'} size="sm" />',
  },
];

const imp = "import { EmployeeIdentityCell } from '@/components/employee/EmployeeIdentityCell';";

for (const { file, old, neu } of patches) {
  if (!fs.existsSync(file)) { console.log('missing', file); continue; }
  let s = fs.readFileSync(file, 'utf8');
  if (!s.includes(old)) { console.log('NF', file); continue; }
  if (!s.includes(imp)) {
    s = s.replace(/^('use client';\r?\n)/, `$1${imp}\n`);
  }
  s = s.replace(old, neu);
  fs.writeFileSync(file, s);
  console.log('OK', file);
}
