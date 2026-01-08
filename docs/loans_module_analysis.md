# Loans & Salary Advance Module - Complete Analysis

## Executive Summary

The Loans & Salary Advance module is a comprehensive financial management system that handles employee loan applications, salary advances, approval workflows, disbursement, and repayment tracking. The system supports dynamic workflow configuration, role-based approvals, EMI calculations, and integration with payroll for automatic deductions.

---

## Module Overview

### Purpose

- Enable employees to apply for **loans** (long-term, with EMI) or **salary advances** (short-term, single deduction)
- Manage approval workflows (HOD → HR → Final Authority)
- Track disbursements and repayments
- Integrate with payroll for automatic deductions
- Provide transparency and audit trail

### Key Features

1. **Dual Mode**: Supports both Loans and Salary Advances
2. **Dynamic Workflow**: Configurable approval chains
3. **EMI Calculation**: Automatic EMI computation with interest
4. **Repayment Tracking**: Complete payment history
5. **Role-Based Access**: HOD, HR, Manager, Admin permissions
6. **Eligibility Rules**: Department, designation, service period checks
7. **Early Settlement**: Foreclosure with interest adjustment
8. **Audit Trail**: Complete change history

---

## System Architecture

### Database Models

#### 1. Loan Model (`loans/model/Loan.js`)

**Core Fields:**

```javascript
{
  // Employee Information
  employeeId: ObjectId,           // Reference to Employee
  emp_no: String,                 // Employee number
  
  // Request Details
  requestType: 'loan' | 'salary_advance',
  amount: Number,                 // Requested amount
  purpose: String,                // Reason for loan/advance
  
  // Status
  status: 'draft' | 'pending' | 'hod_approved' | 'hod_rejected' | 
          'hr_approved' | 'hr_rejected' | 'approved' | 'rejected' | 
          'cancelled' | 'disbursed' | 'active' | 'completed',
  
  // Workflow Tracking
  workflow: {
    currentStep: 'employee' | 'hod' | 'hr' | 'final' | 'completed',
    nextApprover: String,         // Role of next approver
    nextApproverRole: String,
    history: [{
      step: String,
      action: 'submitted' | 'approved' | 'rejected' | 'forwarded',
      actionBy: ObjectId,
      actionByName: String,
      actionByRole: String,
      comments: String,
      timestamp: Date
    }]
  },
  
  // Approvals Record
  approvals: {
    hod: {
      status: 'pending' | 'approved' | 'rejected' | 'forwarded',
      approvedBy: ObjectId,
      approvedAt: Date,
      comments: String
    },
    hr: {
      status: 'pending' | 'approved' | 'rejected' | 'forwarded',
      approvedBy: ObjectId,
      approvedAt: Date,
      comments: String
    }
  },
  
  // Loan-Specific Configuration (for loans only)
  loanConfig: {
    emiAmount: Number,            // Monthly EMI
    interestRate: Number,         // Annual interest rate %
    duration: Number,             // Loan duration in months
    startDate: Date,              // EMI start date
    endDate: Date,                // Loan end date
    deductionCycles: Number,      // For salary advance
    deductionPerCycle: Number     // Amount per cycle
  },
  
  // Repayment Tracking
  repayment: {
    totalPaid: Number,            // Amount paid so far
    remainingBalance: Number,     // Outstanding balance
    lastPaymentDate: Date,
    nextPaymentDue: Date,
    payments: [{
      amount: Number,
      paymentDate: Date,
      paymentMethod: 'payroll_deduction' | 'manual' | 'bank_transfer',
      transactionId: String,
      processedBy: ObjectId,
      remarks: String
    }]
  },
  
  // Organizational Context
  department: ObjectId,
  designation: ObjectId,
  division_id: ObjectId,
  
  // Disbursement
  disbursementDate: Date,
  disbursementMethod: 'bank_transfer' | 'cash' | 'cheque',
  disbursementReference: String,
  disbursedBy: ObjectId,
  
  // Change History
  changeHistory: [{
    field: String,
    originalValue: Mixed,
    newValue: Mixed,
    modifiedBy: ObjectId,
    modifiedByName: String,
    modifiedByRole: String,
    modifiedAt: Date,
    reason: String
  }]
}
```

