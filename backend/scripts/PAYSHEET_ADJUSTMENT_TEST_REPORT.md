# Paysheet adjustment — test results (2026-05-30)

**Command:** `npm run test:paysheet-adjustment` (+ Jest unit tests)  
**Database:** `mongodb://localhost:27017/hrms-leave1`  
**Backend:** `http://localhost:5000` (running during API tests)

## Summary

| Suite | Pass | Fail | Skip |
|-------|------|------|------|
| Jest unit tests | 3 | 0 | 0 |
| Integration (service + API) | 31 | 0 | 1 |
| **Total** | **34** | **0** | **1** |

---

## Database context

| Item | Value |
|------|--------|
| Divisions | 8 active |
| Departments | 31 active |
| Payroll batches | 104 pending, 2 approved, 1 freeze, 44 complete |
| Payroll records | 1,422 (2026-01 → 2026-04) |
| Natural loan EMI/advance in DB | 0 (tests inject temporary values, then restore) |

---

## Service tests (real employee / division / department / batch)

**Employee 2028** · PYDAH COLLEGE OF ENGINEERING · MAINTENANCE · batch pending · 2026-04

| # | Test | Result |
|---|------|--------|
| 1 | Editable columns configured (Loan EMI, Salary Advances) | PASS |
| 2 | Test EMI/advance injected & restored after run | PASS |
| 3 | Employee linked on payroll record | PASS |
| 4 | Division context | PASS |
| 5 | Department context | PASS |
| 6 | Payroll batch linked (pending) | PASS |
| 7 | Attendance summary on record | SKIP (no attendanceSummaryId) |
| 8 | Paysheet row EMI matches PayrollRecord | PASS |
| 9 | Create pending request (2500 → 1250) | PASS |
| 10 | Purple overlay — pending metadata | PASS |
| 11 | Purple overlay — proposed value on row | PASS |
| 12 | Reject advance request path | PASS |
| 13 | Approve — EMI on record → 1250 | PASS |
| 14 | Approve — net salary 3233 → 4483 | PASS |
| 15 | Orange overlay — approved status | PASS |
| 16 | Validation — block amount > original | PASS |
| 17 | Batch complete — auto-reject pending | PASS |

---

## HTTP API tests (live server)

**Test user:** `paysheet-integration-test@hrms.local` (temporary superadmin for CI)  
**API test employee:** 1068 (different from service test employee)

| # | Test | Result |
|---|------|--------|
| 1 | Server health check | PASS |
| 2 | Login | PASS |
| 3 | GET `/paysheet-modification/settings` | PASS |
| 4 | Prepare API test record (EMI 1800) | PASS |
| 5 | GET `/paysheet` with division + department filter | PASS |
| 6 | Paysheet row `_payrollRecordId` / `_employeeId` | PASS |
| 7 | POST create adjustment (1800 → 1700) | PASS |
| 8 | GET list pending includes new request | PASS |
| 9 | POST rejects amount > original | PASS |
| 10 | POST approve adjustment | PASS |
| 11 | Approve persisted on PayrollRecord (EMI=1700) | PASS |
| 12 | Paysheet shows approved cell metadata | PASS |
| 13 | API test record restored | PASS |
| 14 | Service test record restored | PASS |

---

## Jest unit tests

- `getEditableColumnDefs` — only loan/advance editable columns
- `getValueByPath` — nested loanAdvance fields
- `getEditableColumnDefs` — empty when modification disabled

---

## Re-run

```bash
cd backend
npm run dev          # terminal 1
npm run test:paysheet-adjustment   # terminal 2
```
