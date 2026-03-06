# Shift Roster: Auto-Assign from Previous Pay Cycle

## 1. Feature summary

**Goal:** At the end of a pay cycle (or on demand), auto-fill the **next** pay cycle’s shift roster using the **previous** pay cycle’s roster, mapped by **weekday**. Holidays in the **current/target** period are respected (left as or set to HOL and not overwritten by copied shifts).

---

## 2. Rules (what we do)

| Rule | Description |
|------|-------------|
| **Source** | Previous pay cycle’s roster (e.g. Jan 26–Feb 25 if cycle is 26→25). |
| **Target** | Next pay cycle’s date range (e.g. Feb 26–Mar 25). |
| **Mapping** | By **weekday**: same weekday in previous cycle → same weekday in next cycle (e.g. Monday in target period gets Monday’s shift from previous period). |
| **Holidays** | For each date in the **target** period, if that date is a holiday for the employee (from Holiday config, incl. group-specific), set/keep **HOL** and do **not** copy from previous roster for that day. |
| **Existing** | Optional: only fill **empty** days, or **overwrite** all (configurable or fixed by product choice). |

---

## 3. When it runs

Two options (can implement one or both):

- **A) UI trigger (recommended first)**  
  - Button on Shift Roster page: e.g. **“Auto-fill next cycle from previous”**.  
  - User selects (or we infer) “next cycle” (e.g. next month / next cycle range), clicks, we run the logic and show a summary (e.g. “Filled X entries; Y days left as holiday”).  
  - No cron dependency; clear user intent.

- **B) Scheduled job (optional later)**  
  - Cron (e.g. run on 25th of every month at 23:00 for 26→25 cycle) to auto-fill the **next** cycle so roster is ready before the cycle starts.  
  - Needs: payroll cycle settings (start/end day), timezone, and which “month” means (e.g. “run for cycle ending this month” → fill “next” cycle).

**Recommendation:** Start with **A**. Add **B** later if you want fully automatic runs.

---

## 4. Algorithm (high level)

1. **Resolve date ranges**
   - Read `payroll_cycle_start_day` (and if used, `payroll_cycle_end_day`) from Settings (same as roster page).
   - **Previous cycle:** e.g. for “current” month M, previous = (M-1) cycle (e.g. Jan 26–Feb 25).
   - **Next cycle:** e.g. Feb 26–Mar 25.
   - Reuse existing helpers (e.g. `getPayrollDateRange` in `backend/shared/utils/dateUtils.js`) or the same logic as the roster UI so ranges match.

2. **Load previous cycle roster**
   - Query `PreScheduledShift` for `date` in [prevStart, prevEnd], all employees (or filtered by same scope as roster: division/department if needed).
   - Build a map: `(employeeNumber, weekday) → { shiftId, status }` (weekday 0–6). If multiple same weekdays (e.g. 4 Mondays), use **first** Monday or **most frequent**; simplest is “first occurrence” per weekday.

3. **Load holidays for target period**
   - For each date in [nextStart, nextEnd], resolve which employees have a holiday (GLOBAL/ALL, GLOBAL/SPECIFIC_GROUPS, GROUP) using existing Holiday + HolidayGroup logic (same as `syncHolidayToRoster` / roster UI).  
   - Result: set `HolidayDatesByEmployee` = (empNo → Set of date strings).

4. **Build target roster**
   - For each employee (same list as previous roster or active employees in scope):
     - For each date D in [nextStart, nextEnd]:
       - If D is in `HolidayDatesByEmployee[emp]` → write **HOL** for (emp, D).
       - Else:
         - weekday = getWeekday(D).
         - Look up previous roster for (emp, weekday); if found, write same shift/WO/HOL to (emp, D); if not found, leave empty or skip.

5. **Persist**
   - Bulk upsert into `PreScheduledShift` (same as save roster: employeeNumber, date, shiftId, status, scheduledBy, notes).  
   - Optional: trigger existing **roster sync job** so AttendanceDaily rows (WO/HOL) are created/updated for the new period.

