# Leave Register – Understanding & Implementation Plan

This document captures **what is understood** from your requirements, **how things work today** (monthly limit, transactions, display, pay cycle, ledger), and **how we will implement** the new behaviour.

---

## 1. What We Understood

### 1.1 Leave Register Page (UI)

- **Two main views:**
  1. **Transactions display** – list of leave register transactions (credits, debits, adjustments, expiry, carry-forward) for the selected period.
  2. **Employees display** – per employee, for the selected month (“present” month):
     - **Opening balance** – as it stands on the employee at **start of that month** (no heavy “as-of” recalculation each time; can use cached/derived value).
     - **Earned leaves (EL)** for that month – EL accrued/available in that month.
     - **Compensatory offs (CCL)** for that month – CCL earned/available in that month.

- Everything is **month-aware**: each month has its own opening, accruals, usage, carry-forward, and expiry.

### 1.2 Month-by-Month Behaviour

- **Opening balance for “present” month**  
  Should reflect the employee’s balance at the **start** of that month. Prefer using the **current balance from the ledger** (or a quick “balance as of last day of previous month”) so it’s consistent and not expensive.

- **Carry forward (CCL and EL)**  
  - If **carry forward is enabled** and **expiry date is not overdue**:
    - **CCL**: carry unused CCL to the next month (no expiry posting if still within validity).
    - **EL**: same – carry unused EL to next month per policy.
  - At month boundary (e.g. after pay cycle ends): apply carry-forward rules and optionally post **CARRY_FORWARD** or **EXPIRY** transactions so the ledger stays correct.

### 1.3 Earned Leave (EL) – Attendance-Based

- **New/configured setting**: “Earned leave (attendance-based) enabled”.
- When enabled:
  - Use **attendance rules / ranges** (min–max days → EL earned).
  - **Cron job** (e.g. daily or monthly) runs to:
    - Use **attendance data** (daily + monthly summaries).
    - Compute **effective days** = `min(monthDays, max(presentDays, payableShifts))` (capped to month days).
    - Determine which **range** the employee falls into and how much EL they earn.
    - **Cumulatively add** that EL to the employee’s paid leaves (EL balance) and **create a CREDIT transaction** in the leave register.

- So: EL is **earned from attendance** and **every grant is recorded** in the ledger.

### 1.4 EL Usage Option (Payroll vs Normal Leave)

- **New setting**: “Use earned leaves as paid days in payroll”.
  - **If enabled**: When an employee **avails EL**, those days count as **paid days in payroll** (same as today: `remainingPaidLeaves` increases payable shifts / paid days).
  - **If disabled**: EL is treated as **normal leave** (like CL for limit/capping purposes only) – **not** added to paid days in payroll; availing EL does not increase salary.

- This **only** affects **how EL is used in payroll**, not how it is accrued or stored in the register.

### 1.5 Monthly Allowed Leave Limit

- **Formula** (for “how many days an employee can take as paid/allowable in that month”):

  **Monthly allowed limit**  
  = **Pro-rata CL balance** (for that month)  
  + **Compensatory off balance** (CCL for that month)  
  + **(If “use EL like casual leaves” / include EL in limit) then + EL balance, else 0)**

- So:
  - **If EL is “paid in payroll”**: EL is part of payroll paid days; we still need a **separate** “monthly allowed limit” for **leave approval / UI** which may be: `CL + CCL + EL` (all three count toward allowable leave).
  - **If EL is “normal leave”**: EL is not in payroll; monthly limit for display/approval = `CL + CCL + EL` (all three for leave allowance only).

- In both cases the **same formula** can apply for “allowed leave days” in the register/approval; the **only** difference is whether EL days availed are **added to payroll paid days** or not.

### 1.6 Scale & Correctness

- Design so that:
  - Register and payroll stay in sync.
  - No double-counting of EL (earned once, used once, carried or expired once).
  - Cron and APIs are safe for many employees (batch or pagination if needed).
  - Opening balance and monthly aggregates are consistent and auditable from the ledger.

---

## 2. Current State (How Things Work Today)

### 2.1 Leave Register Data & Query

