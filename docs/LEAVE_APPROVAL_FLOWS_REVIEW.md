# Leave Approval Flows - Detailed Review

## Executive Summary

This document provides a complete review of the leave approval flow data model, the six required approval flows, Pydah Engineering division setup, user role verification, and identified issues.

---

## 1. Data Flow Overview

### 1.1 End-to-End Process

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│  LEAVE APPROVAL DATA FLOW                                                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  1. Employee logs in (via User linked to Employee)                                        │
│  2. Employee applies for leave (POST /api/leaves)                                         │
│     → Leave created with workflow.approvalChain from LeaveSettings                        │
│     → First approver = HOD (always first per business rules)                              │
│  3. HOD logs in → Sees leave in Pending Approvals (filtered by divisionMapping scope)     │
│     → Approves (PUT /api/leaves/:id/action { action: 'approve' })                         │
│     → Status: hod_approved, nextApprover = next step in chain                             │
│  4. Next approver(s) log in → Approve in sequence until final authority                   │
│  5. Final approval → status = 'approved', workflow.isCompleted = true                     │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **LeaveSettings** | `leaves/model/LeaveSettings.js` | Global workflow config: `workflow.steps`, `workflow.finalAuthority` |
| **Workflow Engine** | `leaves/controllers/leaveController.js` (applyLeave, processLeaveAction) | Builds approvalChain from settings; enforces turn-by-turn approval |
| **Scope Enforcement** | `shared/middleware/dataScopeMiddleware.js` | `checkJurisdiction()`, `getEmployeeIdsInScope()` - divisionMapping |
| **HOD Scope** | `leaveController.js` ~1034-1045 | HOD must have divisionMapping matching leave's division + department |

### 1.3 Workflow Configuration (LeaveSettings)

- **Source**: Single global `LeaveSettings` document (`type: 'leave'`, `isActive: true`)
- **Not per-division**: Workflow is **global** for all leaves; no department/division-specific workflow override
- **Approval chain**: Built at leave creation from `workflow.steps`:
  1. HOD is **always** first (hardcoded)
  2. Remaining steps from `workflow.steps` (excluding HOD) appended in `stepOrder`
- **finalAuthority**: Role that can grant final approval (`hr`, `super_admin`, or `manager`)

---

## 2. The Six Approval Flows

| Flow | Chain | Steps | Final Authority | LeaveSettings Configuration |
|------|-------|-------|-----------------|-----------------------------|
| **Flow 1** | HOD → Manager → HR → Super Admin | 4 | super_admin | steps: [hod, manager, hr, super_admin]; finalAuthority: super_admin |
| **Flow 2** | HOD → HR → Manager → Super Admin | 4 | super_admin | steps: [hod, hr, manager, super_admin]; finalAuthority: super_admin |
| **Flow 3** | HOD → HR → Manager | 3 | manager | steps: [hod, hr, manager]; finalAuthority: manager |
| **Flow 4** | HOD → HR | 2 | hr | steps: [hod, hr]; finalAuthority: hr |
| **Flow 5** | HOD → Manager → HR | 3 | hr | steps: [hod, manager, hr]; finalAuthority: hr |
| **Flow 6** | HOD → Manager | 2 | manager | steps: [hod, manager]; finalAuthority: manager |

### 2.1 Flow-to-Configuration Mapping

**Flow 1** (HOD → Manager → HR → Super Admin):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "Manager Approval", "approverRole": "manager" },
      { "stepOrder": 3, "stepName": "HR Approval", "approverRole": "hr" },
      { "stepOrder": 4, "stepName": "Super Admin Approval", "approverRole": "super_admin" }
    ],
    "finalAuthority": { "role": "super_admin" }
  }
}
```

**Flow 2** (HOD → HR → Manager → Super Admin):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "HR Approval", "approverRole": "hr" },
      { "stepOrder": 3, "stepName": "Manager Approval", "approverRole": "manager" },
      { "stepOrder": 4, "stepName": "Super Admin Approval", "approverRole": "super_admin" }
    ],
    "finalAuthority": { "role": "super_admin" }
  }
}
```

**Flow 3** (HOD → HR → Manager ✓ Approved):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "HR Approval", "approverRole": "hr" },
      { "stepOrder": 3, "stepName": "Manager Approval", "approverRole": "manager" }
    ],
    "finalAuthority": { "role": "manager" }
  }
}
```

**Flow 4** (HOD → HR ✓ Approved):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "HR Approval", "approverRole": "hr" }
    ],
    "finalAuthority": { "role": "hr" }
  }
}
```

