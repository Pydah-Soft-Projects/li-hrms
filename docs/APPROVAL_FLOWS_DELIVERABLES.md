# Leave Approval Flows - Detailed Insights & Deliverables

## Executive Summary

This document describes the deliverables for the 6 leave approval flows, including: (1) automatic Manager creation when none exists, (2) per-flow workflow configuration before each test, and (3) detailed test outcomes and insights.

---

## 1. Deliverables Overview

| Deliverable | Description | Location |
|-------------|-------------|----------|
| **Manager creation script** | Creates Manager for division if none has scope | `scripts/fix_division_mappings_for_managers.js` |
| **Per-flow test runner** | Configures workflow per flow → creates leave → runs chain → records outcome | `scripts/review_and_test_approval_flows.js` |
| **Review document** | Full data flow, 6 flows, issues | `docs/LEAVE_APPROVAL_FLOWS_REVIEW.md` |
| **This document** | Insights and deliverables | `docs/APPROVAL_FLOWS_DELIVERABLES.md` |

---

## 2. Manager Creation

### 2.1 Logic

1. **Fix existing Managers**: For each Manager user with linked employee, set `divisionMapping` from that employee’s division/department.
2. **Create if none**: If no Manager has scope over the target division (Pydah Engineering):
   - Create User with:
     - `email`: `manager.pydah.engineering@hrms.test` (or `MANAGER_EMAIL`)
     - `password`: `Test@123` (or `MANAGER_PASSWORD`)
     - `role`: `manager`
     - `divisionMapping`: `[{ division: <divId>, departments: [] }]` (all departments)
     - `isActive`: true

### 2.2 Usage

```bash
node scripts/fix_division_mappings_for_managers.js
DIVISION_NAME="Engineering" node scripts/fix_division_mappings_for_managers.js
MANAGER_EMAIL=manager.pyde@hrms.test node scripts/fix_division_mappings_for_managers.js
```

---

## 3. Per-Flow Test Sequence

For each flow, the script follows this sequence:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  FOR EACH FLOW (1..6):                                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  STEP 1: Configure workflow in DB                                             │
│          → Update LeaveSettings.workflow (steps + finalAuthority)              │
│          → Only this flow’s config is active for the next leave                │
│                                                                               │
│  STEP 2: Create leave                                                         │
│          → Use unique dates (offset by flow index) to avoid conflicts          │
│          → Purpose includes flow identifier                                   │
│                                                                               │
│  STEP 3: Run approval chain                                                   │
│          → HOD → Manager → HR → Super Admin (as configured)                    │
│          → Each approver logs in and approves                                 │
│          → Fallback to Super Admin if login fails                             │
│                                                                               │
│  STEP 4: Record outcome                                                       │
│          → Pass/Fail, leave ID, approver log (real vs Super Admin)             │
│                                                                               │
│  → Move to next flow (workflow is reconfigured for that flow)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Usage

### 4.1 One-shot (with setup)

```bash
# Create manager, reset passwords, run all 6 flows
node scripts/review_and_test_approval_flows.js --test --setup
```

### 4.2 After manual setup

```bash
# 1. Fix HOD mappings
node scripts/fix_division_mappings_for_hods.js

# 2. Create Manager for division
node scripts/fix_division_mappings_for_managers.js

# 3. Reset passwords (API must be running)
node scripts/setup_test_users_for_leave_flow.js

# 4. Run 6-flow tests
node scripts/review_and_test_approval_flows.js --test
```

### 4.3 Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DIVISION_NAME` | Division name (partial match) | `Engineering` |
| `TEST_PASSWORD` | Password for HOD/Manager/HR | `Test@123` |
| `MANAGER_EMAIL` | Email for created Manager | `manager.pydah.engineering@hrms.test` |
| `MANAGER_PASSWORD` | Password for created Manager | `Test@123` |
| `API_BASE` | Backend API base URL | `http://localhost:5000` |

---

## 5. Output Format

### 5.1 Per-flow result

```
✓ flow1: HOD → Manager → HR → Super Admin | Leave 69873e3ef6fbc6482c2eefe0 | Approvers: hod→manager→hr→super_admin
✓ flow2: HOD → HR → Manager → Super Admin | Leave 69873e4ef6fbc6482c2eefe1 | Approvers: hod→hr→manager→super_admin
...
```

### 5.2 Detailed outcomes table

```
DETAILED OUTCOMES:
----------------------------------------------------------------------------
flow1    PASS   69873e3ef6fbc6482c2eefe0     hod(real) → manager(real) → hr(real) → super_admin(real)
flow2    PASS   ...
flow3    PASS   ...
flow4    PASS   ...
flow5    PASS   ...
flow6    PASS   ...
----------------------------------------------------------------------------
RESULT: 6/6 flows passed
```

- `(real)` = real user approved  
- `(SA)` = Super Admin fallback

---

## 6. Insights

### 6.1 Workflow is global

- LeaveSettings defines a single workflow for all leaves.
- For each flow, the script updates LeaveSettings before creating that flow’s leave.
- Only one flow configuration is active at a time during the run.

### 6.2 Real users required

- HOD, Manager, HR must:
  - Exist in the User collection
  - Have `divisionMapping` covering the employee’s division/department
  - Have a known password (e.g. from setup).
- Otherwise, the script falls back to Super Admin for that step.

### 6.3 Date offsets

- Each flow uses a different leave date range (offset by 7 days per flow).
- Prevents date conflicts when creating multiple leaves in one run.

### 6.4 Final configuration

- After tests, LeaveSettings remains set to the last flow (flow6).
- To restore a specific flow, run the workflow update script or change settings in the UI.

---

## 7. Checklist for Production Testing

- [ ] API is running
- [ ] MongoDB is connected
- [ ] HOD mappings fixed (`fix_division_mappings_for_hods.js`)
- [ ] Manager exists for division (`fix_division_mappings_for_managers.js`)
- [ ] Passwords reset for HOD, Manager, HR (via setup or `--setup`)
- [ ] At least one employee in Pydah Engineering division
- [ ] Super Admin credentials correct in `.env`

---

## 8. Troubleshooting

| Issue | Cause | Action |
|-------|-------|--------|
| "No Manager has scope" | No Manager with divisionMapping for the division | Run `fix_division_mappings_for_managers.js` |
| Manager login fails | Manager not in User collection or wrong password | Ensure Manager has User record and password reset |
| HOD 403 | HOD lacks scope for leave’s department | Run `fix_division_mappings_for_hods.js` |
| Flow fails at Manager step | Manager credentials invalid | Use `--setup` or run `setup_test_users_for_leave_flow.js` |
