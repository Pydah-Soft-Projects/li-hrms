# LI-HRMS Testing Guide 🧪

This guide explains how to run the automated tests for the LI-HRMS application.

## 🚀 Quick Start

### 1. Backend API Tests
Run these tests to verify the server, database connections, and business logic.

```bash
cd backend
# Run all API tests
npm run test:api

# Run only health checks
npm run test:health
```

### 2. Frontend UI Tests (Playwright)
Run these tests to verify the user interface and critical user flows.

```bash
cd frontend
# Run all UI tests (headless)
npm run test:ui

# Run UI tests with interactive dashboard (Recommended)
npm run test:ui:ui

# View the last test report
npm run test:ui:report
```

---

## 📁 Testing Structure

### Backend (`/backend/tests`)
- `api/`: Integration tests for Express routes and controllers.
- `payroll/`: Specific tests for payroll calculation logic.

### Frontend (`/frontend/tests`)
- `smoke.spec.ts`: Basic availability check.
- `auth.spec.ts`: Login, logout, and permission checks (Coming soon).
- `employees.spec.ts`: Employee management flows (Coming soon).

---

## 🔍 Understanding Test Output

### Backend (Jest)
When you run `npm run test:api`, you will see:
- `PASS` or `FAIL` for each test file.
- Detailed error messages if a calculation or API response doesn't match expectations.

### Frontend (Playwright)
When you run `npm run test:ui`, it will:
1. Launch browsers (Chromium, Firefox, Webkit).
2. Execute the steps in the scripts.
3. Provide a summary. 
4. If a test fails, it captures a **screenshot** and a **trace log** which you can view using `npm run test:ui:report`.