- **Model**: `LeaveRegister` – one document per transaction (CL, EL, CCL, etc.) with `month`, `year`, `leaveType`, `transactionType`, `days`, `openingBalance`, `closingBalance`, etc.
- **Query**:
  - **Without balanceAsOf**: `getLeaveRegister(filters, month, year)` returns **only transactions in that month/year** (`query.month = month`, `query.year = year`). Used for “register for month X”.
  - **With balanceAsOf** (single employee): returns **all transactions up to and including that month** to compute “balance as of end of month”.
- **Grouping**: `groupByEmployeeMonthly()` groups transactions by employee and fills:
  - `casualLeave`: openingBalance, accruedThisMonth, usedThisMonth, expired, balance, carryForward.
  - `earnedLeave`: openingBalance, accruedThisMonth, usedThisMonth, balance.
  - `compensatoryOff`: openingBalance, earned, used, expired, balance.
  - **Opening balance** in the UI today is taken from the **first transaction in that month** for that leave type (`if (cl.openingBalance === 0) cl.openingBalance = transaction.openingBalance`). So it’s “opening as per first tx in month”, not necessarily “balance at start of month” if there are no January txs.

### 2.2 How “Monthly Limit” / Allowed Leaves Are Set Now

- **CL**:  
  - “Allowed remaining” is computed when `balanceAsOf` is true: `usedThisYear`, `allowedRemaining` (1 CL per month from first 12 + balance above 12).  
  - Not a single “monthly limit” field; it’s derived from policy + register.

- **EL**:  
  - Stored in `Employee.paidLeaves` (synced from register).  
  - No explicit “monthly allowed limit” for EL in the register; payroll uses **total** `paidLeaves` (see below).

- **CCL**:  
  - Stored in `Employee.compensatoryOffs`.  
  - Used in leave application (avail CCL).  
  - No separate “monthly limit” formula in code; effectively “all CCL balance” is usable.

- So today there is **no single “monthly allowed limit”** displayed as one number; it’s CL policy (1/month + extra) + EL balance + CCL balance used in different places.

### 2.3 Transaction Creation Today

- **CL**:  
  - **Credits**: Monthly accrual (accrual engine) posts CREDIT; annual reset posts EXPIRY + ADJUSTMENT; manual “Apply initial CL” posts ADJUSTMENT.  
  - **Debits**: When leave is approved, `addLeaveDebit()` posts DEBIT.

- **EL**:  
  - **Credits**: Accrual engine (monthly) calls `earnedLeaveService.calculateEarnedLeave()` (attendance-based or fixed), then `addEarnedLeaveCredit()`.  
  - **Debits**: When leave type is EL and approved, DEBIT is posted.  
  - Attendance-based EL already uses **ranges** (`attendanceRanges`: minDays, maxDays, elEarned); cumulative logic per month.

- **CCL**:  
  - **Credits**: On CCL approval, a CREDIT is posted to the register (fixed earlier).  
  - **Debits/Expiry**: When availed, DEBIT; when expired (accrual engine), EXPIRY.

### 2.4 Display (Leave Register Page)

- Frontend calls `getLeaveRegister({ month, year })` → backend returns **only that month’s transactions**, grouped by employee.
- So if a month has **no** transactions, the page shows **no rows** (or empty). There is **no** “show all employees with opening balance 0” unless we add it.
- “Present” = current month/year; if transactions are in another month, user must change month/year to see them.

### 2.5 After Pay Cycle – How Leaves Ledger Is Handled

- **Payroll calculation** (e.g. `payrollCalculationService`):
  - Reads `employee.paidLeaves` (EL balance).
  - `totalLeaves` = from attendance summary (leaves taken in that period).
  - `remainingPaidLeaves = max(0, paidLeaves - totalLeaves)`.
  - **Adjusted payable shifts** = `totalPayableShifts + remainingPaidLeaves` → so EL (and any “paid” leave) increases paid days.
  - Leave deduction: unpaid leaves reduce pay; paid leaves don’t (they’re already in payable shifts).

- So today: **EL = paid leave in payroll**. There is no switch to “use EL as normal leave (not in payroll)”; that’s the new option we’ll add.

