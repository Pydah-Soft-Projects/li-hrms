# Holiday Calendar — Test Cases & Results

**Module:** Scoped holiday management (`managedHolidayGroupIds`, `HOLIDAY_CALENDAR`, `HOLIDAY_CALENDAR_MANAGE_GLOBAL`)  
**Last run:** 2026-05-20  
**Environment:** Local (`mongodb://localhost:27017`, backend `:5000`, frontend `:3000`)

---

## 1. Test execution summary

| Suite | Command | Result |
|-------|---------|--------|
| **Unit — access rules** | `cd backend && npx jest holidays/utils/__tests__/holidayAccess.test.js` | **17 / 17 PASSED** |
| **API — integration smoke** | `cd backend && node scripts/test_holiday_scoped_access_api.js` | **9 PASSED**, 1 SKIPPED (super admin password not in `.env`) |
| **API — scoped pseudo-global create** | Manual curl via test user | **PASSED** — `Created 1 group holidays` (no org-wide GLOBAL master) |
| **API — login payload** | `POST /api/auth/login` (scoped test user) | **PASSED** — returns `managedHolidayGroupIds` + `featureControl` |
| **UI — manual** | Checklist below (Sections 4–6) | **Ready for QA** — run after re-login with configured users |

### Automated re-run (recommended before release)

```bash
cd backend
node scripts/seed_holiday_scoped_test_users.js
npx jest holidays/utils/__tests__/holidayAccess.test.js --no-coverage
node scripts/test_holiday_scoped_access_api.js
```

**Seeded test accounts** (created by seed script):

| Role | Email | Password | Permissions |
|------|-------|----------|-------------|
| Scoped manager | `holiday-scoped-test@hrms.local` | `HolidayTest@123` | `HOLIDAY_CALENDAR:write`, 1 assigned group |
| Global manager | `holiday-global-test@hrms.local` | `HolidayTest@123` | `HOLIDAY_CALENDAR:write` + `HOLIDAY_CALENDAR_MANAGE_GLOBAL:write` |

Optional `.env` for super-admin API checks:

```env
HOLIDAY_TEST_SUPER_EMAIL=nitya@pydah.edu.in
HOLIDAY_TEST_SUPER_PASSWORD=<your-super-admin-password>
```

---

## 2. Prerequisites

1. Backend and MongoDB running.
2. At least **one active Holiday Group** (Superadmin → Holidays → Holiday Groups).
3. Feature flags enabled in Settings → Feature Control:
   - `HOLIDAY_CALENDAR` (read/write as needed)
   - `HOLIDAY_CALENDAR_MANAGE_GLOBAL` (write for org-wide managers only)
4. Users **re-login** after `managedHolidayGroupIds` assignment so the browser stores the new fields.

---

## 3. Backend API test cases (automated)

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| API-01 | Unauthenticated admin access | `GET /api/holidays/admin` without token | `401` | PASS |
| API-02 | Scoped user admin access | Login scoped test user → `GET /api/holidays/admin?year=2026` | `200`, `access.canManageGlobal: false` | PASS |
| API-03 | Scoped groups filter | Same response | `groups[]` only contains IDs in `managedHolidayGroupIds` | PASS |
| API-04 | Scoped cannot delete GLOBAL | Delete first `scope: GLOBAL` holiday | `403` | PASS |
| API-05 | Scoped cannot create holiday group | `POST /api/holidays/groups` | `403` | PASS |
| API-06 | Global manager flag | Login global test user → `GET /api/holidays/admin` | `access.canManageGlobal: true` | PASS |
| API-07 | Scoped pseudo-global create | `POST /api/holidays` with `scope: GLOBAL`, `applicableTo: ALL` as scoped user | `200`, message like `Created N group holidays`, rows are `scope: GROUP` | PASS |
| API-08 | Login returns scope | `POST /api/auth/login` scoped user | `managedHolidayGroupIds` array present | PASS |
| API-09 | Super admin full access | Login super admin → admin + groups | `200` (optional if password configured) | SKIP |

