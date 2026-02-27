# Annual CL Reset Implementation

## 🎯 Overview

The Annual CL Reset feature provides **automated casual leave balance management** at the start of each financial year, with configurable carry forward handling and departmental settings integration.

## 🏗️ Architecture

### Backend Components

#### 1. **Settings Model** (`LeavePolicySettings.js`)
```javascript
annualCLReset: {
    enabled: true,                    // Enable/disable annual reset
    resetToBalance: 12,              // CL balance to reset to
    addCarryForward: true,             // Add unused CL from previous year
    resetMonth: 4,                    // Reset month (April = 4)
    resetDay: 1                       // Reset day (1st)
}
```

#### 2. **Service Layer** (`annualCLResetService.js`)
- **Reset Logic**: Complex CL balance calculations
- **Carry Forward**: Intelligent CF calculation and addition
- **Batch Processing**: Efficient bulk employee processing
- **Audit Trail**: Complete operation logging

#### 3. **Controller** (`annualCLResetController.js`)
- **Reset Operation**: Safe bulk reset with confirmation
- **Status Queries**: Employee-wise reset status
- **Preview Function**: Test reset before execution
- **Next Reset Date**: Calculate upcoming reset date

### Frontend Components

#### 1. **Settings UI** (`leave-policy/page.tsx`)
- **Annual Reset Tab**: Dedicated settings section
- **Configuration Options**: All reset parameters
- **Visual Indicators**: Important warnings and confirmations
- **Real-time Validation**: Input validation and feedback

## 📋 Key Features

### 1. **Configurable Reset Parameters**
```javascript
// Reset Configuration
{
    enabled: true,           // Master switch
    resetToBalance: 12,     // Departmental CL balance
    addCarryForward: true,  // Include unused CL
    resetMonth: 4,           // April (financial year start)
    resetDay: 1              // 1st day of month
}
```

### 2. **Intelligent Carry Forward Calculation**
```javascript
// Carry Forward Logic
// annualAllotment represents the CL allotted for the year (not including prior carry forwards)
const annualAllotment = settings.annualCLReset.resetToBalance;
const usedCLThisYear = await getUsedCLInPreviousYear(employeeId); // CL used during the financial year only

// Compute unused portion of the annual allotment only
const annualUnused = Math.max(0, annualAllotment - usedCLThisYear);

// Apply departmental limits (configured as a cap expressed in days or converted from months)
const maxCarryForwardDays = getMaxCarryForwardDays(settings); // e.g., from settings.carryForward.casualLeave.maxMonths
const carryForwardAmount = Math.min(annualUnused, maxCarryForwardDays);

// Final new balance
const newBalance = resetToBalance + carryForwardAmount;
```

### 3. **Financial Year Integration**
```javascript
// Automatic Financial Year Detection
const financialYear = getFinancialYear(resetDate);
// Reset occurs at financial year start
// Supports both calendar year and custom financial year
```

## 🚀 API Endpoints

### Annual Reset Operations
```javascript
// Perform annual reset (with confirmation)
POST /api/leaves/annual-reset
{
    "targetYear": 2024,
    "confirmReset": true
}

// Get reset status for employees
GET /api/leaves/annual-reset/status?departmentId=dept123&divisionId=div456

// Get next reset date
GET /api/leaves/annual-reset/next-date

// Preview reset before execution
POST /api/leaves/annual-reset/preview
{
    "sampleSize": 10
}
```

### Response Examples
```javascript
// Reset Operation Response
{
    "success": true,
    "message": "Annual CL reset completed: 150 employees processed successfully, 2 errors",
    "resetYear": "2024-2025",
    "resetDate": "2024-04-01T00:00:00.000Z",
    "processed": 152,
    "successCount": 150,
    "errors": [],
    "details": [
        {
            "employeeId": "emp123",
            "previousBalance": 8,
            "carryForwardAdded": 2,
            "newBalance": 14
        }
    ]
}

// Status Query Response
{
    "success": true,
    "data": [
        {
            "employeeId": "emp123",
            "currentBalance": 12,
            "nextResetDate": "2025-04-01",
            "resetEnabled": true
        }
    ]
}
```

## 🔄 Reset Process Flow

### 1. **Pre-Reset Validation**
```
1. Check if annual reset is enabled.
2. Verify timezone configuration for accurate date comparison (e.g., use IST/UTC consistently).
3. Verify reset date has arrived in the canonical timezone.
4. Ensure idempotency by checking if a reset has already been performed for this financial year
   (consult a ResetAudit record keyed by financial year).
5. Get current employee CL balances.
6. Calculate carry forward amounts.
7. Validate departmental settings.
```

### 2. **Reset Execution**
```
1. For each active employee:
   - Get current CL balance
   - Calculate used CL in previous year
   - Determine unused CL amount
   - Apply carry forward limits
   - Calculate new balance = resetToBalance + carryForward
   - Update employee record
   - Log reset operation

2. Generate comprehensive reset report
3. Send notifications (optional)
```