- **Ledger**: No automatic “post pay cycle” step that writes back to the leave register; the register is updated when:
  - Accrual runs (CL/EL credit, CCL expiry).
  - Leave is approved (DEBIT for CL/EL/CCL).
  - Manual adjust / initial sync / annual reset.

---

## 3. Implementation Plan

### Phase 1 – Leave Register Page: Transactions + Employees with Opening / EL / CCL

1. **Backend – Register API for a month**
   - Keep existing `getLeaveRegister(filters, month, year)`.
   - Add a **mode or separate endpoint** that, for the selected month/year:
     - Returns **all employees** (active) with:
       - **Opening balance** for CL, EL, CCL = balance at **start of that month** (last closing balance from register for previous period, or 0).
       - **Earned this month**: from transactions in that month (CREDIT for EL/CL/CCL).
       - **Used this month**: from transactions in that month (DEBIT).
       - **Expired / carry-forward** this month if any.
       - **Closing balance** = opening + earned − used − expired (or from last tx in month).
     - Optionally return **list of transactions** for that month (paginated if needed).
   - **Opening balance at start of month**: implement helper `getBalanceAsOf(employeeId, leaveType, lastDayOfPreviousMonth)` and use it when building the employee summary for the selected month. So “present month opening” = balance as at end of previous month (no “time travel”, just one query per leave type per employee, or batched).

2. **Frontend – Leave Register page**
   - **Month/Year selector** (already there).
   - **Tab or section 1 – Employees**: Table with columns e.g. Employee, Opening (CL), Opening (EL), Opening (CCL), Earned this month (CL/EL/CCL), Used this month, Expired/Carry, Closing (CL/EL/CCL), **Monthly allowed limit** (formula below).
   - **Tab or section 2 – Transactions**: Table of raw transactions for that month (date, employee, leave type, type, days, opening, closing, reason). Paginate if large.

3. **Monthly allowed limit (backend + frontend)**
   - Add setting: **“Include EL in monthly allowed limit”** (or “Use EL as casual for limit”) – if true, monthly limit = CL + CCL + EL; if false, = CL + CCL only.
   - Backend returns this in the employee summary:  
     `monthlyAllowedLimit = proRataOrCurrentCL + CCL + (includeEL ? EL : 0)`  
     (Pro-rata CL can be “CL balance as at start of month” or current; we’ll use same as opening for consistency.)
   - Frontend displays it in the employees table.

### Phase 2 – Carry Forward (CCL & EL) at Month Boundary

1. **Config**
   - Use existing carry-forward and expiry settings for CCL and EL (max months, expiry months, carry to next year).

2. **Logic**
   - **CCL**: Already have expiry in accrual engine (processCCLExpiration). Ensure “carry forward” means: only expire if past expiry date; otherwise balance carries. No extra “CARRY_FORWARD” tx needed for CCL unless we want an explicit audit line.
   - **EL**: Same idea: at end of month (or when accrual runs for next month), check EL balance; if carry-forward enabled and not expired, keep it (balance naturally carries in ledger). Optionally post a **CARRY_FORWARD** transaction for audit.

3. **Cron**
   - Keep monthly accrual cron; after posting CL/EL credits and CCL expiry for month M, the “closing” balance for M is the opening for M+1. No separate “carry forward cron” unless we want one for explicit CARRY_FORWARD txs.

### Phase 3 – Earned Leave: Attendance-Based Cron & Ranges

1. **Setting**
   - “Earned leave (attendance-based) enabled” – already have `earnedLeave.enabled` and `earningType: 'attendance_based'`. Use that; ensure ranges are used as you want (cumulative by month).

2. **Effective days**
   - In `earnedLeaveService` (or helper), compute for the payroll month:
     - `effectiveDays = min(monthDays, max(presentDays, payableShifts))`.
     - Use `effectiveDays` (instead of only `attendanceDays`) when matching against `attendanceRanges` so that “max(present, payable)” is honoured and capped to month days.

