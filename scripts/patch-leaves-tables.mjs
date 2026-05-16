import fs from 'fs';

const f = 'frontend/src/app/superadmin/leaves/page.tsx';
const nl = '\r\n';

const leaveOld =
  '                          <div className="font-medium text-slate-900 dark:text-white">{getEmployeeName({ employee_name: leave.employeeId?.employee_name ?? \'\', first_name: leave.employeeId?.first_name, last_name: leave.employeeId?.last_name, emp_no: leave.employeeId?.emp_no ?? leave.emp_no ?? \'\' } as Employee)}</div>' +
  nl +
  '                          <motion className="text-xs text-slate-500">{formatEmpNoWithDesignation(leave)}</motion>';

const leaveNew = `                          <EmployeeIdentityCell
                            employee={leave.employeeId}
                            name={getEmployeeName({ employee_name: leave.employeeId?.employee_name ?? '', first_name: leave.employeeId?.first_name, last_name: leave.employeeId?.last_name, emp_no: leave.employeeId?.emp_no ?? leave.emp_no ?? '' } as Employee)}
                            empNo={leave.employeeId?.emp_no ?? leave.emp_no}
                            designation={getItemDesignationName(leave)}
                            size="sm"
                          />`;

const odOld =
  '                          <motion className="font-medium text-slate-900 dark:text-white">{getEmployeeName({ employee_name: od.employeeId?.employee_name ?? \'\', first_name: od.employeeId?.first_name, last_name: od.employeeId?.last_name, emp_no: od.employeeId?.emp_no ?? od.emp_no ?? \'\' } as Employee)}</motion>' +
  nl +
  '                          <motion className="text-xs text-slate-500">{formatEmpNoWithDesignation(od)}</motion>';

const odNew = `                          <EmployeeIdentityCell
                            employee={od.employeeId}
                            name={getEmployeeName({ employee_name: od.employeeId?.employee_name ?? '', first_name: od.employeeId?.first_name, last_name: od.employeeId?.last_name, emp_no: od.employeeId?.emp_no ?? od.emp_no ?? '' } as Employee)}
                            empNo={od.employeeId?.emp_no ?? od.emp_no}
                            designation={getItemDesignationName(od)}
                            size="sm"
                          />`;

// Fix motion typos in odOld and leaveOld second lines - use div
const leaveOld2 = leaveOld.replaceAll('motion', 'div');
const odOld2 = odOld.replaceAll('motion', 'div');

let s = fs.readFileSync(f, 'utf8');
let n = 0;
if (s.includes(leaveOld2)) {
  s = s.split(leaveOld2).join(leaveNew);
  n++;
}
if (s.includes(odOld2)) {
  s = s.split(odOld2).join(odNew);
  n++;
}
if (n) {
  fs.writeFileSync(f, s);
  console.log('OK', n);
} else {
  console.log('NF leave', s.includes(leaveOld2), 'od', s.includes(odOld2));
}