#### 2. LoanSettings Model (`loans/model/LoanSettings.js`)

**Configuration Fields:**

```javascript
{
  // Settings Type
  type: 'loan' | 'salary_advance',
  
  // General Settings
  settings: {
    maxAmount: Number,            // Maximum loan/advance amount
    minAmount: Number,            // Minimum amount
    maxActiveLoans: Number,       // Max concurrent loans per employee
    allowMultipleAdvances: Boolean,
    
    // Eligibility
    eligibleDepartments: [ObjectId],
    eligibleDesignations: [ObjectId],
    minServicePeriod: Number,     // Months
    
    // Notifications
    sendEmailNotifications: Boolean,
    notifyEmployeeOnStatusChange: Boolean,
    
    // Permissions
    workspacePermissions: {
      [workspaceId]: {
        canApplyForSelf: Boolean,
        canApplyForOthers: Boolean
      }
    }
  },
  
  // Workflow Configuration
  workflow: {
    isEnabled: Boolean,
    useDynamicWorkflow: Boolean,
    
    // Approval Steps
    steps: [{
      stepOrder: Number,
      stepName: String,
      approverRole: 'hod' | 'hr' | 'manager' | 'admin',
      approvedStatus: String,
      rejectedStatus: String,
      nextStepOnApprove: Number,
      canSkip: Boolean,
      skipConditions: {
        roles: [String],
        maxAmount: Number
      },
      isActive: Boolean
    }],
    
    // Final Authority
    finalAuthority: {
      role: 'hr' | 'admin' | 'specific_user',
      specificUser: ObjectId,
      requiresApproval: Boolean,
      authorizedHRUsers: [ObjectId]
    }
  },
  
  // Status Configuration
  statuses: [{
    code: String,
    name: String,
    description: String,
    color: String,
    icon: String,
    isActive: Boolean
  }]
}
```

---

## Complete Workflow

### Application Lifecycle

```
1. Employee Applies
   ↓
2. HOD Review (if configured)
   ├─ Approve → Forward to HR
   ├─ Reject → Application Rejected
   └─ Forward → Skip to HR
   ↓
3. HR Review
   ├─ Approve → Forward to Final Authority
   ├─ Reject → Application Rejected
   └─ Forward → Skip to Final
   ↓
4. Final Authority Approval
   ├─ Approve → Status: Approved
   └─ Reject → Application Rejected
   ↓
5. Disbursement (HR/Admin)
   ↓
6. Active Loan/Advance
   ↓
7. Repayment (Payroll Deduction)
   ↓
8. Completed
```

### Detailed Step-by-Step Process

#### Step 1: Employee Application

**Endpoint:** `POST /api/loans`

**Process:**

1. Employee fills application form
2. System validates:
   - Eligibility (department, designation, service period)
   - Amount limits (min/max)
   - Existing active loans
3. Creates loan record with status `draft` or `pending`
4. Initializes workflow based on settings
5. Determines next approver (HOD or HR)

**Code Flow:**

```javascript
// loanController.js - applyLoan()
const loan = new Loan({
  employeeId: employee._id,
  emp_no: employee.emp_no,
  requestType: req.body.requestType,
  amount: req.body.amount,
  purpose: req.body.purpose,
  status: 'pending',
  workflow: {
    currentStep: 'hod',
    nextApprover: 'hod',
    nextApproverRole: 'hod',
    history: [{
      step: 'employee',
      action: 'submitted',
      actionBy: req.user._id,
      timestamp: new Date()
    }]
  }
});

// Calculate EMI for loans
if (requestType === 'loan') {
  const emiAmount = calculateEMI(
    amount,
    interestRate,
    duration
  );
  loan.loanConfig.emiAmount = emiAmount;
}

await loan.save();
```