---

## 4. Unit test cases (`holidayAccess.js`)

| ID | Test case | Expected | Status |
|----|-----------|----------|--------|
| UT-01 | `super_admin` → manage + global | both `true` | PASS |
| UT-02 | `HOLIDAY_CALENDAR:write` only | manage `true`, global `false` | PASS |
| UT-03 | `HOLIDAY_CALENDAR_MANAGE_GLOBAL:write` only | global `true`, manage `false` | PASS |
| UT-04 | Unrelated feature only | both `false` | PASS |
| UT-05 | Group in scope | no throw | PASS |
| UT-06 | Group out of scope | `403` message | PASS |
| UT-07 | Global manager any group | no throw | PASS |
| UT-08 | Cannot edit GLOBAL master (scoped) | throw org-wide message | PASS |
| UT-09 | Can edit GROUP in scope | no throw | PASS |
| UT-10 | Cannot edit GROUP out of scope | throw | PASS |
| UT-11 | Global payload unchanged for global manager | same body | PASS |
| UT-12 | Scoped GLOBAL → `SPECIFIC_GROUPS` + assigned IDs | rewritten payload | PASS |
| UT-13 | No assigned groups | throw | PASS |
| UT-14 | GROUP create out of scope | throw | PASS |
| UT-15 | Intersect `targetGroupIds` with managed | subset only | PASS |
| UT-16 | All target groups out of scope | throw | PASS |
| UT-17 | `getManagedGroupIdStrings` | string array | PASS |

---

## 5. Frontend / UI test cases (manual QA)

### 5.1 Superadmin — Users (`/superadmin/users`)

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| UI-U01 | Create user — holiday scope | Create user → check Holiday Group Scope boxes → save | `managedHolidayGroupIds` saved; visible on re-open edit | QA |
| UI-U02 | Edit user — holiday scope | Edit existing user → change scope → save | Updates persist | QA |
| UI-U03 | Upgrade employee — holiday scope | Upgrade employee to user → assign groups | Saved on create | QA |
| UI-U04 | User activity log | View user → Activity Log tab (superadmin) | Shows create/update events | QA |

### 5.2 Workspace — Holidays (`/holidays`) — Scoped manager

**User:** `holiday-scoped-test@hrms.local` (or real scoped HR user after re-login)

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| UI-S01 | Calendar dropdown label | Open `/holidays` | Option shows **All Assigned Groups** (not Global Calendar) | QA |
| UI-S02 | Group list filtered | Open dropdown | Only assigned group(s) listed | QA |
| UI-S03 | No Holiday Groups tab | Check tabs | **Holiday Groups** tab hidden | QA |
| UI-S04 | Read-only GLOBAL tile | Click org-wide GLOBAL holiday on calendar | Toast: read-only / cannot modify | QA |
| UI-S05 | Add to assigned groups | Global view → Add Holiday → save | Success; creates group-level holiday(s), not org master | QA |
| UI-S06 | Edit group holiday in scope | Open group calendar → edit holiday | Form opens; save works | QA |
| UI-S07 | Delete group holiday | Delete in-scope holiday | Soft-deactivate succeeds | QA |
| UI-S08 | No delete on GLOBAL | Edit GLOBAL holiday (if shown) | No delete button / blocked | QA |

### 5.3 Workspace — Holidays — Global manager

**User:** `holiday-global-test@hrms.local` or user with `HOLIDAY_CALENDAR_MANAGE_GLOBAL:write`

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| UI-G01 | Global calendar label | Open `/holidays` | **Global Calendar** option | QA |
| UI-G02 | Holiday Groups tab | Check tabs | Tab visible; can open group CRUD | QA |
| UI-G03 | Create org-wide GLOBAL | Add holiday → All employees | GLOBAL master + synced copies (per existing logic) | QA |
| UI-G04 | Create holiday group | Holiday Groups → Create | `POST /groups` succeeds | QA |
| UI-G05 | Target audience UI | Add global holiday | ALL / Specific groups radios visible | QA |

