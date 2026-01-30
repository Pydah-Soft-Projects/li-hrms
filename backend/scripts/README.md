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
