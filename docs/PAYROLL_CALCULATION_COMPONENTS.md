# Payroll Calculation – Components, Variables, Steps & Checkpoints

This document describes the **calculatePayrollNew** flow in `backend/payroll/services/payrollCalculationService.js`: components, variables, steps, and checkpoints.

---

## Paysheet flow is the payroll flow configuration

The **paysheet flow** (the ordered list of columns) **is** the actual payroll flow configuration. The order of columns and their formulas define the flow. **Field values** (OT pay, attendance deduction, basic pay, month days, payable shifts, EL, statutory cumulative, etc.) come **from the dedicated functions in the services and the controllers**—for the respective employee we get those values from them (e.g. OT pay from the OT service, attendance deduction from the deduction service, statutory from the statutory service). There are dedicated functions for each; we call them (or use the result they wrote) for that employee.

- **Field columns** – Values come from the services and controllers: for each thing (OT pay, attendance deduction, basic pay, etc.) we have dedicated functions in the services and controllers; for the respective employee we get the values from those. We map those values to the columns.
- **Cumulative columns** – When you add **“Add cumulative from step”** and place **Allowances cumulative**, the engine puts the **sum of all allowances** for that employee there. **Deductions cumulative** gets the **sum of all deductions** for that employee. **Statutory cumulative** gets the **statutory (employee share)** total for that employee. These amounts are already calculated by the payroll engine and stored on the record; the column is where that cumulative value is shown in the flow.
- **Formula columns** – Formulas can use the variables above (from the record) and earlier column values (by header-derived key, e.g. `paid_days`, `pf_basic`). Formula context includes camelCase and snake_case aliases (e.g. `month_days`, `present_days`, `salary`, `statutory_deductions`, `round_off`). See **outputColumnService** and **PayrollConfiguration.outputColumns**.

**We use only config.outputColumns (config.steps not used)** – Payroll calculation does not use config.steps; all steps always run. The paysheet uses config.outputColumns only: field = from service/controller, formula = before columns + context.

**Data flow for paysheet field values and formulas**

1. **Payroll calculation** – Always runs all steps and writes to PayrollRecord (DB). config.steps is not used.
2. **config.outputColumns** – Paysheet columns in order:
   - **Field** columns: value is **provided by the service and controller**. The controller builds the payslip from PayrollRecord (filled by the steps); `getValueByPath(payslip, col.field)` returns that value.
   - **Formula** columns: value is computed from **before columns** (earlier columns in the same list) plus context from the payslip. So formulas can reference both context variables (basicPay, month_days, etc.) and earlier column headers (e.g. paid_days, basic_pay).
3. **outputColumnService.buildRowFromOutputColumns** – Evaluates columns in config order; after each column it adds that column’s value to the context so the next formula can use it (before columns). Field columns always read from the payslip (service/controller).

---

## 1. Entry point

- **Function:** `calculatePayrollNew(employeeId, month, userId, options, sharedContext)`
- **Options:**
  - `source`: `'payregister'` (default) or `'all'` – where attendance data comes from
  - `arrearsSettlements`: optional array of `{ arrearId, amount }`; if empty, pending arrears are auto-fetched
- **sharedContext:** optional `{ department, includeMissing }` for bulk runs (avoids re-fetching)

---

## 2. Sub-services (components)

| Service | Role |
|--------|------|
| **basicPayService** | Basic pay, per-day rate, paid days, incentive (extra days), earned salary |
| **otPayService** | OT hours → OT pay (rate from department/division settings) |
| **allowanceService** | Allowance amount from master (fixed / % of basic or gross), proration |
| **deductionService** | Attendance deduction (late/early), permission deduction, other deductions (fixed / % basic or gross), absent LOP |
| **loanAdvanceService** | Loan EMI + salary advance recovery (`calculateLoanAdvance`) |
| **allowanceDeductionResolverService** | `getIncludeMissingFlag`, `mergeWithOverrides`, `getAbsentDeductionSettings`, `buildBaseComponents` (base allowances + deductions for dept/division) |
| **statutoryDeductionService** | ESI, PF, Profession Tax from StatutoryDeductionConfig; employee share only in payroll; employer share for reporting |
| **ArrearsIntegrationService** | Add arrears to payroll record, process settlements |
| **ArrearsPayrollIntegrationService** | `getPendingArrearsForPayroll(employeeId)` |
| **PayrollBatchService** | Batch handling (used in bulk flow) |
| **LeavePolicySettings** | EL “use as paid in payroll” → adds EL balance to payable shifts |