#### Step 2: HOD Approval

**Endpoint:** `PUT /api/loans/:id/action`

**Process:**

1. HOD receives notification
2. Reviews application details
3. Takes action:
   - **Approve**: Forwards to HR
   - **Reject**: Application rejected
   - **Forward**: Skips HOD, goes to HR
4. System updates workflow
5. Notifies next approver

**Code Flow:**

```javascript
// loanController.js - processLoanAction()
if (userRole === 'hod') {
  loan.approvals.hod = {
    status: action, // 'approved' | 'rejected' | 'forwarded'
    approvedBy: req.user._id,
    approvedAt: new Date(),
    comments: req.body.comments
  };
  
  if (action === 'approved' || action === 'forwarded') {
    loan.workflow.currentStep = 'hr';
    loan.workflow.nextApprover = 'hr';
    loan.status = 'hod_approved';
  } else {
    loan.status = 'hod_rejected';
  }
}
```

#### Step 3: HR Approval

**Endpoint:** `PUT /api/loans/:id/action`

**Process:**

1. HR receives notification
2. Reviews application + HOD comments
3. Takes action:
   - **Approve**: Forwards to Final Authority
   - **Reject**: Application rejected
4. System updates workflow

**Code Flow:**

```javascript
if (userRole === 'hr') {
  loan.approvals.hr = {
    status: action,
    approvedBy: req.user._id,
    approvedAt: new Date(),
    comments: req.body.comments
  };
  
  if (action === 'approved') {
    loan.workflow.currentStep = 'final';
    loan.status = 'hr_approved';
  } else {
    loan.status = 'hr_rejected';
  }
}
```

#### Step 4: Final Approval

**Endpoint:** `PUT /api/loans/:id/action`

**Process:**

1. Final Authority (HR/Admin) reviews
2. Takes action:
   - **Approve**: Status = `approved`
   - **Reject**: Status = `rejected`
3. If approved, ready for disbursement

#### Step 5: Disbursement

**Endpoint:** `PUT /api/loans/:id/disburse`

**Process:**

1. HR/Admin marks loan as disbursed
2. Records disbursement details:
   - Date
   - Method (bank transfer, cash, cheque)
   - Reference number
3. Status changes to `disbursed` → `active`
4. Repayment tracking begins

**Code Flow:**

```javascript
// loanController.js - disburseLoan()
loan.status = 'disbursed';
loan.disbursementDate = req.body.disbursementDate || new Date();
loan.disbursementMethod = req.body.disbursementMethod;
loan.disbursementReference = req.body.disbursementReference;
loan.disbursedBy = req.user._id;

// Initialize repayment
loan.repayment.remainingBalance = loan.amount;

if (loan.requestType === 'loan') {
  loan.repayment.nextPaymentDue = calculateNextPaymentDate(
    loan.loanConfig.startDate
  );
}

await loan.save();
```

#### Step 6: Repayment

**Endpoints:**

- `POST /api/loans/:id/pay-emi` (for loans)
- `POST /api/loans/:id/pay-advance` (for salary advances)

**Process:**

1. Payroll system triggers deduction
2. System records payment:
   - Amount
   - Date
   - Method (usually `payroll_deduction`)
3. Updates balances:
   - `totalPaid` increases
   - `remainingBalance` decreases
4. If balance = 0, status = `completed`

**Code Flow:**

```javascript
// loanController.js - payEMI()
const payment = {
  amount: req.body.amount,
  paymentDate: req.body.paymentDate || new Date(),
  paymentMethod: req.body.paymentMethod || 'payroll_deduction',
  processedBy: req.user._id,
  remarks: req.body.remarks
};

loan.repayment.payments.push(payment);
loan.repayment.totalPaid += payment.amount;
loan.repayment.remainingBalance -= payment.amount;
loan.repayment.lastPaymentDate = payment.paymentDate;

if (loan.repayment.remainingBalance <= 0) {
  loan.status = 'completed';
  loan.workflow.currentStep = 'completed';
}

await loan.save();
```

