# Earned Leave (EL) Implementation Guide

## 🎯 Overview

This implementation provides a **comprehensive, flexible Earned Leave system** that complies with Indian labor laws while giving organizations full control over leave policies.

## 🏗️ Architecture

### Backend Components

#### 1. **Leave Policy Settings Model** (`backend/settings/model/LeavePolicySettings.js`)
- **Financial Year Configuration**: Custom or calendar year support
- **EL Earning Rules**: Attendance-based, fixed, or slab-based
- **Carry Forward Policies**: Per leave type with expiration rules
- **Compliance Settings**: Indian Labor Act compliance
- **Auto-Update Settings**: Scheduled EL calculations

#### 2. **Earned Leave Service** (`backend/leaves/services/earnedLeaveService.js`)
- **Calculation Engine**: Complex EL calculation logic
- **Attendance Integration**: Real-time attendance data processing
- **Probation Handling**: Compliance with probation periods
- **Balance Management**: Carry forward and expiry calculations

#### 3. **Controllers & Routes**
- **Settings Controller**: CRUD operations for policy settings
- **EL Controller**: EL calculations and balance queries
- **API Endpoints**: RESTful API with proper authorization

### Frontend Components

#### 1. **Settings UI** (`frontend/src/app/(workspace)/settings/leave-policy/page.tsx`)
- **Tabbed Interface**: Organized settings management
- **Real-time Preview**: EL calculation testing
- **Validation**: Input validation and error handling
- **Responsive Design**: Mobile-friendly interface

#### 2. **API Integration** (`frontend/src/lib/api.ts`)
- **TypeScript Support**: Proper typing for all API calls
- **Error Handling**: Comprehensive error management
- **Loading States**: User feedback during operations

## 📋 Key Features

### 1. **Flexible Financial Year**
```javascript
// Options:
- Calendar Year: January 1 - December 31
- Custom Financial Year: Any start month/day (e.g., April 1)
```

### 2. **Multiple EL Earning Methods**

#### **Attendance-Based** (Indian Labor Law Standard)
```javascript
// Example: 20 days = 1 EL
minDaysForFirstEL: 20
daysPerEL: 20
maxELPerMonth: 2
```

#### **Slab-Based** (Advanced)
```javascript
// Example slabs:
[
    { minDays: 11, maxDays: 20, elEarned: 1, description: "11-20 days = 1 EL" },
    { minDays: 21, maxDays: 31, elEarned: 2, description: "21-31 days = 2 EL" }
]
```

#### **Fixed** (Simple)
```javascript
// Fixed EL regardless of attendance
elPerMonth: 1
maxELPerYear: 12
```

### 3. **Carry Forward Policies**
```javascript
// Per leave type configuration:
carryForward: {
    casualLeave: {
        enabled: true,
        maxMonths: 12,
        expiryMonths: 12,
        carryForwardToNextYear: true
    },
    earnedLeave: {
        enabled: true,
        maxMonths: 24,
        expiryMonths: 60,
        carryForwardToNextYear: true
    }
}
```

### 4. **Compliance Settings**
```javascript
// Indian Labor Acts support:
compliance: {
    applicableAct: 'shops_act', // or 'factories_act', 'it_act', 'custom'
    considerWeeklyOffs: true,
    considerPaidHolidays: true,
    probationPeriod: {
        months: 6,
        elApplicableAfter: true
    }
}
```

## 🔧 Configuration Examples

### **Standard Indian Labor Law Setup**
```json
{
    "financialYear": {
        "startMonth": 4,
        "startDay": 1,
        "useCalendarYear": false
    },
    "earnedLeave": {
        "earningType": "attendance_based",
        "attendanceRules": {
            "minDaysForFirstEL": 20,
            "daysPerEL": 20,
            "maxELPerMonth": 2,
            "maxELPerYear": 12,
            "considerPresentDays": true,
            "considerHolidays": true
        }
    }
}
```

### **Advanced Slab-Based Setup**
```json
{
    "earnedLeave": {
        "earningType": "slab_based",
        "slabRules": [
            { "minDays": 1, "maxDays": 10, "elEarned": 0, "description": "No EL for 1-10 days" },
            { "minDays": 11, "maxDays": 20, "elEarned": 1, "description": "11-20 days = 1 EL" },
            { "minDays": 21, "maxDays": 31, "elEarned": 2, "description": "21-31 days = 2 EL" }
        ]
    }
}
```

## 🚀 API Endpoints

### Settings Management
```javascript
GET    /api/settings/leave-policy           // Get current settings
PUT    /api/settings/leave-policy           // Update settings
POST   /api/settings/leave-policy/reset     // Reset to defaults
POST   /api/settings/leave-policy/preview  // Preview EL calculation
```

### Earned Leave Operations
```javascript
POST   /api/leaves/earned/calculate      // Calculate EL for employee
GET    /api/leaves/earned/balance/:id   // Get EL balance
POST   /api/leaves/earned/update-all    // Update EL for all employees
GET    /api/leaves/earned/history/:id     // Get EL history
```

## 📊 Calculation Logic

