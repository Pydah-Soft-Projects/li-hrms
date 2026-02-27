# Leave Accrual and CL Balance

## Why wasn’t the accrual calculation running?

The **accrual logic exists** in `backend/leaves/services/accrualEngine.js`:

- **CL (Casual Leave)**: 1/12 of annual entitlement per month (with pro‑rata for join date).
- **EL (Earned Leave)**: Uses `earnedLeaveService.calculateEarnedLeave` and posts credits to the leave register.
- **CCL expiry**: Marks old compensatory leaves as expired and posts EXPIRY to the register.

**Nothing was calling it.** There is no in-app cron or scheduled job that runs `accrualEngine.postMonthlyAccruals(month, year)`. So:

- CL/EL were never being credited month-by-month by the system.
- The only way balances appeared was:
  - **One-time script** (`scripts/add_cl_12_to_all_employees.js`) that credited 12 CL to everyone, or
  - **Annual CL reset** (expiry/carry-forward only; it does not grant the new year’s 12 CL by itself).

**What we added:**

1. **In-process cron (IST)**  
   A cron job runs inside the backend at **00:10 IST on the 1st of every month**. It posts accruals for the **previous** month (CL + EL + CCL expiry).  
   - Implemented in: `backend/leaves/jobs/monthlyAccrualCron.js`  
   - Started when the server boots (see `server.js` → `startMonthlyAccrualCron()`).  
   - Timezone: `Asia/Kolkata` (IST).

2. **Manual API**  
   - **POST /api/leaves/accrual/run-monthly**  
     Body (optional): `{ "month": 3, "year": 2026 }`. If omitted, uses **previous month**.  
     Access: HR, Sub-admin, Super-admin.  
   Use this to run accrual on demand or to backfill a month.

---

## Why does the “fallback” (Employee.casualLeaves) work?

When the app needs CL balance for the apply form, it:

1. Calls **GET /api/leaves/register** with `balanceAsOf=true` and `month`, `year`, and `employeeId`/`empNo`.
2. Backend loads **leave register** transactions for that employee up to that month and derives balance (and allowed days).
3. If there are **no register transactions** for that employee (e.g. new employee, or no credits yet), the backend **falls back** to **`Employee.casualLeaves`**.

So the fallback is: “if the register has no rows, use the balance stored on the Employee document.”

**Where does `Employee.casualLeaves` get set?**

- **Script**  
  When you ran `add_cl_12_to_all_employees.js`, it called `leaveRegisterService.addTransaction(...)` for each employee.  
  Inside `addTransaction`, after saving the register row, the service calls **`updateEmployeeBalance(employeeId, 'CL')`**, which:
  - Reads the **current CL balance from the register** (via `getCurrentBalance`),
  - Writes it to **`Employee.casualLeaves`**.

  So the same script that created the 12 CL register entry also updated `Employee.casualLeaves` to 12.

- **Any CL register credit**  
  Any time a CL **CREDIT** is added (accrual run, manual adjustment, annual reset credit if you add one), `addTransaction` → `updateEmployeeBalance` keeps `Employee.casualLeaves` in sync with the register.

- **Leave application (DEBIT)**  
  When a CL leave is approved, a DEBIT is posted to the register and the same flow can update the employee balance from the register, so `Employee.casualLeaves` stays correct.

So the fallback “works” because:

1. After the bulk script, every employee had both a register transaction **and** `Employee.casualLeaves = 12`.
2. If the register query returns no rows (e.g. wrong month before we had “balance as of” logic, or a new employee with no credits yet), the API still returns a balance from `Employee.casualLeaves`, so the UI doesn’t show “0” or “could not load” when the employee actually has a balance stored on their document.

In short: **accrual wasn’t running because nothing triggered it**; we added an API to trigger it. The **fallback works** because the script (and any future register credits) update both the leave register and `Employee.casualLeaves`, so when the register has no rows we can still show the last known balance from the employee document.