---

## Key Features Explained

### 1. Dynamic Workflow Configuration

The system allows administrators to configure custom approval workflows:

**Example Workflow:**

```javascript
{
  steps: [
    {
      stepOrder: 1,
      stepName: 'HOD Approval',
      approverRole: 'hod',
      approvedStatus: 'hod_approved',
      rejectedStatus: 'hod_rejected',
      nextStepOnApprove: 2,
      canSkip: true,
      skipConditions: {
        maxAmount: 5000  // Skip HOD if amount < 5000
      }
    },
    {
      stepOrder: 2,
      stepName: 'HR Approval',
      approverRole: 'hr',
      approvedStatus: 'hr_approved',
      rejectedStatus: 'hr_rejected',
      nextStepOnApprove: 3
    },
    {
      stepOrder: 3,
      stepName: 'Final Approval',
      approverRole: 'admin',
      approvedStatus: 'approved',
      rejectedStatus: 'rejected',
      nextStepOnApprove: null  // Final step
    }
  ]
}
```

### 2. EMI Calculation

For loans, the system automatically calculates EMI using the formula:

```javascript
function calculateEMI(principal, annualRate, durationMonths) {
  const monthlyRate = annualRate / 12 / 100;
  
  if (monthlyRate === 0) {
    return principal / durationMonths;
  }
  
  const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, durationMonths)) / 
              (Math.pow(1 + monthlyRate, durationMonths) - 1);
  
  return Math.round(emi * 100) / 100;
}
```

**Example:**

- Principal: ₹100,000
- Interest Rate: 10% per annum
- Duration: 12 months
- **EMI: ₹8,791.59**

### 3. Early Settlement

Employees can settle loans early with adjusted interest:

```javascript
function calculateEarlySettlement(loan, settlementDate) {
  const totalPaid = loan.repayment.totalPaid;
  const principal = loan.amount;
  const monthlyRate = loan.loanConfig.interestRate / 12 / 100;
  
  // Calculate months elapsed
  const monthsElapsed = calculateMonthsElapsed(
    loan.loanConfig.startDate,
    settlementDate
  );
  
  // Calculate interest for elapsed period
  const interestForPeriod = principal * monthlyRate * monthsElapsed;
  
  // Settlement amount = Principal + Interest - Paid
  const settlementAmount = principal + interestForPeriod - totalPaid;
  
  return {
    settlementAmount,
    interestSaved: calculateInterestSaved(loan, monthsElapsed),
    totalInterest: interestForPeriod
  };
}
```

### 4. Eligibility Checks

Before allowing application, system checks:

```javascript
// Check service period
const tenureMonths = calculateTenure(employee.joining_date);
if (tenureMonths < settings.minServicePeriod) {
  return res.status(400).json({
    success: false,
    message: `Minimum service period of ${settings.minServicePeriod} months required`
  });
}

// Check department eligibility
if (settings.eligibleDepartments.length > 0) {
  if (!settings.eligibleDepartments.includes(employee.department_id)) {
    return res.status(400).json({
      success: false,
      message: 'Your department is not eligible for this loan type'
    });
  }
}

// Check active loans
const activeLoans = await Loan.countDocuments({
  employeeId: employee._id,
  status: { $in: ['active', 'disbursed'] }
});

if (activeLoans >= settings.maxActiveLoans) {
  return res.status(400).json({
    success: false,
    message: `Maximum ${settings.maxActiveLoans} active loans allowed`
  });
}
```

### 5. Role-Based Pending Approvals

Each role sees only relevant pending approvals:

