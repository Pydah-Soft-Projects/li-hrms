# Roster Save → AttendanceDaily Background Job

## What we wanted to build

1. **Trigger:** As soon as the **shift roster is saved** (week offs and/or holidays and/or shifts).
2. **Action:** A **background job** runs that creates (or updates) **AttendanceDaily** records.
3. **Scope:** Only for **employees and days that were part of the saved roster** (the entries in that save request). Not the whole month.
4. **Target:** Only for roster entries that have **week off (WO)** or **holiday (HOL)**. For those days we create/update AttendanceDaily with status **WEEK_OFF** or **HOLIDAY** so attendance reflects the roster.

So: **Roster save (with WO/HOL) → background job → create/update AttendanceDaily for those WO/HOL days only, for the employees and dates that were just saved.**

---

## What is already implemented

This behavior is already in place.

### 1. Roster save (API)

- **Endpoint:** `POST /api/shifts/roster`
- **Controller:** `backend/shifts/controllers/preScheduledShiftController.js` → `saveRoster`
- Request body includes `entries: [{ employeeNumber, date, shiftId?, status? }]` where `status` is `'WO'` or `'HOL'` for week off/holiday.
- Backend saves each entry to **PreScheduledShift** (roster). Then it **enqueues a background job** with exactly those saved entries:

```js
if (bulk.length > 0) {
  rosterSyncQueue.add('syncRoster', {
    entries: bulk,   // only the entries that were just saved
    userId: req.user._id
  }).catch(err => console.error('Failed to add roster sync job:', err));
}
```

So the job receives **only the days that were saved** in that request.

### 2. Background job (worker)

- **Queue:** `rosterSyncQueue` (Redis-backed, see `backend/shared/jobs/queueManager.js`).
- **Worker:** `backend/shared/jobs/worker.js` – **Roster Sync Worker** (processes job name `syncRoster`).
- **Logic:**
  - For each `entry` in `job.data.entries`:
    - If `entry.status === 'WO'` or `'HOL'`:
      - Find or create **AttendanceDaily** for `(employeeNumber, date)`.
      - If the existing record has **punches** (working hours or in-time), **skip** (do not overwrite – e.g. employee worked on WO/HOL for CCL).
      - Otherwise set status to **WEEK_OFF** or **HOLIDAY**, clear shifts, set notes, and save. Count as “synced”.
    - If `entry.shiftId` is set (regular shift):
      - If there is an AttendanceDaily for that day with status WEEK_OFF/HOLIDAY and no punches, **delete** it so the day can be filled by shift/punch logic later.
  - Log and optionally notify via socket: “Roster sync complete: N days updated.”

So:

- **Only the saved roster entries** are processed (no full-month scan).
- **Only WO/HOL entries** create/update AttendanceDaily to WEEK_OFF/HOLIDAY.
- Existing attendance with punches is **not** overwritten.

### 3. Flow summary

| Step | What happens |
|------|----------------|
| User saves roster | Frontend sends `POST /api/shifts/roster` with `entries` (WO/HOL and/or shifts). |
| API | Saves to PreScheduledShift; enqueues `syncRoster` job with same `entries`. |
| Worker | Runs after roster save; for each WO/HOL entry, create/update AttendanceDaily (skip if has punches). |
| Result | AttendanceDaily has WEEK_OFF/HOLIDAY for those employees and dates. |

---

## Requirements for the job to run

1. **Redis** must be running (used by Bull for `rosterSyncQueue`).
2. **Worker process** must be running (same process that runs payroll workers, or wherever `backend/shared/jobs/worker.js` is loaded and the Roster Sync Worker is started).

If the worker is not running or Redis is down, the job will be queued but not processed until the worker runs and connects to Redis.

---

## Optional: standalone script for a full month

If you need to backfill or sync **all** WO/HOL roster entries for a **whole month** (e.g. after a one-time data fix), use:

- **Script:** `backend/scripts/sync_roster_wo_hol_to_attendance.js`
- **Usage:**  
  `MONTH=2026-02 node backend/scripts/sync_roster_wo_hol_to_attendance.js`  
  (or from `backend`: `MONTH=2026-02 node scripts/sync_roster_wo_hol_to_attendance.js`)

That script reads PreScheduledShift for the month’s date range, filters to `status: ['WO','HOL']`, and creates/updates AttendanceDaily (again skipping records that have punches). It does **not** run automatically on roster save; the **background job** handles that for the saved entries only.