### **Attendance-Based EL Formula**
```javascript
// Step 1: Count attendance days
attendanceDays = presentDays + weeklyOffs (if enabled) + holidays (if enabled)

// Step 2: Check minimum threshold
if (attendanceDays >= minDaysForFirstEL) {
    // Step 3: Calculate EL
    elEarned = Math.floor(attendanceDays / daysPerEL);
    
    // Step 4: Apply monthly maximum
    elEarned = Math.min(elEarned, maxELPerMonth);
}
```

### **Carry Forward Calculation**
```javascript
// For each leave type:
carryForwardAmount = previousYearBalance - usedInYear;
if (carryForwardAmount > 0 && carryForwardEnabled) {
    // Apply expiry rules
    if (monthsElapsed > expiryMonths) {
        carryForwardAmount = 0; // Expired
    }
}
```

## 🔄 Auto-Update System

### **Scheduled Updates**
```javascript
// Cron job configuration:
autoUpdate: {
    enabled: true,
    updateFrequency: 'monthly',  // daily, weekly, monthly
    updateDay: 1              // Day of month for monthly updates
}
```

### **Update Process**
1. **Fetch Settings**: Get current EL configuration
2. **Get Employees**: All active employees
3. **Calculate EL**: For each employee based on attendance
4. **Update Balances**: Add earned EL to employee records
5. **Log Results**: Track success/failure rates

## 🎛️ Integration Points

### **With Existing Leave System**
- **Leave Register**: Updated with EL calculations
- **Leave Applications**: EL balance validation
- **Approval Workflow**: EL deduction on approval
- **Leave Balance**: Real-time balance updates

### **With Attendance System**
- **Daily Attendance**: Source data for EL calculations
- **Monthly Summaries**: Attendance aggregation
- **Present/Absent Tracking**: EL eligibility determination

### **With Payroll System**
- **EL Encashment**: Integration with payroll calculations
- **Final Settlement**: EL balance payout on exit
- **Monthly Reports**: EL liability tracking

## 🔐 Security & Permissions

### **Access Control**
- **Settings Management**: HR, Admin roles only
- **EL Calculation**: Employees (self), Managers, HR, Admin
- **Balance Viewing**: Employees (self), Managers, HR, Admin
- **Bulk Updates**: HR, Admin roles only

### **Data Validation**
- **Input Validation**: All API inputs validated
- **Range Checking**: Numeric values within allowed ranges
- **Business Logic**: Consistency checks for settings

## 📱 User Interface Features

### **Settings Page**
- **Tabbed Navigation**: Organized by feature area
- **Real-time Preview**: Test EL calculations before saving
- **Validation Messages**: Immediate feedback on invalid inputs
- **Reset Function**: Emergency defaults restoration

### **EL Balance Display**
- **Current Balance**: Real-time EL availability
- **Carry Forward**: Separate tracking of CF amounts
- **Expiry Tracking**: Visual indicators for expiring balances
- **Calculation History**: Audit trail of EL calculations

## 🧪 Testing & Deployment

### **Unit Testing**
```javascript
// Test EL calculations
describe('Earned Leave Service', () => {
    test('should calculate 1 EL for 20 attendance days', async () => {
        const result = await calculateEarnedLeave(empId, 6, 2024);
        expect(result.elEarned).toBe(1);
    });
});
```

### **Integration Testing**
- **Settings Update**: Verify settings persistence
- **EL Calculation**: Test with various attendance scenarios
- **Carry Forward**: Test expiry calculations
- **API Endpoints**: Test all CRUD operations

### **Deployment Steps**
1. **Database Migration**: Create LeavePolicySettings collection
2. **Settings Setup**: Configure initial policies
3. **Route Registration**: Add new API routes
4. **UI Deployment**: Deploy settings page
5. **Testing**: End-to-end functionality verification
6. **Training**: Admin training on new features

## 📋 Benefits

### **For Organization**
- **Compliance**: Indian Labor Law compliance
- **Flexibility**: Configurable policies per organization needs
- **Automation**: Reduced manual EL calculations
- **Accuracy**: Precise EL tracking and reporting
- **Audit Trail**: Complete history of EL calculations

### **For HR Team**
- **Efficiency**: Automated EL management
- **Control**: Policy configuration without code changes
- **Reporting**: Comprehensive EL analytics
- **Compliance**: Built-in labor law compliance

### **For Employees**
- **Transparency**: Clear EL earning rules
- **Fairness**: Consistent EL application
- **Planning**: Predictable EL accumulation
- **Self-Service**: EL balance visibility

## 🎯 Best Practices

### **Configuration**
- **Start Simple**: Begin with attendance-based rules
- **Test Thoroughly**: Use preview feature before deployment
- **Document Policies**: Clear employee communication
- **Regular Reviews**: Quarterly policy reviews

### **Maintenance**
- **Monitor Calculations**: Regular accuracy checks
- **Backup Settings**: Export settings regularly
- **Update Policies**: Adjust based on organizational needs
- **Compliance Reviews**: Annual legal compliance checks

This implementation provides a **complete, flexible, and compliant Earned Leave system** that can be customized to match any organization's policies while maintaining Indian labor law compliance.
