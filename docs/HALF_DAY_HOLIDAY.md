# Half-day holiday (roster + attendance)

## Overview

Holidays can be applied as **full day** or **half day** (first half / second half). Week-off fill (`rosterFillMode: WEEK_OFF`) still uses the same full/half roster rules with `WO` instead of `HOL`.

**Hours-based holidays** are reserved for a later phase (`rosterApplyMode: HOURS` on the model — not exposed in UI yet).

## Data model

### Holiday

| Field | Values | Notes |
|--------|--------|--------|
| `rosterApplyMode` | `FULL_DAY`, `HALF_DAY`, `HOURS` | Default `FULL_DAY` |
| `halfDayType` | `first_half`, `second_half` | Required when `HALF_DAY` |
| `multiShiftScope` | `FULL_DAY`, `FIRST_SEGMENT`, `ALL_SEGMENTS` | Multi-shift only |

### PreScheduledShift (per employee / date)

| Field | Purpose |
|--------|---------|
| `status` | Full-day `HOL` / `WO` (clears `shiftId`) |
| `firstHalfStatus` / `secondHalfStatus` | Half `HOL` / `WO` when `shiftId` is set |
| `holidaySegmentScope` | `FIRST_SEGMENT` or `ALL_SEGMENTS` (multi-shift) |
| `holidayHalfDayType` | Which calendar half is non-working |
| `sourceHolidayId` | Link to Holiday record |

**Holiday wins over week off:** applying a holiday clears full `WO` and sets `HOL` (or half `HOL` flags).

## Single-shift mode

1. User creates holiday → **Half day** → **First half** or **Second half**.
2. System **tries** to attach `shiftId` from weekday pattern when available; if none, roster row keeps **`shiftId: null`** (blank) with half `HOL`/`WO` flags only.
3. Roster row: `firstHalfStatus: HOL` or `secondHalfStatus: HOL` (and optional `shiftId` when pattern exists).
4. Attendance (after punch detection): `applyRosterHalfNonWorkingToAttendanceDaily` compares worked half vs roster half → `HOLIDAY`, `HALF_DAY`, payable 0.5, etc.

## Multi-shift mode

Half-day always requires **which half** (`first_half` / `second_half`).

| `multiShiftScope` | Behaviour |
|-------------------|-----------|
| `ALL_SEGMENTS` (default for half-day) | Roster half flags apply; **every shift segment** on that calendar half is treated as holiday in attendance/summary. |
| `FIRST_SEGMENT` | Only **segment index 0** (by time order) uses holiday rules; other segments follow punches only. |
| `FULL_DAY` | Full-day `status: HOL` (no half flags). |

## API (create / update holiday)

```json
{
  "name": "Dept half holiday",
  "date": "2026-06-15",
  "scope": "MAPPING",
  "divisionMapping": [...],
  "rosterFillMode": "HOL",
  "rosterApplyMode": "HALF_DAY",
  "halfDayType": "second_half",
  "multiShiftScope": "ALL_SEGMENTS"
}
```

## AttendanceDaily sync (create / update / delete)

Same pipeline as full-day holidays:

1. Holiday save/deactivate → `applyRosterEntriesAndSync` updates `PreScheduledShift`.
2. **`syncRosterEntriesToAttendance`** runs immediately (no need to wait for the queue).
3. `rosterSyncQueue` worker runs the same sync again as a backup.

| Roster | No punches on that day | Has punches |
|--------|------------------------|-------------|
| Full `HOL` | `AttendanceDaily.status = HOLIDAY`, both halves `HOL` on daily | Reprocess → `HOLIDAY` + remark if worked |
| Half `HOL` (one half) | `rosterFirstHalfNonWorking` or `rosterSecondHalfNonWorking` = `HOL`, status **`PARTIAL`** with `policyMeta.partialDayRule` (holiday half + absent/working half), payable 0 — **not** full-day `ABSENT` | Reprocess when punches exist → `HALF_DAY` / `HOLIDAY` via `applyRosterHalfNonWorkingToAttendanceDaily` |
| Both halves `HOL` | `HOLIDAY` (same as full day) | Reprocess |
| Deactivate holiday | Restore shift roster → reprocess → clears half flags on daily | Reprocess |

Fields on `AttendanceDaily`:

- `rosterFirstHalfNonWorking` — `HOL` or `WO` or null  
- `rosterSecondHalfNonWorking` — `HOL` or `WO` or null  

These are set on **create**, refreshed on **update**, and cleared on **delete** (restore pattern).

## Reprocess

After roster apply, `reprocessAttendanceForEmployeeDate` runs when the day has punches (half or full). Half rules run in `AttendanceDaily` pre-save via `applyRosterHalfNonWorkingToAttendanceDaily`.

## UI

Holiday form (workspace + superadmin):

- **Day coverage** (below start/end date): Full day | Half day  
- **Half:** First half | Second half  
- **Multi-shift + half day only:** All segments on that half | First segment only (hidden in single-shift mode)  
- **Roster apply** (bottom): Holiday (HOL) | Week off (WO)  

## Tests

Run: `node backend/scripts/test_roster_half_holiday_integration.js` (manual roster half cases).

API half-day create should be covered by extending that script or a new `test_holiday_half_day_api.js` when needed.

## Product rules (confirmed)

1. **Auto-guess shift (optional)** — Uses weekday pattern when found; otherwise `shiftId` stays **null** and half flags still apply.
2. **Multi-shift + half-day** — `multiShiftScope` is required in practice: UI defaults to `ALL_SEGMENTS` when user picks half day in multi-shift mode.
3. **Holiday wins over week off** — Applying HOL clears full `WO` and half `WO` on the affected roster half.
4. **Reprocess attendance** — `rosterSyncQueue` re-runs attendance for affected employee/dates after roster apply.

### ALL_SEGMENTS behaviour

When an admin selects **All segments on that half**, roster stores `firstHalfStatus` or `secondHalfStatus` as `HOL` plus `holidaySegmentScope: ALL_SEGMENTS`. In multi-shift attendance, **every shift segment** whose calendar half matches `holidayHalfDayType` is treated as holiday (not only segment 0).

### FIRST_SEGMENT behaviour

Only **segment index 0** (earliest `inTime`) participates in half-holiday rules; other segments follow punches only (`rosterHalfNonWorking.js` early exit when worked index &gt; 0).

## Later: hours-based

Planned fields: `rosterApplyMode: HOURS`, duration/window. Not implemented in this release.
