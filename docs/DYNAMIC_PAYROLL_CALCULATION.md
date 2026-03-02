# Dynamic Payroll Calculation

The **dynamic payroll** is the flow driven by **Payroll Configuration → output columns**. It decides **which values to compute** and **what the paysheet/payslip looks like** from that config, instead of a fixed sequence of steps.

---

## What “dynamic” means

- **Config-driven:** Payroll Configuration has an array **`outputColumns`**. Each column has:
  - **header** – label on the paysheet (e.g. "Basic Pay", "Gross Salary").
  - **field** – path into the payslip object (e.g. `earnings.basicPay`, `deductions.totalDeductions`), **or**
  - **formula** – expression using other columns and context (e.g. `grossSalary - totalDeductions`).
- **Demand-driven services:** The code **scans** `outputColumns` (fields + formula variables) and sets flags like `needsBasicPay`, `needsOT`, `needsAllowances`, `needsAttendanceDeduction`, `needsStatutory`, etc. **Only those services are run.** So if no column uses OT, OT is not calculated.
- **Column order:** Columns are sorted by `order`. Values are filled in that order; formulas can use **previous columns’ values** (via context) so order matters for derived columns (e.g. Net = Gross − Deductions after deductions exist).

So: **dynamic** = paysheet layout and which payroll components run are determined by **output columns**, not by a hard-coded list of steps.

---

## Where it lives

| Piece | File | Role |
|-------|------|------|
| **Main calculation** | `backend/payroll/services/payrollCalculationFromOutputColumnsService.js` | Entry: `calculatePayrollFromOutputColumns(employeeId, month, userId, options)`. Builds record, runs required services, then fills each output column from field or formula; persists PayrollRecord and returns payslip + row. |
| **Output column helpers** | `backend/payroll/services/outputColumnService.js` | `getContextFromPayslip(payslip)` (all numeric/string vars for formulas), `safeEvalFormula(formula, context)`, `getValueByPath` / `buildRowFromOutputColumns`, `expandOutputColumnsWithBreakdown` for paysheet/export. |
| **Config model** | `backend/payroll/model/PayrollConfiguration.js` | Single-doc config with `outputColumns: [{ header, source, field, formula, order }]`. |

---

## Flow (step by step)

1. **Load config and inputs**
   - Get **PayrollConfiguration** (single doc) → `config.outputColumns`.
   - Load **Employee**, **PayRegisterSummary** for that `employeeId` and `month`.
   - Build **attendance** from pay register: `buildAttendanceFromSummary(payRegisterSummary, employee, month)`:
     - Uses **pay cycle** via `getPayrollDateRange(year, monthNum)` for `totalDaysInMonth`.
     - Fills present days, paid leave, OD, week-offs, holidays, absent days, payable shifts, EL used in payroll, etc., from PayRegisterSummary totals.

2. **Decide which services to run**
   - `getRequiredServices(outputColumns)` scans each column’s `field` and (if formula) **formula variable names**.
   - Sets flags, e.g.:
     - Field like `earnings.basicPay` or formula using `basicPay` / `perDayBasicPay` → `needsBasicPay`.
     - Field like `earnings.otPay` or formula using `otPay` → `needsOT`.
     - Same idea for allowances, attendance deduction, statutory, other deductions, loan/advance, arrears.
   - Dependencies: e.g. if allowances or statutory are needed, basic pay is also needed.

3. **Run only required services (order fixed for correctness)**
   - `runRequiredServices(required, record, ...)` runs in this order:
     - Basic pay (from employee + attendance)
     - OT pay
     - Allowances (department/employee, merge with overrides)
     - Attendance deduction (late-in/early-out/absent/permission; uses employee deduction flags)
     - Statutory (PF/ESI/PT; uses employee apply flags)
     - Other deductions
     - Loan/advance
     - Arrears
   - Each service **writes into** `record` (earnings, deductions, attendance, loanAdvance, arrears). No service runs if its flag is false.

