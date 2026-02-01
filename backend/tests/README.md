# Multi-Shift Backend Testing Guide

## 📋 Overview

This directory contains test scripts to verify the multi-shift attendance implementation.

---

## 🧪 Test Scripts

### 1. Quick Test (No Database Required)

**File:** `quick-multi-shift-test.js`

**Purpose:** Quickly verify shift detection logic without database

**Run:**

```bash
cd backend
node tests/quick-multi-shift-test.js
```

**What it tests:**

- Shift pairing logic
- Daily totals calculation
- Basic multi-shift detection

**Expected Output:**

```
✅ Detected 2 shift(s):
  Shift 1: 08:00 AM - 04:00 PM (8 hours)
  Shift 2: 06:00 PM - 10:00 PM (4 hours)
  
Total Working Hours: 12.00
```

---

### 2. Full Integration Test (Database Required)

**File:** `multi-shift-test.js`

**Purpose:** Complete end-to-end testing with database

**Setup:**

1. Update `TEST_EMPLOYEE_NUMBER` in the script with a real employee number
2. Ensure MongoDB is running
3. Ensure backend server is running

**Run:**

```bash
cd backend
node tests/multi-shift-test.js
```

**What it tests:**

- ✅ Single shift (1 IN, 1 OUT)
- ✅ Double shift (2 shifts in one day)
- ✅ Triple shift (3 shifts in one day)
- ✅ Duplicate IN detection (< 1 hour gap)
- ✅ Incomplete shift (IN without OUT)
- ✅ Overnight shift (OUT next day)

**Expected Output:**

```
==========================================================
TEST SCENARIO: DOUBLE-SHIFT
==========================================================
✅ Processing successful!
ℹ️  Shifts detected: 2
ℹ️  Total hours: 12.00

📊 Shift Details:
  Shift 1:
    IN:  8:00:00 AM
    OUT: 4:00:00 PM
    Hours: 8.00
    Status: complete
    
  Shift 2:
    IN:  6:00:00 PM
    OUT: 10:00:00 PM
    Hours: 4.00
    Status: complete

✅ Expected 2 shift(s), got 2
```

---

## 🔧 Configuration

### Environment Variables

Make sure these are set in your `.env`:

```
MONGODB_URI=mongodb://localhost:27017/li-hrms
```

### Test Employee

Update this line in `multi-shift-test.js`:

```javascript
const TEST_EMPLOYEE_NUMBER = 'EMP001'; // Change to real employee
```

---

## 📊 Test Scenarios Explained

### Scenario 1: Single Shift

```
08:00 AM → IN
04:00 PM → OUT
Expected: 1 shift, 8 hours
```

### Scenario 2: Double Shift

```
08:00 AM → IN
04:00 PM → OUT
06:00 PM → IN
10:00 PM → OUT
Expected: 2 shifts, 12 hours total
```

### Scenario 3: Triple Shift

```
06:00 AM → IN
02:00 PM → OUT
02:00 PM → IN (immediate next shift)
06:00 PM → OUT
10:00 PM → IN
02:00 AM (next day) → OUT
Expected: 3 shifts, 16 hours total
```

### Scenario 4: Duplicate IN (Ignored)

```
08:00 AM → IN
08:30 AM → IN (30 min gap - IGNORED)
04:00 PM → OUT
Expected: 1 shift, 8 hours
```

### Scenario 5: Incomplete Shift

```
08:00 AM → IN
(No OUT punch)
Expected: 1 shift, incomplete status
```

### Scenario 6: Overnight Shift

```
10:00 PM → IN
06:00 AM (next day) → OUT
Expected: 1 shift, 8 hours, stored under first day
```

---

## ✅ Success Criteria

### Quick Test

- ✅ Detects 2 shifts
- ✅ Calculates 12 total hours
- ✅ No errors

### Full Integration Test

- ✅ All 6 scenarios pass
- ✅ Daily records created in database
- ✅ Shifts array populated correctly
- ✅ Backward compatibility maintained (inTime/outTime set)
- ✅ Totals calculated correctly

---

## 🐛 Troubleshooting

### Error: "Employee not found"

**Solution:** Update `TEST_EMPLOYEE_NUMBER` with a real employee number from your database

### Error: "Cannot connect to MongoDB"

**Solution:**

1. Check if MongoDB is running
2. Verify `MONGODB_URI` in `.env`
3. Check network connectivity

### Error: "Module not found"

**Solution:** Run `npm install` in the backend directory

### Test fails with "Processing failed"

**Solution:**

1. Check backend server logs
2. Verify attendance settings are configured
3. Ensure shift assignments exist for the test employee

---

## 📝 Viewing Test Results

### Check Database

```javascript
// MongoDB shell
use li-hrms

// View daily record
db.attendancedailies.findOne({ 
  employeeNumber: 'EMP001', 
  date: '2026-01-25' 
})

// View raw logs
db.attendancerawlogs.find({ 
  employeeNumber: 'EMP001', 
  date: '2026-01-25' 
}).sort({ timestamp: 1 })
```

### Expected Database Structure

```javascript
{
  employeeNumber: "EMP001",
  date: "2026-01-25",
  shifts: [
    {
      shiftNumber: 1,
      inTime: ISODate("2026-01-25T08:00:00Z"),
      outTime: ISODate("2026-01-25T16:00:00Z"),
      workingHours: 8,
      otHours: 0,
      status: "complete"
    },
    {
      shiftNumber: 2,
      inTime: ISODate("2026-01-25T18:00:00Z"),
      outTime: ISODate("2026-01-25T22:00:00Z"),
      workingHours: 4,
      otHours: 0,
      status: "complete"
    }
  ],
  totalShifts: 2,
  totalWorkingHours: 12,
  totalOTHours: 0,
  inTime: ISODate("2026-01-25T08:00:00Z"),  // First IN
  outTime: ISODate("2026-01-25T22:00:00Z"), // Last OUT
  status: "PRESENT"
}
```

---

## 🚀 Next Steps After Testing

1. ✅ Verify all tests pass
2. ✅ Check database records
3. ✅ Test with real biometric data
4. ✅ Monitor logs for errors
5. ✅ Update frontend to display multi-shift data

---

## 📞 Support

If tests fail:

1. Check console output for error messages
2. Review backend server logs
3. Verify database connectivity
4. Ensure all services are running

---

*Testing Guide Created: 2026-01-25*