---

## 3. Main variables (inputs & derived)

### Input / config

- `employeeId`, `month` (YYYY-MM), `userId`
- `employee`: populated (department_id, designation_id, division_id)
- `departmentId`, `divisionId`
- `options.source`, `options.arrearsSettlements`
- `attendanceSummary`: from PayRegisterSummary (or MonthlyAttendanceSummary when source is `'all'`)

### Attendance variables (from summary)

- **Important:** Present days **already include OD days**. OD is not added again in any calculation (paid days, absent days, proration).
- `monthDays` – total days in month  
- `presentDays`, `paidLeaveDays`, `odDays` (for display only; not added to present), `weeklyOffs`, `holidays`  
- `payableShifts` – present + paid leave + (if EL as paid) EL used; may be adjusted with EL  
- `absentDays` – computed: `monthDays - presentDays - weeklyOffs - holidays - paidLeaveDays` (no OD term)  
- `lateCount`, `earlyOutCount` (or combined)  
- `totalOTHours`, `totalOTDays`  
- `elUsedInPayroll` – EL days added as paid when policy is ON  

### Earnings variables

- `basicPay` – full month basic (from employee)  
- `perDaySalary` / `perDayBasicPay` – basic ÷ month days (or similar from basicPayService)  
- `earnedSalary` / `basePayForWork` – basic pay for worked days (prorated by paid days)  
- `incentiveAmount` / `incentive` – extra days pay  
- `totalPaidDays`, `extraDays` (incentive days)  
- `otPay`, `otHours`, `otRatePerHour`  
- `totalAllowances` – sum of resolved allowance amounts  
- **`allowancesCumulative`** – cumulative of all allowances (same as totalAllowances; for use in later steps / formulas)  
- `grossAmountSalary` / `grossSalary` – earned salary + OT + allowances (then used for deductions)  

### Deduction variables

- `totalAttendanceDeduction` – late/early from deductionService  
- `totalDeductions` – attendance + other deductions + **statutory (employee share)** + absent LOP + loan EMI + advance  
- **`deductionsCumulative`** – cumulative of all deductions (same as totalDeductions; for use in later steps / formulas)  
- `absentDeductionAmount` – when absent deduction is enabled (extra LOP days × per day salary)  
- Statutory: `statutoryResult.totalEmployeeShare`, `statutoryResult.totalEmployerShare` (employer for reporting only)  
- **`statutoryCumulative`** – employee share for the month (cumulative for statutory; for use in later steps / formulas)  
- `loanAdvanceResult.totalEMI`, `loanAdvanceResult.totalAdvanceDeduction`  

### Net & final

- `baseNet` – gross − total deductions (before incentive)  
- `netSalary` – baseNet + incentiveAmount; then + arrears if any; then round-off  
- `roundOff` – (rounded net − exact net); rounding rule (e.g. ceil) applied to net  

---

## 4. Steps (order of execution)