3. **Cron**
   - **Option A**: Run **monthly** (e.g. after attendance summary is ready for the month) – for each employee, compute EL from ranges, post CREDIT.  
   - **Option B**: Run **daily** – only consider months that are “closed” (e.g. previous month) to avoid double-crediting; or run daily but idempotent (e.g. “ensure EL for month M is exactly X” and post only one CREDIT per employee per month).  
   - Prefer **monthly** after pay cycle / attendance summary for that month, to avoid scaling and consistency issues. Reuse existing accrual engine; ensure it uses `effectiveDays` and ranges.

4. **Idempotency**
   - For each (employee, month, year), post **at most one** EL CREDIT from attendance-based calculation. If we run twice, either skip or update: e.g. check if there’s already an EL CREDIT for that month from “attendance” and don’t duplicate.

### Phase 4 – EL as “Paid in Payroll” vs “Normal Leave”

1. **New setting**
   - In Leave Policy (or payroll): **“Use earned leaves as paid days in payroll”** (boolean).  
   - If **true**: current behaviour – EL availed adds to paid days (remainingPaidLeaves, adjustedPayableShifts).  
   - If **false**: EL availed **does not** add to paid days; treat as normal leave (only for leave limit / approval), so no increase in salary for EL days.

2. **Payroll**
   - In `payrollCalculationService`, when computing `paidLeaves` and `remainingPaidLeaves`:
     - If “use EL as paid in payroll” is **true**: include `employee.paidLeaves` (EL) as now.  
     - If **false**: set contribution of EL to paid days to 0 (so `remainingPaidLeaves` doesn’t include EL; only CL/CCL if we ever add them to payroll, or only whatever is configured as “paid”).

3. **Leave application**
   - When employee applies for EL, approval and DEBIT from register stay the same. Only payroll behaviour changes.

### Phase 5 – Consistency, Scale, Bugs

1. **Single source of truth**
   - Leave register remains the ledger; employee balances (casualLeaves, paidLeaves, compensatoryOffs) are cache, updated on every register write. All accrual and leave approval must go through the register.

2. **Opening balance**
   - Always derive “opening for month M” from register: balance as at end of M−1 (or start of M). No guessing from “current” balance when we want historical month.

3. **Batch / scale**
   - For “all employees for month” API, batch by employee (e.g. 100 at a time) or use aggregation pipeline to compute opening/earned/used per employee in one go. Avoid N+1 queries.

4. **Testing**
   - Unit tests for: effectiveDays (max(present, payable) capped to month); monthly limit formula; payroll paid-days with EL on/off. Integration test: run accrual for a month, then fetch register for that month and check opening/earned/used/closing.

---

## 4. Summary Table

| Item | Current | Target |
|------|--------|--------|
| Register page | Transactions for selected month only; employees only if they have tx | Employees list for month with opening, earned, used, closing; + transactions list |
| Opening balance | From first tx in month (or 0) | Balance at **start of month** from ledger |
| Monthly limit | Not a single field | Pro-rata CL + CCL + (EL if “include in limit”) |
| EL earning | Attendance-based ranges in monthly accrual | Same + use max(presentDays, payableShifts) capped to month days; idempotent per employee-month |
| EL in payroll | Always treated as paid days | Configurable: “use EL as paid days in payroll” yes/no |
| CCL/EL carry forward | CCL expiry in accrual; EL balance carries in ledger | Explicit carry-forward rules; optional CARRY_FORWARD tx for audit |

---

## 5. Next Steps

1. Confirm this understanding and the formula for “monthly allowed limit” (and whether “include EL” is the same as “use EL in payroll” or separate).
2. Implement Phase 1 (register page: employees + transactions + opening + monthly limit).
3. Add “use EL as paid in payroll” setting and payroll branch (Phase 4).
4. Adjust EL calculation to use `effectiveDays` and idempotent monthly EL credit (Phase 3).
5. Add carry-forward behaviour and optional CARRY_FORWARD transactions (Phase 2).
6. Add tests and batch optimisation (Phase 5).

If you want, we can start with Phase 1 (API + UI for employees with opening/EL/CCL + transactions + monthly limit) and the “use EL as paid in payroll” setting next.
