# Paysheet configuration – field sources and validation

This document validates where each paysheet output field comes from and what was removed from the UI.

---

## Removed from field selection (frontend)

These are **no longer** offered as selectable fields in payroll config; use formulas or the alternatives below.

| Removed | Use instead |
|--------|-------------|
| Net salary | Use formula (e.g. `actual_earning - statutory_deductions` or your payable formula). |
| Total deductions | Use **Deductions cumulative** (`deductions.deductionsCumulative`). |
| Final paid days | Use **Payable shifts** or a formula from present days + week offs + holidays + paid leaves + EL. |
| Total paid days | Same as above – use payable shifts or formula. |
| Extra days | Use formula if needed (e.g. extra days from attendance); removed as standalone field. |
| Total allowances | Use **Allowances cumulative** (`earnings.allowancesCumulative`). |
| Gross salary | Use **Basic pay** as the key; gross can be built via formula (e.g. net_gross + total_allowances). |

---

## Field sources (validated)

### 1. Basic pay
- **Source:** `earnings.basicPay` from **basicPayService** (or employee gross_salary / basic as configured).
- **Backend:** `resolveFieldValue('earnings.basicPay')` → `basicPayService.calculateBasicPay(employee, attendanceSummary)`.
- **Correct.**

### 2. OT pay
- **Source:** Overtime pay for the employee based on **approved OT hours** and **rate per OT hour** from settings.
- **Backend:** `earnings.otPay` → **otPayService.calculateOTPay(attendanceSummary.totalOTHours, departmentId)**. OT hours come from **pay register** (`payRegisterSummary.totals.totalOTHours`). Rate comes from OT settings (department/division or global).
- **Correct.** We have otPayService; it uses approved OT hours from pay register and rate from settings.

### 3. Per day basic
- **Source:** `earnings.perDayBasicPay` from basicPayService (per‑day basic).
- **Backend:** Same block as basic pay; returns `perDaySalary`.
- **Correct.**

### 4. Present days
- **Source:** Pay register.
- **Backend:** `attendance.presentDays` from `buildAttendanceFromSummary` → `payRegisterSummary.totals.totalPresentDays`.
- **Correct.**

### 5. Payable shifts
- **Source:** Pay register.
- **Backend:** `attendance.payableShifts` from `buildAttendanceFromSummary` (includes EL when enabled).
- **Correct.**

### 6. Week offs
- **Source:** Pay register (or shift roster; “transaction in personal account” is separate).
- **Backend:** `attendance.weeklyOffs` → `payRegisterSummary.totals.totalWeeklyOffs`.
- **Correct.**

### 7. Paid leaves
- **Source:** Pay register.
- **Backend:** `attendance.paidLeaveDays` → from pay register totals + EL when enabled.
- **Correct.**

### 8. Paid leave days
- **Source:** Pay register; includes leaves applied with nature “paid” / EL.
- **Backend:** Same as paid leave days; EL is added in `buildAttendanceFromSummary` when EL is enabled.
- **Correct.**

### 9. EL (Earned leave used in payroll)
- **Source:** `employee.paidLeaves` (balance); only if EL is **enabled for use in payroll** in settings.
- **Backend:** `attendance.elUsedInPayroll` set in `buildAttendanceFromSummary` from LeavePolicySettings + employee.paidLeaves.
- **Correct.**

### 10. OD days
- **Source:** Pay register; included in present days (no separate “OD” water/field; OD is part of present).
- **Backend:** `attendance.odDays` from `payRegisterSummary.totals.totalODDays` (for display only; present days already reflect worked days).
- **Correct.**

### 11. Absent days
- **Source:** Pay register.
- **Backend:** `attendance.absentDays` computed in `buildAttendanceFromSummary` from month days − present − week offs − holidays − paid leave.
- **Correct.**