| Step | Description | Checkpoint / note |
|------|-------------|-------------------|
| **1** | Load employee; validate gross_salary (warn if missing/0). | Employee must exist; department required. |
| **2** | Resolve attendance source: `payregister` → PayRegisterSummary; else MonthlyAttendanceSummary (with fallback). | Throw if no attendance for month. |
| **3** | Batch lock check: PayrollBatch for (department, division, month). If status in approved/freeze/complete, require recalculation permission. | Throw with BATCH_LOCKED if not allowed. |
| **4** | Build attendance variables: monthDays, presentDays, paidLeaveDays, odDays, payableShifts, holidays, weeklyOffs, lateCount, etc. | — |
| **5** | EL as paid: if LeavePolicySettings.earnedLeave.useAsPaidInPayroll, add min(EL balance, monthDays) to payableShifts and paidLeaveDays; set `elUsedInPayroll`. | Optional; no throw. |
| **6** | Compute absentDays = monthDays − present − weeklyOffs − holidays − paidLeave − odDays. | Days validation: present + weeklyOffs + paidLeave + od + absent + holidays should equal monthDays (warning if not). |
| **7** | Basic pay: `basicPayService.calculateBasicPay(employee, attendanceSummary)` → basicPay, perDaySalary, earnedSalary, incentiveAmount, totalPaidDays, extraDays. | — |
| **8** | OT pay: `otPayService.calculateOTPay(otHours, departmentId[, divisionId])` → otPay, otRatePerHour. | — |
| **9** | Base gross: grossAmountSalary = earnedSalary + otPay. | — |
| **10** | Base components: `buildBaseComponents(departmentId, basicPay, attendanceData, divisionId)` → base allowances + base deductions. Merge with employee overrides via `mergeWithOverrides(..., includeMissing)`. | includeMissing from sharedContext or getIncludeMissingFlag. |
| **11** | Process allowances: for each resolved allowance, compute amount (basic/gross base, proration if any); sum → totalAllowances. grossAmountSalary += totalAllowances. | Invalid amount → log and skip (null), filter out. |
| **12** | Attendance deduction: `deductionService.calculateAttendanceDeduction(employeeId, month, departmentId, perDaySalary, divisionId)` → totalAttendanceDeduction. | — |
| **13** | Other deductions: for each resolved deduction, compute amount (basic/gross); add to totalDeductions; build deductionBreakdown. | Invalid amount → log and skip. |
| **14** | **Statutory deductions:** `statutoryDeductionService.calculateStatutoryDeductions(basicPay, grossSalary, …)` → ESI, PF, Profession Tax; **only employee share** added to totalDeductions; employer share stored for reporting. | Config from StatutoryDeductionConfig (ESI/PF/PT enabled, rates, ceilings). |
| **15** | Absent LOP: if getAbsentDeductionSettings.enableAbsentDeduction and lopDaysPerAbsent > 1, add (absentDays × (lopDaysPerAbsent−1)) × perDaySalary to totalDeductions. | — |
| **16** | Loan & advance: `loanAdvanceService.calculateLoanAdvance(employeeId, month)` → totalEMI, totalAdvanceDeduction; add to totalDeductions. | — |
| **17** | Net: baseNet = max(0, grossAmountSalary − totalDeductions); netSalary = baseNet + incentiveAmount. | — |
| **18** | Get or create PayrollRecord (findOne by employeeId + month, or create new). | — |
| **19** | Set record: attendance, earnings, deductions (attendance + other + statutoryDeductions, totalStatutoryEmployee, totalStatutoryEmployer, statutoryCumulative, total), loanAdvance. | — |
| **20** | Arrears: if options.arrearsSettlements empty, call getPendingArrearsForPayroll; if any, addArrearsToPayroll then processArrearsSettlements. Adjust gross and net. | Optional; catch and log errors. |
| **21** | Round-off: e.g. exactNet → ceil(exactNet); roundOff = rounded − exact. Set netSalary and roundOff on record. | — |
| **22** | Save payroll record. | — |
| **23** | (Legacy flow only) createTransactionLogs. | In calculatePayroll path. |

---

## 5. Checkpoints (validations & guards)

- **Employee:** Must exist; must have department (departmentId); gross_salary can be 0 (warning, proceed with 0).
- **Attendance:** Must have either PayRegisterSummary (when source is payregister) or MonthlyAttendanceSummary / pay register fallback; else throw “Pay register not found” or “Attendance summary not found”.
- **Batch:** If batch exists and status is approved/freeze/complete, must have recalculation permission; else throw BATCH_LOCKED.
- **Days:** After computing absentDays, a check ensures present + weeklyOffs + paidLeave + od + absent + holidays = monthDays; only warning if mismatch.
- **Basic pay:** basicPayResult must have valid basicPay (number); invalid result throws in legacy path.
- **OT pay:** otPayResult must have valid otPay (number); invalid result throws in legacy path.
- **Allowances/Deductions:** Per-item NaN amounts are logged and excluded from totals (no throw).

---

