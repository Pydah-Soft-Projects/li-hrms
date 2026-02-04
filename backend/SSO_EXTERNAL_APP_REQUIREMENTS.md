# SSO: Requirements for the Other Application (Auth Gateway)

This document is for the **application that sends users to HRMS via SSO** (e.g. your CRM or central portal). It describes what that application must implement and what **user details** it must provide so HRMS can find the user in the database and log them in.

---

## 1. Role of Each System

| System | Role |
|--------|------|
| **Your application** (CRM / central portal) | User logs in here → you generate an SSO token → redirect user to HRMS with `?token=...` |
| **HRMS** | Receives the token → calls your **verify-token** API → you return user identity → HRMS finds the user in its DB and creates a session |

So your application must:

1. **Expose a verify-token endpoint** that HRMS will call to validate the token and get user identity.
2. **Use user identifiers that exist in HRMS** when building the token / verify response, so HRMS can look up the user in its database.

---

## 2. What Your Application Must Implement

### 2.1 Verify-token endpoint (required)

HRMS will send the token to your backend. You must expose:

- **Method:** `POST`
- **URL:** e.g. `https://your-app.com/auth/verify-token` (you choose the path; HRMS will call the URL configured in its `SSO_VERIFY_URL` env var)
- **Request body:**
  ```json
  {
    "encryptedToken": "<the token string you generated and passed in the redirect URL>"
  }
  ```
- **Success response (200):**
  ```json
  {
    "success": true,
    "valid": true,
    "data": {
      "userId": "<see Section 3>",
      "email": "<optional but recommended>",
      "portalId": "<optional>",
      "role": "<optional>",
      "expiresAt": "2026-01-27T13:00:00.000Z"
    }
  }
  ```
- **Invalid/expired response:**
  ```json
  {
    "success": false,
    "valid": false,
    "message": "Invalid or expired token"
  }
  ```

You are responsible for:

- Generating the token when the user chooses “Open HRMS” (or similar).
- Storing/validating the token and returning the above JSON so that **`data.userId`** (and optionally **`data.email`**) match a user in HRMS (see Section 3).

### 2.2 Redirect to HRMS

After generating the token, redirect the user to HRMS login with the token in the query string:

```
https://<hrms-frontend-url>/login?token=<encrypted_token>
```

Example (development):

```
http://localhost:5173/login?token=<encrypted_token>
```

HRMS will then call your verify-token URL, resolve the user, and log them in.

---

## 3. User Details: What HRMS Needs to Find the User in the DB

HRMS looks up the user in its database using the data you return in **`data`** from the verify-token response. It needs at least one of the following that **matches exactly** a value stored in HRMS.

### 3.1 Required: `userId` (and optionally `email`)

- **`userId`** — **Required.** Used as the primary identifier to find the user.
- **`email`** — **Optional but recommended.** If you send it, HRMS can resolve the user by email when `userId` is not an HRMS internal ID.

HRMS resolves the user in this order:

| Order | What HRMS checks | Where in HRMS DB |
|-------|-------------------|-------------------|
| 1 | `userId` as MongoDB ObjectId (24-char hex) | `User._id` or `Employee._id` |
| 2 | `email` (or `userId` if it contains `@`) | `User.email` or `Employee.email` |
| 3 | `userId` as employee number (e.g. `EMP001`) | `User.employeeId` or `Employee.emp_no` |
| 4 | `userId` as display name | `User.name` or `Employee.employee_name` |

So:

- If the same person exists in **your** system and in **HRMS**, you must send a **userId** (and optionally **email**) that matches one of the above in HRMS.
- If no match is found, HRMS returns **“User not found in HRMS”** and will not create a session.

---

## 4. HRMS Database: Where User Details Live

HRMS has two main places where “users” can live. Your **userId** / **email** must match one of these.

### 4.1 User collection (HRMS staff / roles)

Used for HR, managers, admins, etc.

| Field in HRMS | Description | Use for `userId` / `email` |
|----------------|-------------|----------------------------|
| `_id` | MongoDB ObjectId | Send as `userId` if you know the HRMS User `_id` |
| `email` | Login email (unique) | Send as `email` or as `userId` if it’s the same email |
| `name` | Display name | Can be used as `userId` (less reliable if names repeat) |
| `employeeId` | Employee number (e.g. from payroll) | Send as `userId` (HRMS treats it as uppercase) |
| `isActive` | Account enabled | User must be active or HRMS rejects login |

### 4.2 Employee collection (employees / payroll)

Used for employees who may not have a “User” account.

| Field in HRMS | Description | Use for `userId` / `email` |
|----------------|-------------|----------------------------|
| `_id` | MongoDB ObjectId | Send as `userId` if you know the HRMS Employee `_id` |
| `email` | Employee email | Send as `email` or as `userId` |
| `emp_no` | Employee number (unique, uppercase) | Send as `userId` (e.g. `EMP001`) |
| `employee_name` | Full name | Can be used as `userId` (less reliable) |
| `is_active` | Record active | Employee must be active or HRMS rejects login |

So for HRMS to “check the user details in the DB”, **your application** must send a **userId** (and optionally **email**) that corresponds to one of these fields. HRMS does not pull user details from your system; it only uses the verify response to **look up** an existing user/employee in its own DB.

---

## 5. What You Need to Do (Checklist)

- [ ] **Expose `POST /auth/verify-token`** (or your chosen path) that:
  - Accepts `{ "encryptedToken": "..." }`.
  - Validates the token (signature, expiry, one-time use if applicable).
  - Returns `success`, `valid`, and `data` with at least **`userId`** (and preferably **`email`**).
- [ ] **Ensure `data.userId` (and optionally `data.email`) match HRMS:**
  - Either use HRMS **User/Employee `_id`** (if you store it), or  
  - Use **email** (same as in HRMS), or  
  - Use **employee number** (`emp_no` / `employeeId`) as `userId`.
- [ ] **Redirect to HRMS** with the token:  
  `https://<hrms-frontend>/login?token=<encrypted_token>`.
- [ ] **Share your verify-token URL** with the HRMS team so they can set **`SSO_VERIFY_URL`** in HRMS backend env (e.g. `https://your-app.com/auth/verify-token`).

---

## 6. Summary Table: Sending the Right User to HRMS

| If the person in your system is… | Send in `data` | HRMS will look up by… |
|----------------------------------|----------------|------------------------|
| Same person as HRMS User (you have their HRMS User `_id`) | `userId: "<hrms_user_mongo_id>"` | `User._id` |
| Same person as HRMS Employee (you have their HRMS Employee `_id`) | `userId: "<hrms_employee_mongo_id>"` | `Employee._id` |
| Same email in both systems | `userId: "user@company.com"` or `email: "user@company.com"` | `User.email` or `Employee.email` |
| Same employee number in both systems | `userId: "EMP001"` (or your emp no format) | `User.employeeId` or `Employee.emp_no` |

For **checking user details in the DB**, the other application’s job is to **send identifiers that already exist in HRMS** (from the tables above). HRMS then performs the actual DB lookup and creates the session.

---

## 7. HRMS Configuration (for reference)

- HRMS backend env: **`SSO_VERIFY_URL`** = your verify-token endpoint (e.g. `https://your-app.com/auth/verify-token`).
- HRMS login URL (where you redirect with `?token=...`):  
  - Dev: `http://localhost:5173/login`  
  - Prod: your HRMS frontend base URL + `/login`.

If you need the exact verify request/response contract again, see **Section 2.1** and the main **SSO_INTEGRATION_GUIDE.md** in this repo.
