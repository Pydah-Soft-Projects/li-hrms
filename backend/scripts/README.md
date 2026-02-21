# Backend Scripts

This directory contains utility scripts for the HRMS backend.

## Scope & Division Mapping Scripts

### analyze_scope_and_division_mapping.js

Analyzes how scope filters apply to users and employees. Connects to MongoDB, fetches all users/employees/divisions/departments, builds scope filter per user, and reports which employees each user can see.

```bash
cd backend
MONGODB_URI=mongodb://localhost:27017/hrms node scripts/analyze_scope_and_division_mapping.js
```

**Output:** User scope analysis, employee counts per user, sample employees per user, and users needing division mappings.

### fix_division_mappings_for_hods.js

Populates divisionMapping for HOD users who have empty mappings. Uses each HOD's linked employee (employeeRef) to set `{ division: emp.division_id, departments: [emp.department_id] }`.

```bash
cd backend
MONGODB_URI=mongodb://localhost:27017/hrms node scripts/fix_division_mappings_for_hods.js
```

### migrate_users_to_division_mapping.js

One-time migration: converts legacy `allowedDivisions`, `departments`, `department` → `divisionMapping` and removes old fields from User documents.

```bash
cd backend
node scripts/migrate_users_to_division_mapping.js
```

---

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
# Application Generation Scripts

## Generate Test Applications

### Script: `generateApplications.js`

This script generates 50 realistic employee applications for testing purposes.

#### Usage

```bash
cd backend
node scripts/generateApplications.js
```

#### What it does

- ✅ Generates **50 employee applications** with realistic data
- ✅ All applications are set to **'pending'** status
- ✅ Uses existing **departments, divisions, designations, and users**
- ✅ Generates unique employee numbers (EMP5000+)
- ✅ Creates diverse realistic data including:
  - Indian names (first + last name combinations)
  - Valid phone numbers, email addresses, Aadhar numbers
  - Bank details with realistic account numbers and IFSC codes
  - Random qualifications and experience
  - Salary range: ₹20,000 - ₹1,00,000
  - Random cities, addresses, blood groups
  
#### Requirements

Before running the script, ensure you have:
- ⚠️ At least **one department** created
- ⚠️ At least **one HR/Admin user** created
- ⚠️ MongoDB connection configured in `.env`

#### Example Output

```
🚀 Starting application generation...

✓ MongoDB connected successfully

📊 Fetching existing data...
✓ Found 5 departments
✓ Found 2 divisions
✓ Found 7 designations
✓ Found 3 users
✓ Found 36 existing employee numbers

📝 Generating 50 applications...
   Generated 50/50 applications...

💾 Saving applications to database...
   Saved 10/50 applications...
   Saved 20/50 applications...
   Saved 30/50 applications...
   Saved 40/50 applications...
   Saved 50/50 applications...

✅ Success! Generated 50 employee applications

📋 Summary:
   • Total applications created: 50
   • Status: All set to 'pending'
   • Salary range: ₹20,000 - ₹1,00,000
   • Departments: 5 different departments

🎯 You can now test the bulk approve feature with these applications!
```

#### Testing Bulk Approve

After generating applications, you can test the bulk approve feature:

1. **Navigate to:** Frontend → Employees → Applications tab
2. **Select:** Any number of pending applications
3. **Test scenarios:**
   - Select 1-10 apps → Should process **synchronously** with immediate feedback
   - Select 11+ apps → Should queue a **background job** with delayed feedback

#### Notes

- The script automatically avoids duplicate employee numbers
- All generated data follows backend model constraints
- Applications are inserted in batches of 10 for better performance
- Safe to run multiple times (will create new unique employee numbers)

#### Cleanup

To delete all generated test applications:

```javascript
// In MongoDB shell or Compass
db.employeeapplications.deleteMany({ emp_no: { $regex: /^EMP5/ } })
```

Or create a cleanup script:

```bash
node scripts/cleanupApplications.js  # (You would need to create this)
```