---

## 5. Backend

- **New endpoint (recommended):**  
  `POST /api/shifts/roster/auto-fill-next-cycle`  
  - Body (optional): `{ targetMonth?: string }` (YYYY-MM) or infer “next” from current date + cycle settings.  
  - Response: `{ success, message, filled: number, holidaysRespected: number, errors?: [] }`.

- **Service / shared logic:**
  - `getPayrollCycleRange(month, direction)` → { startDate, endDate } for “previous” and “next” cycle using Settings.
  - `getRosterByWeekday(startDate, endDate)` → map (emp, weekday) → roster cell.
  - `getHolidayDatesForEmployees(empNos, startDate, endDate)` → empNo → Set<date> (reuse Holiday + HolidayGroup + division_id/department_id logic).
  - `autoFillNextCycleFromPrevious(options)` → run steps 2–5 above and return counts.

- **Permissions:** Same as roster save (e.g. manager, super_admin, sub_admin, hr, hod).

- **Idempotency:** Overwrites target period roster (or “only empty” if we add a flag). Same run twice = same result.

---

## 6. Frontend

- **Where:** Shift Roster page (superadmin and/or workspace).

- **Control:** Button e.g. **“Auto-fill next cycle from previous”** near month navigator or Save.
  - On click: call `POST /api/shifts/roster/auto-fill-next-cycle` (optionally with current or next month).
  - Show confirmation: “This will fill Feb 26–Mar 25 from Jan 26–Feb 25 by weekday. Holidays in the target period will be set to HOL. Continue?”
  - On success: show toast + “Filled X days; Y days kept as holiday.” Optionally reload roster for the next cycle so user sees the result.

- **Optional:** Dropdown “Fill for month: [Feb 2026]” so user can choose which cycle to fill (e.g. if they missed the automatic run).

---

## 7. Edge cases

| Case | Handling |
|------|-----------|
| No previous roster | Don’t create entries; return “No previous cycle roster found” or fill 0. |
| Previous cycle partially filled | Use whatever weekdays we have; missing weekdays → leave target day empty. |
| Employee in target but not in previous | Leave all target days empty for that employee (or skip). |
| New employee in target period | Could add “include all active employees” and for them copy e.g. “first Monday” from any employee (optional; not in MVP). |
| Holiday on a day that was WO in previous | Respect holiday: target = HOL. |
| Pay cycle start day = 1 | Previous = (M-1) 1st to last, Next = M 1st to last; same logic. |

---

## 8. Implementation order

1. **Backend**
   - Add payroll cycle range helper for “previous” and “next” (if not already there).
   - Add holiday-resolution helper for a date range and list of employees (reuse existing Holiday + Group logic).
   - Implement `autoFillNextCycleFromPrevious` (in a service or controller).
   - Add `POST /api/shifts/roster/auto-fill-next-cycle` and wire permissions.
   - Optionally trigger roster sync job after fill so AttendanceDaily is updated.

2. **Frontend**
   - Add API method `autoFillNextCycleRoster(month?)`.
   - Add button + confirmation modal on Shift Roster page.
   - Show success summary and optionally reload roster.

3. **Optional later**
   - Scheduled job that runs at end of pay cycle and calls the same backend logic.
   - “Fill only empty cells” option.

---

## 9. Summary

- **What:** Auto-fill next pay cycle roster from previous pay cycle by **weekday**; **holidays in the target period** are respected (set to HOL).
- **When:** UI button first; optional cron later.
- **Where:** Backend service + new API; frontend button on Shift Roster.
- **Respects:** Payroll cycle settings (e.g. 26→25), existing Holiday config (including group-specific), and existing roster save/sync behaviour.

This plan keeps one source of truth (DB roster + holiday config), reuses existing cycle and holiday logic, and makes the behaviour (weekday copy + holidays respected) explicit and testable.
