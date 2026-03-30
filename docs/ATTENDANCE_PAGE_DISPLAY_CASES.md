# Attendance page: display cases and OD + present behaviour

This document describes **what each day cell can show** on the attendance pages (`(workspace)/attendance` and `superadmin/attendance`), how **On Duty (OD)** interacts with **present / partial** attendance in the UI, and how that relates to the **API payload** from `GET /api/attendance/monthly`.

The two pages share the same backend shape; minor differences (e.g. monthly summary modal “Present days”) are called out below.

---

## 1. Where the data comes from

- **Route:** `GET /api/attendance/monthly` → `attendanceController.getMonthlyAttendance` → `attendanceViewService.getMonthlyTableViewData`.
- Each employee row includes:
  - **`dailyAttendance[YYYY-MM-DD]`** — per-day object with `status`, `hasLeave`, `leaveInfo`, `hasOD`, `odInfo`, `isConflict`, shifts, hours, etc.
  - **`summary`** — `MonthlyAttendanceSummary` for the selected month (pay-cycle aligned), used for totals and highlight badges.

Day-level **`status`** is chosen in the backend **before** the frontend applies colours and labels.

---

## 2. Backend: how `status` is set for each day

For each date in the pay-period range, the service loads:

- **`record`** — `AttendanceDaily` for that employee and date (if any).
- **`leaveInfo`** — approved leave covering that date (if any).
- **`odInfo`** — approved OD covering that date (if any).

Then it computes flags:

| Flag | Meaning |
|------|--------|
| `hasLeave` | There is leave on that date. |
| `hasOD` | There is OD on that date. |
| `hasAttendance` | There is a daily row **and** `status` is `PRESENT` or `PARTIAL`. |
| `odIsHourBased` | `odInfo.odType_extended === 'hours'`. |
| `odIsHalfDay` | `odType_extended === 'half_day'` **or** `isHalfDay` on the OD. |

**Conflict flag (`isConflict`):**

```text
isConflict = (hasLeave OR (hasOD AND NOT hour-based AND NOT half-day OD)) AND hasAttendance
```

So:

- **Hour-based OD** or **half-day OD** together with punches does **not** set `isConflict`.
- **Full-day OD** (or other non-hour, non-half-day OD) **with** `PRESENT`/`PARTIAL` → **`isConflict === true`**.
- **Leave** with `PRESENT`/`PARTIAL` → **`isConflict === true`**.

**Final `status` (priority order):**

1. Before DOJ or after resignation date → **`''`** (empty).
2. Future date (after today in IST) → **`'-'`**.
3. Else if `AttendanceDaily` exists → **`record.status`** (e.g. `PRESENT`, `PARTIAL`, `HALF_DAY`, `ABSENT`, `OD`, `HOLIDAY`, `WEEK_OFF`, …).
4. Else if leave → **`LEAVE`**.
5. Else if OD only (no daily row) → **`OD`**.
6. Default → **`ABSENT`**.

Important: if a **daily record exists**, its **DB status wins** over “OD-only” for the main `status` field; OD is still exposed via **`hasOD`** / **`odInfo`**.

---

## 3. Frontend: table “modes” (what each view shows)

The monthly table can switch **column layouts** (`tableType`). Each day cell still uses the same underlying `record`, but **what is printed** changes:

| `tableType` | What you see in the day cell |
|-------------|-------------------------------|
| **`complete`** | Primary status (see §4–5), optional **split half-cell**, shift short name, worked hours, **ODh** chip for hour-based OD. |
| **`present_absent`** | Single short status (`displayStatus`). |
| **`in_out`** | In/out times per shift (or legacy single in/out). |
| **`leaves`** | Leave label only (`L`, `LL`, `L-1H`, `L-2H`, etc.). |
| **`od`** | OD label only (`OD`, `OD-1H` / `OD-2H`, `ODh(…h)`). |
| **`ot`** | OT hours and extra hours lines. |

---

## 4. Short codes: `getBaseDisplayStatus` (single-line status)

When the cell is **not** using a split layout, the UI maps `record` to a compact code:

| Code | Typical source |
|------|----------------|
| **P** | `status === 'PRESENT'` |
| **HD** | `status === 'HALF_DAY'` |
| **PT** | `status === 'PARTIAL'` |
| **H** | `status === 'HOLIDAY'` |
| **WO** | `status === 'WEEK_OFF'` |
| **L** | leave (≤ ~2 days notionally) / `LEAVE` or `hasLeave` |
| **LL** | long leave (`leaveInfo.numberOfDays >= 3`) |
| **OD** | `OD` or `hasOD` |
| **A** | absent / empty record |

(Exact `L` vs `LL` threshold is driven by `leaveInfo.numberOfDays` in the UI.)

---

## 5. Split half-cells: when OD + present / half-day combine visually

**`buildSplitCellStatus`** returns a **top / bottom** pair only when:

```text
NOT hour-based OD
AND (
  status === 'HALF_DAY'
  OR half-day leave
  OR half-day OD (half_day + isHalfDay)
)
```

**Hour-based OD (`odType_extended === 'hours'`) never uses the split cell** for this path; it shows **`ODh`** as a separate chip in **complete** mode instead.

### 5.1 Half-day attendance (`HALF_DAY`)

The UI decides which **half was worked** using late-in vs early-out minutes (and punch vs shift window / OD half as fallback). Then:

- One half shows **HD**, the other **A** (absent half).

### 5.2 Overlay leave on the split

- **Full-day leave:** `L` or `LL` is **appended** to both halves (e.g. `HD/L` and `A/L`).
- **Half-day leave:** leave marker on **first** or **second** half only (`halfDayType`).

### 5.3 Overlay OD on the split

