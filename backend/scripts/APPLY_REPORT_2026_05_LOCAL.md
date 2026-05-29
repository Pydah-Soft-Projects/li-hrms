# May 2026 pay period — apply report (local DB)

**Database:** `mongodb://127.0.0.1:27017/hrms-leave-1`  
**Pay period:** 2026-04-26 → 2026-05-25 (payroll month **2026-05**)  
**Run:** Apply script + full monthly summary recalc  
**Result:** Summaries recalculated for **369** employees (0 failed)

---

## 1. What ran

| Step | Result |
|------|--------|
| Re-save AttendanceDaily (only rows that would change) | **0** saves (already up to date) |
| Recalculate `MonthlyAttendanceSummary` for 2026-05 | **369** success |

New code is live in this environment: PARTIAL IN+OUT half rules + present cap on PARTIAL days.

---

## 2. Sixteen rows — IN+OUT, half-day **not** met

**Dry-run expectation:** `PARTIAL` → `ABSENT`  
**Current DB status** (after apply / prior updates):

| Date | Emp | Before (dry run) | **Now in DB** |
|------|-----|------------------|---------------|
| 2026-04-28 | 1951 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-04-27 | 2075 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-02 | 1717 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-04 | 2268 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-05 | 2159 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-09 | **1715** | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-10 | 2159 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-11 | 111120 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-12 | 1951 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-15 | 1434 | PARTIAL / 0 | **OD** / 0.5 *(updated separately)* |
| 2026-05-15 | 2266 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-15 | 5006 | PARTIAL / 0 | **OD** / 0.5 *(updated separately)* |
| 2026-05-16 | 51 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-18 | 2249 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-24 | 1951 | PARTIAL / 0 | **ABSENT** / 0 |
| 2026-05-24 | 2249 | PARTIAL / 0 | **ABSENT** / 0 |

**14** match target **ABSENT**. **2** (1434, 5006 on 2026-05-15) are **OD** in DB now.

---

## 3. CHODISETTY LALITHA — emp **1715** (May 2026)

### Monthly totals (after recalc)

| Metric | Value |
|--------|------|
| Present days | **23.5** |
| Payable shifts | **23.5** |
| Partial days | **0** |
| Leaves | **1.5** |
| Absent | **1** |

### Notable days

| Date | Daily status | Present credit (summary) | Notes |
|------|--------------|----------------------------|--------|
| **2026-05-09** | **ABSENT** | *(not in present list)* | Approved **CL 0.5** on same date |
| **2026-05-19** | *(check grid)* | **0.5** only | **Not 1.0** — new half-credit rules applied |
| 2026-05-18 | — | — | **LOP 1.0** (leave) |

### Present contributing dates (sample)

Most full days show **1.0** present; **2026-05-19** shows **0.5** (partial/half-day present fix).

---

## 4. How to verify in UI

1. Open **Attendance** → month **May 2026** → employee **1715**.
2. **2026-05-09** → should show **Absent** (not PT), with leave if applicable.
3. **2026-05-19** → click **Present** column → that day should show **0.5**, not **1.0**.
4. Refresh if cached; backend recalc already ran on local DB.

---

## 5. Files

| File | Purpose |
|------|---------|
| `apply_partial_inout_2026_05.json` | Machine report (0 daily changes this run) |
| `apply_partial_inout_2026_05_dry.json` | Earlier dry-run (16 predicted changes) |
| `APPLY_REPORT_2026_05_LOCAL.md` | This report |

---

## 6. Production

Use the same scripts with production `MONGODB_URI` from `.env` (not local). Run `DRY_RUN=1` first, then apply without `DRY_RUN`.