### 5.4 Superadmin — Holidays (`/superadmin/holidays`)

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| UI-A01 | Global calendar dedupe | Global view | No duplicate synced copies flooding view | QA |
| UI-A02 | Group name on tile | Click holiday | Group name shown on tile and drawer | QA |
| UI-A03 | Activity log | Edit holiday → Activity | History modal loads (`holiday_created/updated/deactivated`) | QA |
| UI-A04 | Soft delete | Delete holiday | Deactivated (`isActive: false`); roster undo still runs | QA |

### 5.5 Permissions & settings

| ID | Test case | Steps | Expected | Status |
|----|-----------|-------|----------|--------|
| UI-P01 | Feature control flags | Settings → Feature Control | `HOLIDAY_CALENDAR` and `HOLIDAY_CALENDAR_MANAGE_GLOBAL` available | QA |
| UI-P02 | Read-only user | User with only `:read` | Can view calendar; no Add/Edit/Delete | QA |
| UI-P03 | No permission | User without holiday features | “No permission” message on `/holidays` | QA |

---

## 6. End-to-end business flows

| ID | Flow | Steps | Expected | Status |
|----|------|-------|----------|--------|
| E2E-01 | Scoped add → roster | Scoped user adds holiday to assigned group → check shift roster for mapped employees | `HOL` or `WO` per form; roster sync queued | QA |
| E2E-02 | Deactivate → roster restore | Delete holiday with “restore weekday shift” | `AttendanceDaily`/roster updated via worker | QA |
| E2E-03 | Employee view | Employee login → `/holidays` or my holidays API | Sees applicable GLOBAL + group holidays only | QA |
| E2E-04 | Superadmin assigns scope → manager uses UI | Superadmin sets groups on user → manager re-login → manages only those groups | Matches API-02/03 behavior | QA |

---

## 7. Negative / security cases

| ID | Test case | Expected | Verified |
|----|-----------|----------|----------|
| NEG-01 | Scoped POST holiday for another `groupId` | `403` | UT-14, API (backend) |
| NEG-02 | Scoped DELETE GLOBAL master | `403` | API-04 |
| NEG-03 | Scoped POST `/holidays/groups` | `403` | API-05 |
| NEG-04 | User without `HOLIDAY_CALENDAR:write` → POST `/holidays` | `403` | UT-03 / middleware |
| NEG-05 | Scoped user with zero assigned groups → create | `403` No groups assigned | UT-13 |
| NEG-06 | Tamper `targetGroupIds` outside scope in API body | Intersected or rejected | UT-15, UT-16 |

---

## 8. Known limitations & notes

1. **Re-login required** after changing `managedHolidayGroupIds` or feature flags in superadmin.
2. **Super admin API tests** skip if `HOLIDAY_TEST_SUPER_PASSWORD` is not set; use seeded test users for CI/local smoke.
3. **UI tests** are manual — mark each row QA → PASS/FAIL in your tracker during UAT.
4. Test holiday `AUTO_SCOPED_TEST` may exist in DB from dev run; deactivate via UI or API if needed.
5. Route order: `/api/holidays/groups` is registered **before** `/:id` to avoid Express param collisions.

---

## 9. Sign-off checklist

- [x] Unit tests pass (17/17)
- [x] API smoke tests pass for scoped + global test users
- [x] Scoped pseudo-global create verified
- [x] Login returns `managedHolidayGroupIds`
- [ ] Full UI UAT completed on staging/production-like data
- [ ] Production superadmin verified holiday group assignment on real HR users

**Tester:** Automated + _pending manual UAT_  
**Recommendation:** Run Section 5 UI checklist with `holiday-scoped-test@hrms.local` and `holiday-global-test@hrms.local` after seed script, then repeat with one real HR account before go-live.
