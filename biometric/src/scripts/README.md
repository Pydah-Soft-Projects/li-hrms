# Dummy Data for Export Testing

This directory contains scripts to generate test data for the biometric system.

## addDummyData.js

Generates realistic attendance logs AND registers a test device for testing the export excel feature.

### What it does:
- **Registers a device** called "Main Gate Device" (DEVICE001) in the database
- **Creates 10 user records** (DeviceUser) so they appear in the "User Info" tab
- Creates attendance logs for **10 dummy employees** (EMP001 - EMP010)
- Generates data for the **last 30 working days** (excluding weekends)
- Simulates realistic attendance patterns:
  - **60%** normal shifts (CHECK-IN at ~9 AM, CHECK-OUT at ~6 PM)
  - **30%** shifts with breaks (CHECK-IN, BREAK-OUT, BREAK-IN, CHECK-OUT)
  - **10%** overtime shifts (normal shift + OVERTIME-IN/OUT)
  - **10%** random absences per employee

### How to run:

```bash
# From the biometric folder
node src/scripts/addDummyData.js
```

### After running the script:

1. **Refresh the dashboard** at http://localhost:4000/dashboard.html
2. You should now see **"Main Gate Device"** in the left sidebar
3. Click on the device to view attendance logs, user info, and export data

### Testing the Export Feature:

#### Using the Dashboard:

1. Open http://localhost:4000/dashboard.html
2. Click on "Main Gate Device" in the left sidebar
3. Navigate to the "Attendance Logs" tab
4. Click "Download Report" or "Export Excel (Unique IDs)"
5. Select date range and filters
6. Click download to get the CSV/Excel file

#### Using the API:

```bash
# Export all employees for the last 30 days
curl "http://localhost:4000/api/export/attendance?startDate=2025-12-14&endDate=2026-02-10"

# Export specific employee
curl "http://localhost:4000/api/export/attendance?employeeId=EMP001&startDate=2026-02-01&endDate=2026-02-10"
```

### Generated Employee IDs:

- EMP001 - John Doe
- EMP002 - Jane Smith
- EMP003 - Robert Johnson
- EMP004 - Emily Davis
- EMP005 - Michael Wilson
- EMP006 - Sarah Brown
- EMP007 - David Lee
- EMP008 - Lisa Taylor
- EMP009 - James Anderson
- EMP010 - Maria Martinez

### Troubleshooting:

**Q: I don't see any devices in the dashboard after running the script!**

A: Make sure to:
1. Check that the script completed successfully (look for "✓ Device registered" in the output)
2. **Refresh your browser** (F5 or Ctrl+R)
3. Check that the server is running (`npm start` in the biometric folder)
4. If still not showing, run the script again: `node src/scripts/addDummyData.js`

**Q: The device appears but there's no attendance data!**

A: This means the device was created but the logs weren't inserted. Check the script output for errors, and make sure MongoDB is running properly.

### Notes:

- The script will **clear existing logs** from the "Main Gate Device" before adding new data
- If you run the script multiple times, it will recreate the device and regenerate all attendance logs
- All logs are tagged with `deviceId: DEVICE001` and `deviceName: Main Gate Device`
- Data includes realistic time variations (±30 minutes) for natural-looking attendance patterns
- The device appears as "enabled" with 10 users and ~534 attendance logs