**Flow 5** (HOD → Manager → HR ✓ Approved):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "Manager Approval", "approverRole": "manager" },
      { "stepOrder": 3, "stepName": "HR Approval", "approverRole": "hr" }
    ],
    "finalAuthority": { "role": "hr" }
  }
}
```

**Flow 6** (HOD → Manager ✓ Approved):
```json
{
  "workflow": {
    "steps": [
      { "stepOrder": 1, "stepName": "HOD Approval", "approverRole": "hod" },
      { "stepOrder": 2, "stepName": "Manager Approval", "approverRole": "manager" }
    ],
    "finalAuthority": { "role": "manager" }
  }
}
```

---

## 3. Pydah Engineering Division - Scope & Users

### 3.1 Division Identification

From `fix_division_mappings_for_hods.js` output, the division ID `6954f395d10f48e61660b2b2` is used by multiple HODs:
- ao.btech@pydah.edu.in
- transport.data@pydah.edu.in
- hbshod@pydah.edu.in
- ecehod@pydah.edu.in
- csehod@pydah.edu.in
- mehod@pydah.edu.in
- aihod.cse@pydah.edu.in
- adcvl@hr.com

This is likely **Pydah Engineering** or the primary engineering division. Run the verification script to resolve the exact name and list departments.

### 3.2 Department-Wide Requirements

For Pydah Engineering division:

1. **HOD users**: Must have `divisionMapping` with `division` = Pydah Engineering and `departments` containing the employee's department
2. **Manager users**: Must have `divisionMapping` (or `dataScope: 'all'`) covering the division/departments
3. **HR users**: Must have `divisionMapping` (or `dataScope: 'all'`) covering the division/departments
4. **Employee**: Must belong to a department under this division and have a linked User for login

### 3.3 User Existence Checklist

| Role | Requirement | Verification |
|------|-------------|--------------|
| HOD | At least one HOD per department with scope | Run `fix_division_mappings_for_hods.js`; verify divisionMapping |
| Manager | At least one Manager with scope over division | Check User.role=manager + divisionMapping |
| HR | At least one HR with scope (or sub_admin/super_admin) | Check User.role=hr or sub_admin |

---

## 4. Identified Issues & Gaps

### 4.1 Global Workflow Limitation

- **Issue**: LeaveSettings workflow is **global** – one workflow for all divisions/departments
- **Impact**: Flows 1–6 cannot run simultaneously; only one flow is active at a time
- **Recommendation**: To support per-division workflows, extend the model (e.g., DepartmentSettings or DivisionSettings with workflow override)

### 4.2 Manager User Collection

- **Issue**: Some Manager users (e.g. `testmanager_readonly@example.com`) may exist in Employee collection but not in User collection
- **Impact**: Password reset fails (404); Manager step falls back to Super Admin in automated tests
- **Recommendation**: Ensure all Managers used in approval flows have User records

### 4.3 HOD Scope Strictness

- **Issue**: HOD can approve only if `divisionMapping` has a mapping for the leave's division and the leave's department is in that mapping's `departments`
- **Impact**: Wrong or empty divisionMapping causes 403 "Not authorized. Waiting for hod approval. You are hod."
- **Recommendation**: Run `fix_division_mappings_for_hods.js` regularly; validate mappings in onboarding

### 4.4 finalAuthority Handling

- **Issue**: When `finalAuthority.role` is `manager` or `hr`, the last step in the chain must match; controller uses `isFinishingChain` for completion
- **Note**: Logic appears correct; `finalAuthority` is stored in leave.workflow but not heavily used in transition logic – completion is driven by `approvalChain` length

### 4.5 Forward Action

- **Issue**: HOD can "forward" to HR, bypassing Manager (line ~1218–1227). This may not align with flows that expect Manager approval
- **Recommendation**: Consider disabling or restricting forward when Manager is in the chain

---

## 5. Testing Procedure

### 5.1 Per-Flow Test

1. Update LeaveSettings via API or script with the flow's workflow config
2. Employee (or HR on behalf) applies for leave
3. HOD logs in → Approves
4. Next approver logs in → Approves (repeat until final)
5. Verify `status === 'approved'` and `workflow.isCompleted === true`

### 5.2 Scripts

- **Setup**: `node scripts/setup_test_users_for_leave_flow.js` – sets passwords, prints credentials
- **Fix HOD mappings**: `node scripts/fix_division_mappings_for_hods.js`
- **Run flow test**: `node scripts/test_leave_flow_real_users.js` (uses current LeaveSettings)
- **Comprehensive review**: `node scripts/review_and_test_approval_flows.js` – analyzes Pydah Engineering and optionally runs all 6 flows

---

## 6. Summary

| Aspect | Status |
|--------|--------|
| Data flow | Documented and understood |
| Six flows | Mapped to LeaveSettings configurations |
| Scope enforcement | HOD/Manager/HR use divisionMapping |
| Pydah Engineering | Identified by division ID; verification script provides details |
| Issues | Global workflow, Manager User records, HOD scope, Forward action |
| Testing | Scripts available; run per-flow by updating LeaveSettings |
