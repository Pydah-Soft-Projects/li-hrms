# Monthly Attendance Summary and Pay Cycle

## Does the monthly summary respect the pay cycle?

**Yes.** The monthly attendance summary is **pay-cycle aware**. It uses the same payroll cycle settings (start day / end day) to decide which date range to use for aggregation. Only attendance, leaves, and ODs that fall **inside that pay cycle window** are included.

---

## How it works

### 1. Which date range is used?

- **Service:** `backend/attendance/services/summaryCalculationService.js` → `calculateMonthlySummary(employeeId, emp_no, year, monthNumber)`.
- **Step 1 – Resolve pay cycle window:**  
  The code does **not** use a fixed calendar month (e.g. 1st–31st). It resolves the actual period from the **payroll cycle**:
  - Builds an anchor date: 15th of the given month, e.g. `year-monthNumber-15`.
  - Calls `dateCycleService.getPeriodInfo(anchorDate)`.
  - Reads `periodInfo.payrollCycle.startDate` and `periodInfo.payrollCycle.endDate`.
- **Step 2 – Use that window for all data:**  
  That `[startDate, endDate]` (as YYYY-MM-DD strings) is then used for:
  - **Attendance:** `AttendanceDaily.find({ employeeNumber, date: { $gte: startDateStr, $lte: endDateStr } })`.
  - **Leaves:** only days that fall within `[payrollStart, payrollEnd]` are counted.
  - **ODs:** same idea (OD days counted only if they fall in the same pay cycle window).

So the summary always aggregates over the **pay cycle** that contains the 15th of the selected month, not over the calendar month 1–30/31.

### 2. Where does the pay cycle come from?

- **dateCycleService** (`backend/leaves/services/dateCycleService.js`) uses **payroll cycle settings**:
  - `getPayrollCycleSettings()` → reads `Settings.getSettingsByCategory('payroll')` and uses `payroll_cycle_start_day` and `payroll_cycle_end_day`.
- **Examples:**
  - If cycle is **1–31:** period is the full calendar month (e.g. 1 Feb–28 Feb).
  - If cycle is **26–25:** for “February” (month 2) the period that contains the 15th is **26 Jan–25 Feb**; attendance/leave/OD in that range are included.

So the same conceptual “pay cycle” (start/end day) is what drives the monthly summary’s date range.

### 3. What is included in the summary?

- **Total present days** – count of AttendanceDaily in the pay cycle window with status PRESENT / PARTIAL (1) or HALF_DAY (0.5).
- **Total payable shifts** – sum of each day’s `payableShifts` in that window.
- **Leaves** – approved leave days that fall within the pay cycle window (each day checked against `[payrollStart, payrollEnd]`).
- **ODs** – approved OD days in the same window.
- **OT, permissions, late-in, early-out, etc.** – all derived from attendance/records within that same window.

So everything in the monthly summary is **scoped to the pay cycle dates**, not to the calendar month 1–30/31.

### 4. When is the summary recalculated?

- When an **AttendanceDaily** is saved or updated → `recalculateOnAttendanceUpdate(emp_no, date)` is triggered.  
  It finds the **pay cycle that contains that date** via `dateCycleService.getPeriodInfo(baseDate)` and then recalculates the summary for that cycle’s `(year, month)`.
- When **leave** or **OD** is approved → recalc runs for every pay cycle that the leave/OD range touches, again using `getPeriodInfo` on from/to dates.

So recalc is also **pay-cycle aware**: one day’s change only updates the summary for the cycle that day belongs to.

### 5. “Month” in the API and UI

- The summary is stored with a **month** field in **YYYY-MM** (e.g. `"2025-02"` for February 2025).
- That month is the **calendar month** used to derive the anchor (15th) and thus the pay cycle. For a 26–25 cycle, “February 2025” means the period **26 Jan 2025 – 25 Feb 2025**.
- The API (e.g. get monthly summary for a month, or calculate for `year, monthNumber`) uses that same idea: the backend resolves the pay cycle for that month and aggregates over it.

So when you “select February” in the UI, you get the summary for the **pay cycle that contains February**, not for the raw calendar 1–28/29 Feb.

---

## Summary table

| Aspect | Respects pay cycle? | What happens |
|--------|----------------------|--------------|
| Date range for attendance | Yes | `startDate` / `endDate` from `dateCycleService.getPeriodInfo(anchorDate)` (15th of month). |
| Leaves counted | Yes | Only days inside `[payrollStart, payrollEnd]` are counted. |
| ODs counted | Yes | Same pay cycle window. |
| Recalc on attendance update | Yes | Period for the updated date is resolved via `getPeriodInfo(baseDate)`; that cycle’s summary is recalculated. |
| Recalc on leave/OD approval | Yes | All pay cycles overlapping the leave/OD range are recalculated. |

So the **monthly summary is aligned with the pay cycle**: it aggregates only over the configured pay period (e.g. 26–25) for the chosen month, and all recalculations use the same logic.

---

## Note on `totalDaysInMonth`

- The **MonthlyAttendanceSummary** model has a field **totalDaysInMonth**.
- In **getOrCreate** it is currently set from the **calendar month** length (e.g. 28, 29, 30, 31 for that month), not from the number of days in the pay cycle.
- So the **date range** and **counts** (present, leave, OD, etc.) are pay-cycle based, but the **totalDaysInMonth** value may still be calendar-month days. If you need “total days” to mean “number of days in this pay cycle” everywhere, that field could be updated to use the pay cycle length instead (e.g. from `getPayrollDateRange` or from `periodInfo.payrollCycle`).
