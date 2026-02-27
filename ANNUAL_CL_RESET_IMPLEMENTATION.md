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
const currentCL = employee.paidLeaves || 0;
const usedCL = await getUsedCLInPreviousYear(employeeId);
const unusedCL = Math.max(0, currentCL - usedCL);

// Apply departmental limits
const carryForwardAmount = Math.min(unusedCL, maxCarryForwardMonths);

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
    "message": "Annual CL reset completed: 150 successful, 2 errors",
    "resetYear": "2024-2025",
    "resetDate": "2024-04-01T00:00:00.000Z",
    "processed": 152,
    "success": 150,
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
1. Check if annual reset is enabled
2. Verify reset date has arrived
3. Get current employee CL balances
4. Calculate carry forward amounts
5. Validate departmental settings
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
    test('should reset CL to 12 with carry forward', async () => {
        const result = await performAnnualCLReset(2024);
        expect(result.resetToBalance).toBe(12);
        expect(result.addCarryForward).toBe(true);
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
    enabled: true
};
```

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