```javascript
// loanController.js - getPendingApprovals()
async getPendingApprovals(req, res) {
  const userRole = req.user.role;
  let filter = {};
  
  if (userRole === 'hod') {
    // HOD sees loans pending at HOD step in their department
    filter = {
      'workflow.nextApprover': 'hod',
      department: req.user.department_id,
      status: 'pending'
    };
  } else if (userRole === 'hr') {
    // HR sees loans pending at HR step
    filter = {
      'workflow.nextApprover': 'hr',
      status: { $in: ['hod_approved', 'pending'] }
    };
  } else if (['sub_admin', 'super_admin'].includes(userRole)) {
    // Admins see all pending final approvals
    filter = {
      'workflow.currentStep': 'final',
      status: 'hr_approved'
    };
  }
  
  const pendingLoans = await Loan.find(filter)
    .populate('employeeId')
    .sort({ createdAt: -1 });
  
  res.json({ success: true, data: pendingLoans });
}
```

---

## Integration with Payroll

The module integrates with the payroll system for automatic deductions:

### Payroll Service Integration

```javascript
// payroll/services/loanAdvanceService.js

class LoanAdvanceService {
  async getActiveLoansForEmployee(employeeId, payrollMonth) {
    return await Loan.find({
      employeeId,
      status: { $in: ['active', 'disbursed'] },
      'repayment.remainingBalance': { $gt: 0 }
    });
  }
  
  async calculateDeductions(employeeId, payrollMonth) {
    const activeLoans = await this.getActiveLoansForEmployee(
      employeeId,
      payrollMonth
    );
    
    let totalDeduction = 0;
    const deductions = [];
    
    for (const loan of activeLoans) {
      let deductionAmount = 0;
      
      if (loan.requestType === 'loan') {
        // EMI deduction
        deductionAmount = loan.loanConfig.emiAmount;
      } else {
        // Salary advance deduction
        deductionAmount = loan.loanConfig.deductionPerCycle;
      }
      
      // Don't deduct more than remaining balance
      deductionAmount = Math.min(
        deductionAmount,
        loan.repayment.remainingBalance
      );
      
      totalDeduction += deductionAmount;
      
      deductions.push({
        loanId: loan._id,
        type: loan.requestType,
        amount: deductionAmount,
        description: `${loan.requestType} - ${loan.purpose}`
      });
    }
    
    return {
      totalDeduction,
      deductions
    };
  }
  
  async recordPayrollDeduction(loanId, amount, payrollMonth) {
    const loan = await Loan.findById(loanId);
    
    const payment = {
      amount,
      paymentDate: new Date(),
      paymentMethod: 'payroll_deduction',
      transactionId: `PAYROLL_${payrollMonth}`,
      remarks: `Deduction for ${payrollMonth}`
    };
    
    loan.repayment.payments.push(payment);
    loan.repayment.totalPaid += amount;
    loan.repayment.remainingBalance -= amount;
    loan.repayment.lastPaymentDate = new Date();
    
    if (loan.repayment.remainingBalance <= 0) {
      loan.status = 'completed';
      loan.workflow.currentStep = 'completed';
    }
    
    await loan.save();
    
    return loan;
  }
}
```

---

## Frontend Implementation

### Main Page Structure

**Location:** `frontend/src/app/(workspace)/loans/page.tsx`

**Features:**

1. **Application Form**
   - Loan type selection (Loan/Salary Advance)
   - Amount input with validation
   - Purpose/reason
   - Duration selection (for loans)

2. **My Loans Tab**
   - List of employee's loans
   - Status badges
   - Action buttons (Cancel, View Details)

3. **Pending Approvals Tab** (for HOD/HR/Admin)
   - Loans awaiting approval
   - Quick approve/reject
   - Comments section

4. **All Loans Tab** (for HR/Admin)
   - Complete loan list
   - Filters (status, type, department)
   - Bulk actions

