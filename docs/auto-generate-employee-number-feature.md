# Auto-Generate Employee Number – Implementation Plan

## 1. Feature summary

- **Setting (on/off):** "Auto generate employee number"
  - **ON:** When adding a new employee, the system assigns the next employee number automatically (highest existing number + 1). The form does not ask for employee number.
  - **OFF:** User must enter the employee number manually (current behaviour).

---

## 2. Backend

### 2.1 Setting

- **Key:** `auto_generate_employee_number`
- **Value:** `'true'` | `'false'` (string, or boolean stored as string)
- **Category:** `'employee'` or `'general'`
- **Default:** `'false'` (manual entry) so existing behaviour is unchanged.
- Store/read via existing Settings model and `getSetting` / `upsertSetting` APIs.

### 2.2 Next number logic

- Input: all (or scoped) employees’ `emp_no`.
- Parse each `emp_no` as integer (ignore non-numeric; e.g. `"100"` → 100, `"E50"` → 50, `"ABC"` → skip).
- **Next = max(numeric values) + 1**. If no numeric values, use **1**.
- Return as string (e.g. `"101"`). No leading-zero padding unless you add a separate formatting rule later.

Edge cases:

- Only non-numeric `emp_no` (e.g. "EMP-A") → next = `"1"`.
- Empty collection → next = `"1"`.

### 2.3 Create employee (POST /api/employees)

- After reading request body (and before duplicate check):
  1. Load setting `auto_generate_employee_number`.
  2. **If setting is true** and (`emp_no` is missing, null, or blank after trim):
     - Compute next employee number (as above).
     - Set `employeeData.emp_no = nextEmpNo` (string).
  3. **If setting is false** and (`emp_no` is missing or blank):
     - Return **400** with message like "Employee number (emp_no) is required when auto-generate is off".
- Rest of create flow unchanged (duplicate check, validation, save). Duplicate check will use the (possibly auto-generated) `emp_no`.

### 2.4 Optional: GET next employee number (for UI)

- **Endpoint (e.g.):** `GET /api/employees/next-emp-no`
- **Response:** `{ success: true, data: { nextEmpNo: "101" } }`
- Use when auto-generate is ON to show “Next number: 101” in the form. If you prefer not to show the number until after save, this can be skipped.

### 2.5 Bulk upload (employee applications) – respect setting

- **Endpoint:** `POST /api/employee-applications/bulk`
- **Behaviour:**
  - Load setting `auto_generate_employee_number`.
  - **If setting is OFF:** For any row where `emp_no` is missing, null, or blank (after trim), treat as validation error (per-row: "Employee number is required when auto-generate is off").
  - **If setting is ON:** For rows where `emp_no` is missing or blank, assign next employee numbers in sequence (helper returns `[next, next+1, ...]`) before duplicate check and insert.
  - Rest of bulk logic unchanged. Duplicate check uses the (possibly auto-assigned) `emp_no`.

---

## 3. Frontend

### 3.1 Where the setting is shown

- Add an **Employee** (or General) settings section, or reuse an existing settings page that has toggles (e.g. near payroll settings).
- **Control:** One toggle – **“Auto generate employee number”** (on/off).
- On save: call `api.upsertSetting({ key: 'auto_generate_employee_number', value: true | false, category: 'employee' })`.
- On load: call `api.getSetting('auto_generate_employee_number')` and set toggle state (default false if missing).

### 3.2 Add/Edit employee form (create mode)

- **On open add form** (or when dialog opens for “Add employee”):
  - Fetch `getSetting('auto_generate_employee_number')`.
- **If ON:**
  - **Option A:** Hide the employee number field. Submit payload without `emp_no` (or with empty string); backend will generate.
  - **Option B:** Show a read-only/disabled field with placeholder “Auto-generated” or call `GET /api/employees/next-emp-no` and show “Next: 101”.
  - Do **not** require `emp_no` in client-side validation when auto-generate is ON.
- **If OFF:**
  - Show employee number input as now.
  - Require `emp_no` (and show error if empty) as today.
- **Edit mode:** Always show `emp_no` (read-only or disabled) and never change it; no auto-generate behaviour when editing.

Apply the same behaviour in both:

- **Superadmin:** `frontend/src/app/superadmin/employees/page.tsx`
- **Workspace:** `frontend/src/app/(workspace)/employees/page.tsx`

(and any other place that uses the same create-employee flow).

### 3.3 Bulk upload (preview and submit) – respect setting

- **Where:** Same employee pages that use the bulk upload dialog (Superadmin and Workspace employees).
- **Preview (bulk upload):**
  - When opening the bulk upload dialog (or when file is parsed), ensure the **auto generate employee number** setting is available (e.g. from existing settings fetch or a dedicated call to `getSetting('auto_generate_employee_number')` or from `GET /api/employees/settings` if it includes this key).
  - **If setting is ON:** In row validation (e.g. `validateEmployeeRow`), treat `emp_no` as **optional**. Do not add "Employee No is required" for empty `emp_no`. Optionally show "(Auto)" or "Auto-generated" in the preview for empty employee number cells so the user sees that numbers will be assigned on upload.
  - **If setting is OFF:** Require `emp_no` in each row as today (show error in preview for missing employee number).
- **Submit (bulk upload):**
  - When building the payload for `bulkCreateEmployeeApplications`, rows without an employee number (when setting is ON) can send `emp_no` as empty string or omit it; the backend will assign numbers. When setting is OFF, the preview validation already ensures every row has `emp_no`, so payload will include it.
- **Implementation:** Pass an option into the row validator (e.g. `autoGenerateEmpNo: boolean`) so `validateEmployeeRow(..., options)` can skip the emp_no required check when `options.autoGenerateEmpNo === true`.

### 3.4 Validation

- In `handleSubmit` (or equivalent): if auto-generate is **OFF**, require `formData.emp_no`; if **ON**, skip emp_no requirement and allow empty (backend will set it).

---

## 4. Implementation order

1. **Backend**
   - Add helper to compute **next employee number** (max numeric + 1) and **next N numbers** for bulk.
   - In **getEmployeeSettings**: include `auto_generate_employee_number`.
   - In **createEmployee**: read setting; if ON and no `emp_no` set next; if OFF and no `emp_no` return 400.
   - In **bulkCreateApplications**: read setting; if OFF reject rows without `emp_no`; if ON assign next, next+1, ... to rows without `emp_no`, then proceed.
   - (Optional) Add **GET /api/employees/next-emp-no** that returns `{ nextEmpNo }`.
2. **Settings UI**
   - Add “Auto generate employee number” toggle and save/load using existing settings API.
3. **Frontend – create employee**
   - Load setting when opening add form.
   - If ON: hide or disable emp_no, don’t require it, optionally show next number.
   - If OFF: show and require emp_no as now.
   - Ensure payload for create does not send a required emp_no when auto-generate is ON (backend will set it).

---

## 5. Summary

| Item | Detail |
|------|--------|
| Setting key | `auto_generate_employee_number` (true/false) |
| When ON | Backend sets `emp_no` = max(numeric emp_no) + 1 if not provided. |
| When OFF | Backend returns 400 if `emp_no` missing/blank. |
| Frontend (create) | If ON: don’t ask for emp_no; if OFF: require emp_no. |
| Edit | Always show existing emp_no; never auto-generate on edit. |
| Bulk upload (preview) | If ON: emp_no optional, show "(Auto)" for empty; if OFF: require emp_no. |
| Bulk upload (submit) | If ON: backend assigns numbers for empty emp_no; if OFF: all rows must have emp_no. |

This keeps behaviour backward compatible (default OFF) and gives a clear path to implement the feature end-to-end.
