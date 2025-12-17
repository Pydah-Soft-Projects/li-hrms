# Arrears Management Module

## Overview

The Arrears Management Module handles employee arrears (outstanding salary payments) with a complete approval workflow and payroll integration. Arrears can be created, approved through multiple levels (HOD → HR → Admin), and settled during payroll processing.

## Features

### 1. Arrears Request Management
- Create arrears requests with monthly amount and date range
- Automatic calculation of total amount based on monthly amount and months
- Track reason for arrears claim
- Support for partial settlements

### 2. Multi-Level Approval Workflow
- **HOD Approval**: Department head approves the arrears request
- **HR Approval**: HR department reviews and approves
- **Admin Approval**: Final approval with optional amount modification
- Each approval level includes comments and timestamp tracking

### 3. Settlement Tracking
- Track settlement history for each arrears request
- Support for partial settlements across multiple payroll cycles
- Remaining amount automatically calculated
- Link settlements to specific payroll records

### 4. Payroll Integration
- Arrears displayed in payroll form before processing
- Option to split arrears amount during payroll processing
- Automatic settlement processing when payroll is finalized
- Arrears added as earning component in payroll

## API Endpoints

### Create Arrears Request
```
POST /api/arrears
Authorization: Bearer {token}
Content-Type: application/json

{
  "employee": "employee_id",
  "startMonth": "2024-01",
  "endMonth": "2024-03",
  "monthlyAmount": 5000,
  "totalAmount": 15000,
  "reason": "Salary adjustment for previous period"
}
```

### Get All Arrears
```
GET /api/arrears?employee={employeeId}&status={status}&department={departmentId}
Authorization: Bearer {token}
```

### Get Employee's Pending Arrears
```
GET /api/arrears/employee/{employeeId}/pending
Authorization: Bearer {token}
```

### Get Arrears Details
```
GET /api/arrears/{arrearsId}
Authorization: Bearer {token}
```

### Submit for HOD Approval
```
PUT /api/arrears/{arrearsId}/submit-hod
Authorization: Bearer {token}
```

### HOD Approval
```
PUT /api/arrears/{arrearsId}/hod-approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "approved": true,
  "comments": "Approved by HOD"
}
```

### HR Approval
```
PUT /api/arrears/{arrearsId}/hr-approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "approved": true,
  "comments": "Approved by HR"
}
```

### Admin Approval (Final)
```
PUT /api/arrears/{arrearsId}/admin-approve
Authorization: Bearer {token}
Content-Type: application/json

{
  "approved": true,
  "modifiedAmount": 14000,
  "comments": "Approved with modification"
}
```

### Process Settlement
```
POST /api/arrears/settle
Authorization: Bearer {token}
Content-Type: application/json

{
  "employeeId": "employee_id",
  "month": "2024-03",
  "settlements": [
    {
      "arrearId": "arrear_id",
      "amount": 7500
    }
  ],
  "payrollId": "payroll_id"
}
```

### Cancel Arrears
```
PUT /api/arrears/{arrearsId}/cancel
Authorization: Bearer {token}
```

### Get Arrears Statistics
```
GET /api/arrears/stats/summary?department={departmentId}
Authorization: Bearer {token}
```

## Data Model

### ArrearsRequest Schema

