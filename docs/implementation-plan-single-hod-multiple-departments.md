# Implementation Plan: Single HOD Assigned to Multiple Departments

## Goal
Allow one HOD (Head of Department) user to be assigned to **multiple departments**. Today the backend blocks this with a "user can only be HOD for one department" rule; the data model and sync logic already support multiple departments per HOD via `User.divisionMapping[]` and `Department.divisionHODs[]`.

---

## Current State

- **User.divisionMapping**: Array of `{ division, departments: [ObjectId] }`. One HOD can already have multiple departments in one or more divisions.
- **Department.divisionHODs**: Array of `{ division, hod }`. Each department has one HOD per division; the **same** `hod` user ID can appear in many departments’ `divisionHODs`.
- **Backend blockers**:
  - **createDepartment**: Rejects if the chosen HOD is already present in **any** department’s `divisionHODs` (one HOD per department only).
  - **updateDepartment**: Rejects if the chosen HOD is already in **another** department’s `divisionHODs` (cannot assign same HOD to multiple departments).
- **Frontend**: Workspace Users page already supports multiple departments per division for HOD (division mapping with checkboxes). Create-user flow still forces a single department for HOD in some paths. Department create/update sends `hod` + `divisions`; backend create only reads `divisionHODs` (so HOD may not be set on create unless we add a fallback).

---

## Implementation Plan

### Phase 1: Backend – Allow Same HOD for Multiple Departments

| # | Task | File | Description |
|---|------|------|-------------|
| 1.1 | Remove “one HOD per department” check on **create** | `backend/departments/controllers/departmentController.js` | In `createDepartment`, **remove** the block that does `Department.findOne({ 'divisionHODs.hod': dh.hod })` and returns 400 if found. Keep: user existence check, push to `validDivisionHODs`, and existing User `divisionMapping` sync (`$addToSet` / `$push`). |
| 1.2 | Remove “HOD already in another department” check on **update** | Same file | In `updateDepartment`, when processing `req.body.divisionHODs`, **remove** the logic that finds other departments with this HOD and returns 400. Keep: user existence check, duplicate-in-payload check (same user for multiple divisions in *this* department in one request), and all User sync (addToSet/pull). |
| 1.3 | (Optional) Support `hod` + `divisions` on create | Same file | In `createDepartment`, if `divisionHODs` is missing/empty but `hod` and `divisions` are present, set `validDivisionHODs = divisions.map(div => ({ division: div, hod }))` so frontend can keep sending `hod` + `divisions` and HOD is still set. Ensure division linking (e.g. `department.divisions`) is set if your API expects it. |

**Outcome**: Same user can be HOD for multiple departments. User’s `divisionMapping` continues to get all those departments via existing `$addToSet` / `$push` logic.

---

### Phase 2: Backend – User Create/Update and Department Sync

| # | Task | File | Description |
|---|------|------|-------------|
| 2.1 | HOD sync to departments when user has multiple departments | `backend/users/controllers/userController.js` | When **creating** a user with role HOD and `divisionMapping` with multiple departments (e.g. one division, many dept IDs), ensure **each** such department’s `divisionHODs` is updated: for each `{ division, departments }` in mapping, for each department ID, set/update that department’s `divisionHODs` entry for that division to this user. Currently only the first department may be updated; extend to all departments in the mapping. |
| 2.2 | Same on user **update** | Same file | When **updating** a user (e.g. HOD) and `divisionMapping` is changed, (a) remove this user as HOD from departments that are no longer in the mapping (pull from old departments’ `divisionHODs` and from User’s old `divisionMapping`), (b) add this user as HOD to all departments now in the new mapping (update each department’s `divisionHODs` and User’s `divisionMapping`). Reuse the same “sync divisionHODs from divisionMapping” idea as in 2.1. |

**Outcome**: Creating or editing an HOD with multiple departments in division mapping correctly updates both `User.divisionMapping` and each department’s `divisionHODs`.

---

### Phase 3: Frontend – Department Create/Update and assignHOD