### 3. **Post-Reset Operations**
```
1. Update leave register with new balances
2. Apply any department-specific rules
3. Generate reset audit report
4. Update employee self-service portals
```

## 🎛️ Integration Points

### **With Leave Register**
- **Balance Updates**: Real-time CL balance synchronization
- **Financial Year Awareness**: Correct year-based calculations
- **Department Settings**: Integration with departmental policies
- **Audit Trail**: Complete reset history tracking

### **With Leave Application System**
- **Validation**: CL balance checks use reset amounts
- **Approval Workflow**: Reset balances reflected in approvals
- **Carry Forward**: CF amounts available for applications
- **Reporting**: Accurate CL availability reporting

### **With Attendance System**
- **Attendance Data**: Source for CL usage calculations
- **Yearly Summaries**: Annual attendance aggregation
- **Present Days**: Accurate CL eligibility determination
- **Auto-Calculation**: Attendance-based EL earning

## 🔐 Security & Safety Features

### **Confirmation Required**
```javascript
// Prevents accidental resets
{
    "confirmReset": true,  // Must be explicitly set
    "preview": true        // Preview before execution
}
```

### **Role-Based Access**
- **HR/Admin**: Can perform reset and view status
- **Managers**: Can view reset status for their team
- **Employees**: Can view next reset date only
- **System Logs**: Complete audit trail

### **Data Integrity**
- **Transaction Safety**: Atomic operations per employee
- **Rollback Capability**: Reset operation logging for potential rollback
- **Validation**: Pre-reset validation of all parameters
- **Error Handling**: Graceful failure with detailed reporting

#### Rollback Procedure

To guarantee recoverability, every reset run must be fully auditable and reversible:

1. **Stop Automated Processes**
   - Disable the annual reset cron job or any scheduled task that invokes `performAnnualCLReset`
     to prevent new runs during investigation.

2. **Retrieve Backup / Audit Snapshot**
   - Locate the pre-reset snapshot in the `ResetAudit` store (or equivalent audit collection).
   - Each reset should persist a record such as:
     ```json
     {
       "resetId": "reset-2024-04-01",
       "financialYear": "2024-2025",
       "takenAt": "2024-04-01T00:00:00.000Z",
       "balancesBefore": [ /* per-employee CL balances */ ]
     }
     ```

3. **Execute Rollback**
   - Call the rollback API endpoint:
     ```http
     POST /api/leaves/annual-reset/rollback
     Content-Type: application/json

     {
       "resetId": "reset-2024-04-01",
       "confirmRollback": true
     }
     ```
   - The rollback handler should:
     - Validate that `resetId` exists and is in a rollback-eligible state.
     - Restore employee CL balances from the `balancesBefore` snapshot.
     - Mark the corresponding `ResetAudit` record as rolled back.

4. **Verify Restoration**
   - Run a comparison job/report that:
     - Recomputes current employee CL balances from the leave register.
     - Compares them against the backup snapshot for the specified `resetId`.
   - Any mismatches should be logged and highlighted for manual investigation.

5. **Investigate Root Cause**
   - Use application logs and `ResetAudit` metadata (start/end timestamps, operator, parameters,
     error summaries) to determine the failure cause.
   - Fix configuration or code issues before re-running the reset.

6. **Re-execute the Reset**
   - Once the issue is resolved, create a fresh reset run:
     - Ensure a new `resetId` and audit snapshot are created.
     - Confirm that the idempotency checks (based on financial year and `ResetAudit` status)
       allow the new run.
   - Re-enable the cron job after manual verification.

## 📊 Configuration Examples

### **Standard Configuration**
```javascript
{
    "annualCLReset": {
        "enabled": true,
        "resetToBalance": 12,
        "addCarryForward": true,
        "resetMonth": 4,
        "resetDay": 1
    },
    "carryForward": {
        "casualLeave": {
            "enabled": true,
            "maxMonths": 12,
            "carryForwardToNextYear": true
        }
    }
}
```

### **Custom Financial Year**
```javascript
{
    "financialYear": {
        "useCalendarYear": false,
        "startMonth": 4,  // April start
        "startDay": 1
    },
    "annualCLReset": {
        "resetMonth": 4,  // Matches financial year start
        "resetDay": 1
    }
}
```

## 📱 User Interface Features

### **Settings Page**
- **Annual Reset Tab**: Dedicated configuration section
- **Visual Warnings**: Important operation warnings
- **Preview Function**: Test reset before execution
- **Department Integration**: Uses departmental CL settings
- **Real-time Validation**: Input validation feedback

### **Status Dashboard**
- **Next Reset Date**: Countdown to next reset
- **Employee Status**: Individual reset status view
- **Department Filters**: Filter by department/division
- **Reset History**: Audit trail of past resets

## 🧪 Testing & Deployment