4. **Fill each output column**
   - Sort columns by `order`. For each column:
     - If **formula:** `safeEvalFormula(col.formula, context)`. Context = payslip numbers + **previous columns** (by header → key).
     - If **field:** get value from `record` with `getValueByPath(record, col.field)`. If missing, call `resolveFieldValue(...)` which may trigger a service (e.g. attendance deduction) and then read from record.
   - Value is stored in the **row** under `col.header` and merged into **context** so later columns (or formulas) can refer to it.
   - Record is updated with `setValueByPath(record, fieldPath, val)` when the column is a field.

5. **Net and round-off**
   - If not already set, `record.netSalary` and `record.roundOff` are set from gross and total deductions (e.g. net = ceil(gross - totalDeductions)).

6. **Persist and return**
   - **PayrollRecord** is updated/created with attendance, earnings, deductions, loanAdvance, netSalary, roundOff, etc.
   - Optional: add to **PayrollBatch** (by department/division/month).
   - Return `{ payrollRecord, payslip: record, row }`. The **row** is what you see as one line on the paysheet; **payslip** is the full structure used for PDF/export and for context in formulas.

---

## Pay cycle and attendance

- **buildAttendanceFromSummary** uses **getPayrollDateRange(year, monthNum)** so **totalDaysInMonth** (and thus absent days, paid days logic) follows the **configured pay cycle** (e.g. 26–25), not a fixed calendar month.
- Present days, week-offs, holidays, paid leave, OD, etc. come from **PayRegisterSummary** totals (which are already for that month’s register, typically aligned with the same pay cycle when the register is built).

So the dynamic calculation **respects the pay cycle** for days and attendance inputs.

---

## Statutory proration from output columns

Organizations define “paid days” (or present days, working days, etc.) in their own way. Instead of using a fixed source (e.g. `record.attendance.totalPaidDays`), the config can specify **which output column’s value** to use for statutory proration.

- **Config (PayrollConfiguration):**
  - **`statutoryProratePaidDaysColumnHeader`** – Header of the output column whose value is used as **paid days** when prorating statutory (e.g. `"Paid Days"`, `"Present Days"`, `"Working Days"`). That column must appear **before** any statutory column in column order.
  - **`statutoryProrateTotalDaysColumnHeader`** – (Optional) Header of the column for **total days in month**. If empty, `record.attendance.totalDaysInMonth` is used.

- **Behaviour:**
  - If **`statutoryProratePaidDaysColumnHeader`** is set, statutory is **not** run in `runRequiredServices`. It is computed when the statutory column is processed in the column loop, using the value from the configured column (from **context** = previous columns). So statutory proration uses the organization’s own “paid days” (or present days, etc.) from the output columns.
  - If the config is not set, statutory runs in `runRequiredServices` and proration uses `record.attendance` (e.g. `totalPaidDays` or present + paid leave + week-offs + holidays) as before.

---

## When is this flow used?

- **Run payroll:** When the payroll run uses **strategy = 'dynamic'** and config has **outputColumns**, the controller calls `payrollCalculationFromOutputColumnsService.calculatePayrollFromOutputColumns(...)` instead of the legacy (step-based) calculation.
- **Paysheet (table):** When displaying the paysheet, if config has output columns, each row is built from the payslip + **outputColumns** (same as dynamic calculation output).
- **Excel export:** When export uses strategy `dynamic` and output columns exist, payslips are computed via the same dynamic engine and rows are built with **expandOutputColumnsWithBreakdown** + **buildRowFromOutputColumns** so export matches the dynamic paysheet.

---

## Summary

- **Dynamic payroll** = payroll calculation and paysheet layout driven by **Payroll Configuration → outputColumns** (field paths and formulas).
- **Demand-driven:** Only services needed by those columns are run (`getRequiredServices` + `runRequiredServices`).
- **Order:** Columns are processed by `order`; formulas can use context (previous columns + payslip), so you can have “Gross”, then “Total Deductions”, then “Net = Gross - Total Deductions”.
- **Attendance** is built from PayRegisterSummary and **pay cycle** (`getPayrollDateRange`) so month days and absent/present logic respect the cycle.
- Result is persisted as **PayrollRecord** and returned as **payslip** + **row**; the same output columns are used for paysheet display and Excel export when strategy is dynamic.