| # | Task | File | Description |
|---|------|------|-------------|
| 3.1 | Send `divisionHODs` when creating department | `frontend/src/app/(workspace)/departments/page.tsx` (or superadmin equivalent if used) | When creating a department with `hodId` and `divisionId` (or multiple divisions), send `divisionHODs: (divisions || [divisionId]).map(div => ({ division: div, hod: hodId }))` in the create payload so backend sets HOD even if it doesn’t support `hod`+`divisions` fallback. |
| 3.2 | Send `divisionHODs` when updating department | Same | When updating department and user changes HOD or divisions, send `divisionHODs` in the same shape so backend update logic runs and syncs User. |
| 3.3 | assignHOD API and UI | `frontend/src/lib/api.ts` + department UI | Backend `PUT /api/departments/:id/assign-hod` expects `{ hodId, divisionId }`. Update `api.assignHOD(id, hodId, divisionId)` to pass `divisionId`. In the department edit/assign-HOD UI, when calling `assignHOD`, pass the selected division (or first division of the department) so the request succeeds. |

**Outcome**: Department create/update and explicit “assign HOD” flow work and allow the same HOD to be chosen for multiple departments.

---

### Phase 4: Frontend – Users (HOD) Create/Edit

| # | Task | File | Description |
|---|------|------|-------------|
| 4.1 | Create user (HOD) with multiple departments | `frontend/src/app/(workspace)/users/page.tsx` | When role is HOD and the form uses division mapping (multiple departments selected), send `divisionMapping` with **all** selected divisions and departments (e.g. `[{ division: divId, departments: [id1, id2, ...] }]`) and **do not** overwrite with a single `division` + `department`. Remove or relax any “HOD must have exactly one department” validation on create. |
| 4.2 | Backend create user validation | `backend/users/controllers/userController.js` | Change HOD validation from “must have department AND division” to “must have at least one division and at least one department (in divisionMapping)” so multiple departments are allowed. |
| 4.3 | Edit HOD – multiple departments | `frontend/src/app/(workspace)/users/page.tsx` | Ensure update payload uses the full `divisionMapping` from the form (with multiple departments per division) and is not forced to a single department. |

**Outcome**: From the Users screen, an HOD can be created or edited with multiple departments; backend accepts and syncs it.

---

### Phase 5: Scoping and Listing (Verify Only)

| # | Task | Location | Description |
|---|------|----------|-------------|
| 5.1 | Data scope / leave approval | `dataScopeMiddleware.js`, leave/OD/CCL controllers | Confirm that HOD scope is derived from **all** departments in `divisionMapping` (e.g. flat list of department IDs across all entries). Existing logic that uses `divisionMapping` and `divisionHODs` should already allow one HOD to see/approve for all their departments; no change if already correct. |
| 5.2 | Department list / HOD dropdown | Workspace/Superadmin departments page | Ensure HOD dropdown is not filtered to “only users who are not HOD elsewhere”; same HOD can appear for multiple departments. |

**Outcome**: No unintended restrictions on who can be chosen as HOD or what data an HOD can see.

---

## Testing Checklist

- [ ] Create Department A with HOD = User X (division D1). Success.
- [ ] Create Department B with HOD = User X (division D1). Success (no 400).
- [ ] User X’s `divisionMapping` contains both A and B under D1.
- [ ] Update Department C to set HOD = User X. Success.
- [ ] Create user with role HOD and division mapping = D1 + [Dept A, Dept B]. User created; A and B both have divisionHODs entry (D1, User).
- [ ] Edit same HOD user: add Department C to same division. Save. User’s mapping and A, B, C’s divisionHODs all updated.
- [ ] Leave/OD/approvals: HOD user sees and can act on requests for employees in all their mapped departments.
- [ ] assignHOD with divisionId in frontend: no 400 from backend; department and user mapping updated.

---

## Summary

- **Backend**: Remove the two checks that prevent a user from being HOD of more than one department (create + update). Optionally support `hod`+`divisions` on create. Sync all departments in HOD’s divisionMapping to each department’s `divisionHODs` on user create/update.
- **Frontend**: Send `divisionHODs` (and optionally keep `hod`+`divisions`) for department create/update; pass `divisionId` in assignHOD; allow HOD create/edit with multiple departments in division mapping and ensure payload uses full `divisionMapping`.

No schema changes are required; the existing structures already support one HOD for multiple departments.