### 12. Attendance deduction
- **Source:** **Amount** = cumulative of late‑ins, early‑outs, permission, absent (as per current deduction logic).
- **Backend:** `deductions.attendanceDeduction` → **deductionService.calculateAttendanceDeduction(...)**. Deductions cumulative is sum of attendance + other + statutory + loan EMI + advance.
- **Correct.** Do as previous (no change to deduction behaviour).

### 13. LOP leave days
- **Source:** Days with **approved LOP / loss of pay** leaves.
- **Backend:** `attendance.lopDays` is set from **payRegisterSummary.totals.totalLopDays** (pay register: approved leaves by leave nature; LOP → totalLopDays). If LOP should come only from **approved LOP leave applications**, that would need a separate source (leave applications with LOP nature); for now it remains “days lost / absent” for deduction.
- **Note:** If your policy is “LOP = only approved LOP leave applications”, we need to feed that from leave/attendance module; otherwise current behaviour is “LOP days = absent days”.

### 14. Deductions cumulative
- **Source:** Sum of all deduction components (attendance + other + statutory + loan EMI + advance).
- **Backend:** `deductions.deductionsCumulative` / `deductions.totalDeductions` computed after all deduction steps.
- **Correct.** Use **Deductions cumulative** in config; “Total deductions” option removed from UI.

### 15. Attendance deduction days
- **Source:** Number of days deducted for attendance (late/early/permission/absent) as per current calculation.
- **Backend:** `attendance.attendanceDeductionDays` from `deductionService.calculateAttendanceDeduction` breakdown.
- **Correct.**

### 16. Advance deduction
- **Source:** **Cumulative salary advance deductions** for that employee; **closed** advances ignored; only **active** advances with remaining balance; “from today” / current cycle.
- **Backend:** `loanAdvance.advanceDeduction` → **loanAdvanceService.calculateLoanAdvance** → `processSalaryAdvance(employeeId, payableAmount)`. Uses active advances with `remainingBalance > 0`; closed ones excluded.
- **Correct.**

### 17. Loans (remaining balance)
- **Source:** **Cumulative remaining balance** of all active loans for the employee (after EMI deduction conceptually: what remains to be paid).
- **Backend:** **Added** `loanAdvance.remainingBalance` from `loanAdvanceService.calculateLoanAdvance` (sum of `repayment.remainingBalance` for active loans).
- **Correct.** New output column option: **Loans (remaining balance)**.

### 18. Loan EMI / Loans recovery
- **Source:** **Cumulative EMI** of all loans for the employee (this month’s EMI deduction). “Loans recovery” = same EMI amount (recovery from salary).
- **Backend:** `loanAdvance.totalEMI` from `loanAdvanceService.calculateTotalEMI(employeeId)`.
- **Correct.** Display as “Loan EMI” or “Loans recovery” in header as needed.

### 19. Round off
- **Source:** Paisa adjustment so that **before + round off = whole number** (add or subtract to make non‑decimal).
- **Backend:** `roundOff` = `roundedNet - exactNet` (so that `exactNet + roundOff = roundedNet`). Can be used in formulas; if shown as field, it’s this value.
- **Correct.** You can use round_off in formula; backend provides the value that makes (before operation) + round_off = integer.

### 20. Arrears
- **Source:** From **arrears service** (or pay register when arrears are passed with pay register). Pending approved/partially_settled arrears with remaining amount.
- **Backend:** **Added** `arrears.arrearsAmount` → **ArrearsPayrollIntegrationService.getPendingArrearsForPayroll(employeeId)**, sum of `remainingAmount`. Works with existing arrears integration.
- **Correct.**

---

## Summary

- **Removed from UI:** Net salary, Total deductions, Final paid days, Total paid days, Extra days, Total allowances, Gross salary.
- **All field sources** above are aligned with current (or newly added) backend behaviour.
- **New backend support:** `loanAdvance.remainingBalance`, `arrears.arrearsAmount` in column-driven calculation.
- **LOP days:** From pay register totals.totalLopDays (approved leaves with LOP nature); if you want “only approved LOP leave applications”, that needs a separate data source and can be added later.