### **Unit Testing**
```javascript
describe('Annual CL Reset', () => {
  test('should reset CL with correct carry forward and persistence', async () => {
    const targetYear = 2024;

    // Arrange: seed a sample employee with prior balance and usage
    const employee = await createTestEmployee({ emp_no: 'E001' });
    await seedLeaveRegisterForYear(employee._id, {
      annualAllotment: 12,
      usedCLThisYear: 4 // 8 days unused from annual allotment
    });

    // Act
    const result = await performAnnualCLReset(targetYear);

    // Assert top-level result structure
    expect(result.resetToBalance).toBe(12);
    expect(result.addCarryForward).toBe(true);
    expect(result.employeesUpdated).toContainEqual(
      expect.objectContaining({ employeeId: employee._id.toString() })
    );

    const detail = result.details.find(d => d.employeeId === employee._id.toString());
    expect(detail).toBeDefined();
    expect(detail.priorBalance).toBeGreaterThanOrEqual(0);
    expect(detail.carryForwardAmount).toBe(8); // 12 - 4
    expect(detail.newBalance).toBe(detail.carryForwardAmount + result.resetToBalance);

    // Verify persistence
    const updatedBalance = await leaveRegisterService.getCurrentBalance(employee._id, 'CL');
    expect(updatedBalance).toBe(detail.newBalance);
  });
});
```

### **Integration Testing**
- **Settings Integration**: Test with various configurations
- **Employee Processing**: Test bulk reset operations
- **Carry Forward**: Test CF calculation accuracy
- **Error Handling**: Test failure scenarios

### **Deployment Checklist**
- [ ] Database migration completed
- [ ] Settings configured correctly
- [ ] Test reset in development environment
- [ ] Verify carry forward calculations
- [ ] Test with different financial year settings
- [ ] Schedule annual reset cron job
- [ ] Train HR team on new features

## 📋 Benefits

### **For Organization**
- **Automation**: Eliminates manual CL balance updates
- **Accuracy**: Precise balance calculations with carry forward
- **Compliance**: Consistent application of CL policies
- **Efficiency**: Bulk processing of all employees
- **Audit Trail**: Complete reset operation history

### **For HR Team**
- **Control**: Configurable reset parameters
- **Safety**: Confirmation requirements and preview functionality
- **Reporting**: Comprehensive reset status and history
- **Flexibility**: Support for custom financial years
- **Integration**: Seamless leave register integration

### **For Employees**
- **Transparency**: Clear CL balance reset schedule
- **Fairness**: Consistent policy application
- **Planning**: Predictable CL availability
- **Self-Service**: View next reset dates and balances

## 🔄 Automation & Scheduling

### **Cron Job Configuration**
```javascript
// Annual reset cron job (runs on financial year start)
const annualResetJob = {
  schedule: '0 0 1 4 *', // 1st April, midnight
  timezone: 'Asia/Kolkata',
  handler: () => performAnnualCLReset(),
  enabled: true,

  // Retry strategy for transient failures
  retryStrategy: {
    attempts: 3,
    intervalMs: 5 * 60 * 1000, // 5 minutes between attempts (exponential backoff optional)
  },

  // Failure callback for alerting and diagnostics
  onFailure: (error, context) => {
    logger.error('Annual CL reset job failed', { error, context });
    notifyHRTeam({
      type: 'ANNUAL_CL_RESET_FAILURE',
      message: 'Annual CL reset job failed after retries',
      error,
      context,
    });
  },
};
```

### **Manual Trigger Endpoint**

In addition to the scheduled job, expose a manual trigger so HR can re-run the reset (idempotently)
if the cron was missed:

```http
POST /api/leaves/annual-reset/manual
Content-Type: application/json

{
  "targetYear": 2024,
  "confirmReset": true
}
```

The manual endpoint should:

- Reuse the same `performAnnualCLReset` implementation as the cron job.
- Enforce the same idempotency and ResetAudit checks (no double-crediting for a year).
- Require appropriate authorization (e.g., HR/Admin only).

### **Automated Notifications**
```javascript
// Reset completion notifications
{
    "hrNotification": true,      // Notify HR team
    "employeeNotification": false,  // Optional employee notification
    "emailTemplate": "cl-reset-notice",
    "smsEnabled": false
}
```

## 🎯 Best Practices

### **Configuration**
- **Test First**: Always use preview before production reset
- **Backup Settings**: Export settings before major changes
- **Department Alignment**: Ensure CL settings match department policies
- **Financial Year**: Confirm financial year configuration
- **Carry Forward Rules**: Review and validate CF limits

### **Operational**
- **Schedule Wisely**: Run resets during off-peak hours
- **Monitor Performance**: Track reset operation timing
- **Validate Results**: Review reset reports for accuracy
- **Communicate Changes**: Inform employees about reset policies

This implementation provides a **complete, safe, and flexible annual CL reset system** that integrates seamlessly with existing leave management while providing full control over reset policies and carry forward handling.