```javascript
{
  employee: ObjectId,           // Reference to Employee
  startMonth: String,           // YYYY-MM format
  endMonth: String,             // YYYY-MM format
  monthlyAmount: Number,        // Amount per month
  totalAmount: Number,          // Total calculated amount
  remainingAmount: Number,      // Amount yet to be settled
  reason: String,               // Reason for arrears
  status: String,               // draft, pending_hod, pending_hr, pending_admin, approved, rejected, partially_settled, settled, cancelled
  
  // Approval tracking
  hodApproval: {
    approved: Boolean,
    approvedBy: ObjectId,       // Reference to User
    approvedAt: Date,
    comments: String
  },
  hrApproval: {
    approved: Boolean,
    approvedBy: ObjectId,
    approvedAt: Date,
    comments: String
  },
  adminApproval: {
    approved: Boolean,
    approvedBy: ObjectId,
    approvedAt: Date,
    modifiedAmount: Number,     // If admin modifies the amount
    comments: String
  },
  
  // Settlement history
  settlementHistory: [
    {
      month: String,            // YYYY-MM
      amount: Number,
      settledAt: Date,
      settledBy: ObjectId,      // Reference to User
      payrollId: ObjectId       // Reference to PayrollRecord
    }
  ],
  
  createdBy: ObjectId,          // Reference to User
  updatedBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

## Workflow

### 1. Creation Phase
- HR/Admin creates arrears request in draft status
- System validates employee, months, and amounts
- Total amount auto-calculated from monthly amount × number of months

### 2. Submission Phase
- Creator submits arrears for HOD approval
- Status changes from draft to pending_hod

### 3. HOD Approval Phase
- HOD reviews and approves/rejects
- If approved: status → pending_hr
- If rejected: status → rejected

### 4. HR Approval Phase
- HR reviews and approves/rejects
- If approved: status → pending_admin
- If rejected: status → rejected

### 5. Admin Approval Phase (Final)
- Admin reviews and approves/rejects
- Admin can modify the total amount if needed
- If approved: status → approved, remainingAmount set to approved amount
- If rejected: status → rejected

### 6. Settlement Phase
- During payroll processing, HR can settle arrears
- Can settle full or partial amount
- Remaining amount carried forward to next payroll
- Status changes to partially_settled or settled

## Authorization

### Role-Based Access Control

| Operation | Required Role |
|-----------|--------------|
| Create Arrears | HR, Sub Admin, Super Admin |
| Submit for HOD | Creator or Admin |
| HOD Approve | HOD, Sub Admin, Super Admin |
| HR Approve | HR, Sub Admin, Super Admin |
| Admin Approve | Sub Admin, Super Admin |
| Process Settlement | HR, Sub Admin, Super Admin |
| View Arrears | All authenticated users |

### Edit Restrictions

- Only draft arrears can be edited
- After admin approval, no editing allowed
- Only splitting is allowed during payroll processing
- Settled arrears cannot be modified

## Integration with Payroll

### During Payroll Calculation

1. System fetches pending arrears for employee
2. Displays arrears in payroll form
3. HR can choose to settle full or partial amount
4. Arrears added as earning component

### After Payroll Processing

1. Settlement records created for each arrear
2. Remaining amount updated
3. Status updated to partially_settled or settled
4. Payroll record linked to settlement

## Frontend Components

### ArrearsDialog
- Display pending arrears for settlement
- Allow HR to specify settlement amounts
- Show settlement history

### ArrearsForm
- Create new arrears request
- Auto-calculate total amount
- Validate month ranges and amounts

### ArrearsDetailDialog
- Show complete arrears details
- Display approval timeline
- Show settlement history
- Track all modifications

### ArrearsReport
- List all arrears with filters
- Show statistics (pending, settled, rejected)
- Tab-based view for different statuses

## Usage Examples

### Creating Arrears Request

```javascript
const response = await fetch('/api/arrears', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    employee: '507f1f77bcf86cd799439011',
    startMonth: '2024-01',
    endMonth: '2024-03',
    monthlyAmount: 5000,
    totalAmount: 15000,
    reason: 'Salary adjustment for previous period'
  })
});
```

### Processing Settlement

```javascript
const response = await fetch('/api/arrears/settle', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    employeeId: '507f1f77bcf86cd799439011',
    month: '2024-03',
    settlements: [
      {
        arrearId: '507f1f77bcf86cd799439012',
        amount: 7500
      }
    ],
    payrollId: '507f1f77bcf86cd799439013'
  })
});
```

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Employee not found | Invalid employee ID | Verify employee ID exists |
| Invalid month format | Month not in YYYY-MM format | Use correct format |
| Start month after end month | Invalid date range | Ensure start ≤ end |
| Total amount mismatch | Calculation error | Verify monthly amount × months |
| Arrears not approved | Cannot settle unapproved arrears | Complete approval workflow first |
| Settlement amount exceeds remaining | Invalid settlement amount | Reduce settlement amount |

## Best Practices

1. **Validation**: Always validate month ranges and amounts before submission
2. **Approval**: Ensure all approval levels are completed before settlement
3. **Documentation**: Add clear reasons for arrears claims
4. **Tracking**: Monitor settlement history for reconciliation
5. **Modification**: Use admin modification feature for adjustments, not repeated rejections
6. **Partial Settlement**: Use partial settlements to spread payments across months if needed

## Future Enhancements

1. **Bulk Operations**: Create multiple arrears requests at once
2. **Recurring Arrears**: Support for recurring arrears patterns
3. **Notifications**: Email notifications at each approval stage
4. **Reports**: Detailed arrears reconciliation reports
5. **Audit Trail**: Enhanced audit logging for compliance
6. **Integration**: Integration with external accounting systems

## Support

For issues or questions regarding the Arrears Management Module, please contact the HR department or system administrator.