## 6. PayrollRecord fields written (summary)

- **Top-level:** totalPayableShifts, elUsedInPayroll, netSalary, payableAmountBeforeAdvance, division_id, status, startDate/endDate (if from pay register), arrearsAmount (if arrears applied), roundOff.
- **attendance:** totalDaysInMonth, presentDays, paidLeaveDays, odDays, weeklyOffs, holidays, absentDays, payableShifts, extraDays, totalPaidDays, otHours, otDays, earnedSalary, lateIns, earlyOuts.
- **earnings:** basicPay, perDayBasicPay, payableAmount (earned salary), incentive, otPay, otHours, otRatePerHour, totalAllowances, **allowancesCumulative**, allowances[], grossSalary.
- **deductions:** attendanceDeduction, attendanceDeductionBreakdown, permissionDeduction, leaveDeduction, totalOtherDeductions, otherDeductions[], **statutoryDeductions[]**, totalStatutoryEmployee, totalStatutoryEmployer, **statutoryCumulative**, **deductionsCumulative**, totalDeductions.
- **loanAdvance:** totalEMI, advanceDeduction (and breakdowns where applicable).
- **calculationMetadata:** calculatedAt, calculatedBy, calculationVersion, settingsSnapshot (OT, permission, attendance rules).

---

## 7. Two calculation paths (for reference)

- **calculatePayroll(employeeId, month, userId)** – legacy path: can use PayRegisterSummary or MonthlyAttendanceSummary; two-pass allowances (basic then gross); permission deduction; leave deduction (often 0); then same deduction/loan/advance/net/round-off/save/arrears/transaction logs.
- **calculatePayrollNew(...)** – current path: source-driven attendance; EL-as-paid; single gross = earned + OT + allowances; attendance + other + absent LOP + loan/advance; net + incentive; arrears; round-off; save. No transaction logs in this path.

All production flows (single, bulk, recalc) use **calculatePayrollNew**.

---

## 8. Paysheet columns (flow order)

The paysheet is the **payroll flow configuration**: columns in order, each either a **field** or a **formula**. Field values (OT pay, attendance deduction, basic pay, month days, payable shifts, EL, statutory cumulative, advance deduction, loan EMI, round off, etc.) come **from the dedicated functions in the services and the controllers**—for the respective employee we get those values from them. Formula columns can use those variables and earlier column values (by header-derived key, e.g. `paid_days`, `pf_basic`, `actual_earning`). Typical flow-order columns:

1. Emp (Employee Code)  
2. Name  
3. Designation  
4. Basic pay (salary)  
5. Month days  
6. Payable shifts  
7. EL (Earned leave used in payroll)  
8. Paid days (formula, e.g. `Math.min(month_days, present_days + week_offs + holidays + paidleaves + el)`)  
9. Extra days (formula, e.g. `Math.max(0, (present_days + week_offs + holidays + paidleaves + el) - month_days)`)  
10. Salary (Basic pay again for formulas)  
11–18. PF Basic, ESI Basic, Other Basic, Actual Basic; then pf_earning, esi_earning, other_earning, actual_earning (formulas using salary, month_days, paid_days)  
19. Statutory deductions (Statutory cumulative – use “Add cumulative from step” → Statutory)  
20. Net salary (formula, e.g. `actual_earning - statutory_deductions`)  
21. Extra hours Pay (OT pay)  
22. Additions (formula, e.g. `extradays * (salary / month_days)`)  
23. net gross (formula, e.g. `net_salary + extra_hours_pay + additions`)  
24. Total Allowances (use “Add cumulative from step” → Allowances)  
25. Gross salary (formula, e.g. `net_gross + total_allowances`)  
26. Salary Advance (Advance deduction)  
27. Loan Recovery (Loan EMI)  
28. Attendance deduction  
29. Round off  
30. Payable Amount (formula, e.g. `(gross_salary - loan_recovery - salary_advance - attendance_deduction) + round_off`)

Cumulative columns (Allowances cumulative, Deductions cumulative, Statutory cumulative) are added via **“Add cumulative from step”** so the engine knows where to put the sum; per-component amounts are calculated by payroll and stored on the record.
