# Backend Scripts

This directory contains utility scripts for the HRMS backend.

## Available Scripts

### 1. generateLiveAttendanceTestData.js

Generates test attendance data for the Live Attendance Reports feature.

**What it does:**
- Creates attendance records for today and yesterday
- Generates realistic scenarios:
  - Employees currently working (IN punch only)
  - Employees who completed their shift (both IN and OUT punches)
  - Various times: on-time, late arrivals, early departures
  - OT hours for some employees

**How to run:**
```bash
cd backend
node scripts/generateLiveAttendanceTestData.js
```

**Output:**
- Clears existing attendance data for today and yesterday
- Creates ~50-60 attendance records
- Shows summary of generated data

**Requirements:**
- At least 1 employee in the database
- At least 1 active shift in the database
- MongoDB connection configured in `.env`

---

## Adding New Scripts

When adding a new script:
1. Create the script file in this directory
2. Add documentation here
3. Include proper error handling
4. Use `dotenv` to load environment variables
5. Close database connections properly
