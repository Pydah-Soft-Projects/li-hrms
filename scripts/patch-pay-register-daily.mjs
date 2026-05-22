import fs from 'fs';
import path from 'path';

const files = [
  'frontend/src/app/(workspace)/pay-register/page.tsx',
  'frontend/src/app/superadmin/pay-register/page.tsx',
];

const old = `                            <div>
                              <motion className="flex items-center gap-2">
                                <motion className="font-semibold truncate flex-1 flex items-center gap-1">
                                  {employee_name}
                                  {leftDateStrDaily && (
                                    <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium" title="Left in this payroll period">(Left {leftDateStrDaily})</span>
                                  )}
                                  {isLocked && (
                                    <span title={\`Payroll \${batchStatus}\`} className="text-slate-400">
                                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                                        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                                      </svg>
                                    </span>
                                  )}
                                </motion>
                                <motion className="flex gap-2">`.replaceAll('motion', 'div');

const neu = `                            <div className="flex items-start gap-2">
                              <EmployeeIdentityCell
                                employee={employee}
                                name={employee_name}
                                empNo={emp_no}
                                showDepartment
                                showLeftDate={!!leftDateStrDaily}
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
                              <div className="flex gap-2 shrink-0">`;

const old2 = `                                </motion>
                              </motion>
                              <motion className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 truncate mt-1">
                                <span className="truncate">{emp_no}</span>
                                {pr.summaryLocked && (
                                  <span
                                    className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0"
                                    title="Summary locked — skipped on Sync All unless overridden"
                                  >
                                    Locked
                                  </span>
                                )}
                                {department && <span className="truncate">• {department}</span>}
                              </motion>
                            </motion>`.replaceAll('motion', 'motion');

const neu2 = `                                </div>
                              </motion>`.replaceAll('motion', 'div');

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(old)) { console.log('NF1', f); continue; }
  s = s.replace(old, neu);
  const fixedOld2 = old2.replaceAll('motion', 'div');
  if (!s.includes(fixedOld2)) { console.log('NF2', f); continue; }
  s = s.replace(fixedOld2, neu2);
  fs.writeFileSync(f, s);
  console.log('OK', f);
}