5. **Loan Details Dialog**
   - Complete loan information
   - Workflow timeline
   - Repayment schedule
   - Transaction history

---

## API Endpoints Summary

### Loan Operations

- `GET /api/loans` - Get all loans (filtered)
- `GET /api/loans/my` - Get my loans
- `GET /api/loans/:id` - Get single loan
- `POST /api/loans` - Apply for loan/advance
- `PUT /api/loans/:id` - Update loan application
- `PUT /api/loans/:id/cancel` - Cancel loan

### Approval Workflow

- `GET /api/loans/pending-approvals` - Get pending approvals
- `PUT /api/loans/:id/action` - Approve/Reject/Forward

### Disbursement & Repayment

- `PUT /api/loans/:id/disburse` - Mark as disbursed
- `POST /api/loans/:id/pay-emi` - Record EMI payment
- `POST /api/loans/:id/pay-advance` - Record advance deduction
- `GET /api/loans/:id/transactions` - Get payment history
- `GET /api/loans/:id/settlement-preview` - Get early settlement details

### Settings

- `GET /api/loans/settings/:type` - Get settings
- `POST /api/loans/settings/:type` - Save settings
- `GET /api/loans/settings/:type/workflow` - Get workflow config
- `PUT /api/loans/settings/:type/workflow` - Update workflow

---

## Security & Permissions

### Role-Based Access Control

| Role | Permissions |
|------|-------------|
| **Employee** | Apply for loan, View own loans, Cancel own pending loans |
| **HOD** | All employee permissions + Approve/Reject loans in department |
| **HR** | All HOD permissions + Approve/Reject all loans, Disburse loans, Record payments |
| **Manager** | Similar to HR, scope-based access |
| **Sub Admin** | All HR permissions + Configure settings |
| **Super Admin** | Full access to all features |

### Data Scope Filtering

The system uses `applyScopeFilter` middleware to ensure users only see loans within their scope:

```javascript
// For HOD: Only loans in their department
// For Manager: Only loans for employees in their scope
// For HR/Admin: All loans
```

---

## Audit Trail & Change Tracking

Every loan maintains a complete audit trail:

### Workflow History

```javascript
workflow.history: [
  {
    step: 'employee',
    action: 'submitted',
    actionBy: '507f1f77bcf86cd799439011',
    actionByName: 'John Doe',
    actionByRole: 'employee',
    timestamp: '2024-01-15T10:30:00Z'
  },
  {
    step: 'hod',
    action: 'approved',
    actionBy: '507f1f77bcf86cd799439012',
    actionByName: 'Jane Smith',
    actionByRole: 'hod',
    comments: 'Approved for genuine need',
    timestamp: '2024-01-16T14:20:00Z'
  }
]
```

### Change History

```javascript
changeHistory: [
  {
    field: 'amount',
    originalValue: 50000,
    newValue: 45000,
    modifiedBy: '507f1f77bcf86cd799439012',
    modifiedByName: 'Jane Smith',
    modifiedByRole: 'hod',
    modifiedAt: '2024-01-16T14:20:00Z',
    reason: 'Reduced as per policy'
  }
]
```

---

## Summary

The Loans & Salary Advance module is a **complete, production-ready system** that handles:

✅ **Application Management**

- Employee self-service application
- Eligibility validation
- Amount limits enforcement

✅ **Workflow Automation**

- Dynamic approval chains
- Role-based routing
- Skip conditions
- Email notifications

✅ **Financial Calculations**

- EMI computation
- Interest calculation
- Early settlement
- Repayment tracking

✅ **Integration**

- Payroll system integration
- Automatic deductions
- Transaction recording

✅ **Transparency**

- Complete audit trail
- Workflow history
- Change tracking
- Transaction history

✅ **Security**

- Role-based access control
- Data scope filtering
- Permission management

The module is well-architected, follows best practices, and provides a comprehensive solution for managing employee loans and salary advances.
