import fs from 'fs';

const p = 'frontend/src/app/(workspace)/pay-register/page.tsx';
let s = fs.readFileSync(p, 'utf8');

const oldBlock = `                        <motion>
                          <motion className="font-semibold truncate">{empName}</motion>
                          <motion className="text-[9px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5 truncate">
                            <span className="truncate">{empNo}</span>
                            {row.pr.summaryLocked && (
                              <span className="shrink-0 font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded px-1 py-0" title="Summary locked — skipped on Sync All unless overridden">
                                Locked
                              </span>
                            )}
                            {department && <span className="truncate">• {department}</span>}
                          </motion>
                          {leftDateStr && (
                            <motion className="text-[9px] text-amber-600 dark:text-amber-400 font-medium mt-0.5" title="Left in this payroll period">
                              Left {leftDateStr}
                            </motion>
                          )}
                        </motion>`;

const newBlock = `                        <EmployeeIdentityCell
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

// Fix motion -> div in oldBlock
const fixedOld = oldBlock.replaceAll('motion', 'div');

if (!s.includes(fixedOld)) {
  console.error('OLD BLOCK NOT FOUND');
  process.exit(1);
}
s = s.replace(fixedOld, newBlock);
fs.writeFileSync(p, s);
console.log('patched summary cell');