- **Full-day OD:** `OD` appended to **both** halves.
- **Half-day OD:** `OD` on **first** or **second** half only (`halfDayType`).

So combined states look like **`P/OD`**, **`HD/L`**, **`PT`** both halves, **`A`** + **`OD`** on one half, etc., depending on attendance + leave + OD types.

Each half gets a **background class** from `getSplitHalfClass` (green for P, indigo when the segment contains `OD`, orange/amber for leave, etc.).

---

## 6. Cell background colour priority (`getCellBackgroundColor`)

Rough priority (workspace page):

1. **`isConflict`** → purple (leave or “full” OD + present/partial attendance).
2. **Leave only** → orange / amber (long leave darker).
3. **OD only** → indigo if status is `OD`, else **blue** (OD + attendance without conflict, e.g. hour or half-day OD).
4. **Leave + OD** → purple (treated as conflict styling).
5. **ABSENT / LEAVE / OD / HALF_DAY** (fallback branch) → slate.
6. **HOLIDAY** / **WEEK_OFF** → red / orange tinted.

Border/text styling also uses **`getStatusColor`** for the base `status` when applicable.

---

## 7. OD display by type (summary)

| OD type (`odType_extended` / flags) | Grid behaviour |
|--------------------------------------|----------------|
| **`hours`** | Not treated as conflict with punches; **`ODh`** label with optional hours; split cell **not** used for OD in §5. |
| **`half_day`** + `isHalfDay` | Half-day overlay in **split** cells; can combine with `HALF_DAY` / half leave. |
| **`full_day`** | Full-day OD overlay; if employee also has `PRESENT`/`PARTIAL`, backend sets **`isConflict`** → purple cell. |
| **OD only, no daily** | Backend sets `status = 'OD'`, `hasOD = true`. |

---

## 8. Extra indicators (complete mode)

- **Late / early:** dots at bottom of cell when late-in or early-out minutes exist (including per-shift).
- **Monthly summary highlight:** when a summary category (present, payable, OD, leave, absent, …) is active, cells can show a **numeric badge** from `contributingDates` (`attendanceHighlight.ts` helpers).
- **Manual edit:** small **✎** when source is manual or `isEdited`.

---

## 9. Detail dialog / combined labels

When opening a day, the UI can show **multiple statuses** together, e.g. **`PRESENT / OD`** if `hasOD` is true, by concatenating `status` with `OD` / `LEAVE`. The dialog also surfaces **leave conflicts** and **OD** panels; **`isConflict`** drives warning-style messaging.

### Revoke full-day OD when punches exist

If the day has **check-in/check-out** (shift `inTime`/`outTime` or legacy root fields) **and** an approved **full-day** OD (`odInfo.odId` present; not hour-based, not half-day), workspace and superadmin attendance detail show **Revoke OD**. On success, the backend **`PUT /api/leaves/od/:id/revoke`** recalculates the **monthly summary** for each affected date and **`save()`s `AttendanceDaily`** so the pre-save hook recomputes **status/payableShifts** without that OD. The dialog refreshes by merging **`getAttendanceDetail`** with the latest **`getMonthlyAttendance`** row for `hasOD` / `odInfo` / `isConflict`. There is **no time limit** on how long after approval OD may be revoked (workflow step is reset; approver / HR / super_admin rules still apply).

---

## 10. Monthly summary modal vs grid (workspace vs superadmin)

- **Backend** `MonthlyAttendanceSummary` exposes **`totalPresentDays`**, **`totalODs`**, **`totalPayableShifts`**, **`totalAttendanceDeductionDays`**, etc. Calculation logic lives in **`summaryCalculationService.js`** (physical present vs OD halves, payable merge, policy deduction).
- **Workspace** monthly summary table **Present days** column renders:

  `max(0, totalPresentDays - totalODs)`  

  so the modal shows a **present figure with ODs subtracted** (presentation choice).

- **Superadmin** monthly summary table shows **`totalPresentDays`** **without** that subtraction.

Row totals in the main grid (e.g. “present” column) use **`getPresentExcludingOD(summary)`**, which currently returns **`summary.totalPresentDays`** as provided by the API (see comment in code: backend is treated as authoritative for that column).

If these two views should match, product should decide whether **modal** or **row** is canonical and align formulas.

---

## 11. Quick reference: “what case is this?”

| User-visible situation | Typical `status` | `hasOD` | `isConflict` |
|------------------------|------------------|---------|--------------|
| Normal full day present | `PRESENT` | false | false |
| Incomplete hours | `PARTIAL` | false | false |
| Half day from attendance | `HALF_DAY` | varies | false unless full OD + partial rules |
| No punch, approved leave | `LEAVE` | false | false |
| No punch, approved OD | `OD` | true | false |
| Punches + hour OD | `PRESENT` / `PARTIAL` | true | false |
| Punches + half-day OD | often `PRESENT` / `PARTIAL` / `HALF_DAY` | true | false |
| Punches + full-day OD | usually still daily status | true | **true** |
| Punches + leave | daily status | false | **true** |
| Before join / after exit | `''` | — | — |
| Future day | `-` | — | — |

---

## 12. Related files

| Layer | File |
|-------|------|
| Day construction + `isConflict` | `backend/attendance/services/attendanceViewService.js` |
| Monthly aggregates | `backend/attendance/services/summaryCalculationService.js` |
| UI (workspace) | `frontend/src/app/(workspace)/attendance/page.tsx` |
| UI (superadmin) | `frontend/src/app/superadmin/attendance/page.tsx` |
| Highlight badges | `frontend/src/lib/attendanceHighlight.ts` |
| Pay cycle vs month | `docs/MONTHLY_SUMMARY_PAY_CYCLE.md` |
