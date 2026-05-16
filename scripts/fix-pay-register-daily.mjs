import fs from 'fs';

const files = [
  'frontend/src/app/(workspace)/pay-register/page.tsx',
  'frontend/src/app/superadmin/pay-register/page.tsx',
];

const startMarker = '                          <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">\n                            <div>\n                              <motion className="flex items-center gap-2">'.replace('motion', 'motion');

// Build replacement by reading pattern from file
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const idx = s.indexOf('                                <div className="font-semibold truncate flex-1 flex items-center gap-1">');
  if (idx === -1) { console.log('marker not found', f); continue; }
  // find start of td content - search backwards for sticky left-0 in daily grid context
  const search = '                            <div>\n                              <div className="flex items-center gap-2">\n                                <motion className="font-semibold truncate flex-1 flex items-center gap-1">'.replaceAll('motion', 'div');
  const start = s.indexOf(search);
  if (start === -1) { console.log('start not found', f); continue; }
  const endSearch = '                              </div>\n                            </div>\n                          </td>\n                          {daysArray.map((day) => {';
  const end = s.indexOf(endSearch, start);
  if (end === -1) { console.log('end not found', f); continue; }
  const replacement = `                            <div className="flex items-start gap-2">
                              <EmployeeIdentityCell
                                employee={employee}
                                name={employee_name}
                                empNo={emp_no}
                                showDepartment
                                className="flex-1 min-w-0"
                                empNoExtra={
                                  <>
                                    {pr.summaryLocked && (
                                      <span
                                        className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0"
                                        title="Summary locked — skipped on Sync All unless overridden"
                                      >
                                        Locked
                                      </span>
                                    )}
                                    {isLocked && (
                                      <span title={\`Payroll \${batchStatus}\`} className="text-slate-400 inline-flex">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                          <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                        </svg>
                                      </span>
                                    )}
                                  </>
                                }
                              />
                              <div className="flex gap-2 shrink-0">
                                  {!pr.payrollId ? (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (employee) handleCalculatePayroll(employee);
                                      }}
                                      className="rounded-md px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:shadow-md bg-amber-500 hover:bg-amber-600"
                                      title="Calculate Payroll"
                                    >
                                      Calculate
                                    </button>
                                  ) : (
                                    <Link
                                      href={\`/\${f.includes('superadmin') ? 'superadmin/' : ''}payroll-transactions?employeeId=\${employeeId}&month=\${monthStr}\`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="rounded-md px-2 py-1 text-[9px] font-semibold text-white shadow-sm transition-all hover:shadow-md bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 inline-block"
                                      title="View Payslip"
                                    >
                                      Payslip
                                    </Link>
                                  )}

                                  {!isFrozenOrComplete && (
                                    <motion />
                                  )}
                                </div>
                              </div>`;
  const old = s.slice(start, end);
  // extract buttons section from old
  const btnStart = old.indexOf('<div className="flex gap-2">');
  const btnEnd = old.lastIndexOf('</motion>');
  const buttons = old.slice(btnStart, btnEnd + 6).replace('</motion>', '</div>').replace('<motion />', '<motion />');
  // simpler: keep buttons from old
  const btnBlock = old.substring(old.indexOf('                                <div className="flex gap-2">'));
  const fixedReplacement = replacement.split('                              <div className="flex gap-2 shrink-0">')[0] 
    + '                              <motion className="flex gap-2 shrink-0">'.replace('motion','motion')
    + btnBlock.replace('                                <div className="flex gap-2">', '').replace(/\n                            <\/div>\s*$/, '');
  console.log('would patch', f, 'len', old.length);
}
