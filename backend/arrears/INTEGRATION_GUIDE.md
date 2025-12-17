# Arrears Module Integration Guide

## Overview

This guide explains how to integrate the Arrears Management Module with the existing HRMS system, particularly with the Payroll module.

## Backend Integration

### 1. Database Setup

The ArrearsRequest model is automatically created by MongoDB when the first document is inserted. No manual migration is required.

### 2. Server Configuration

The arrears routes are already mounted in `server.js`:

```javascript
const arrearsRoutes = require('./arrears/index.js');
app.use('/api/arrears', arrearsRoutes);
```

### 3. Payroll Integration

#### Adding Arrears to Payroll Calculation

In the payroll calculation service, arrears are integrated as follows:

```javascript
const ArrearsIntegrationService = require('./arrearsIntegrationService');

// During payroll calculation
const arrearsComponent = await ArrearsIntegrationService.getArrearsForPayroll(employeeId);

// Add to payroll display
if (arrearsComponent) {
  payrollData.pendingArrears = arrearsComponent;
}
```

#### Processing Arrears Settlement

After payroll is calculated and before saving:

```javascript
// Process settlements
if (req.body.arrearsSettlements && req.body.arrearsSettlements.length > 0) {
  const payrollRecord = await payrollCalculationService.calculatePayroll(
    employeeId,
    month,
    req.user._id
  );
  
  // Add arrears to payroll
  const updatedPayroll = await ArrearsIntegrationService.addArrearsToPayroll(
    payrollRecord,
    req.body.arrearsSettlements,
    employeeId
  );
  
  // Save payroll
  await updatedPayroll.save();
  
  // Process settlements
  await ArrearsIntegrationService.processArrearsSettlements(
    employeeId,
    month,
    req.body.arrearsSettlements,
    req.user._id,
    updatedPayroll._id
  );
}
```

## Frontend Integration

### 1. Payroll Form Integration

Add arrears dialog to payroll form:

```jsx
import { ArrearsDialog } from '@/components/Arrears';

function PayrollForm() {
  const [arrearsDialogOpen, setArrearsDialogOpen] = useState(false);
  const [arrearsSettlements, setArrearsSettlements] = useState([]);

  return (
    <>
      {/* Existing payroll form fields */}
      
      {/* Arrears Section */}
      <Box sx={{ mt: 3, p: 2, backgroundColor: '#f9f9f9', borderRadius: 1 }}>
        <Typography variant="h6" gutterBottom>
          Arrears Settlement
        </Typography>
        <Button 
          variant="outlined" 
          onClick={() => setArrearsDialogOpen(true)}
        >
          Process Arrears
        </Button>
      </Box>

      {/* Arrears Dialog */}
      <ArrearsDialog
        open={arrearsDialogOpen}
        onClose={() => setArrearsDialogOpen(false)}
        employeeId={employeeId}
        month={month}
        onSave={(settlements) => {
          setArrearsSettlements(settlements);
          setArrearsDialogOpen(false);
        }}
      />
    </>
  );
}
```

### 2. Employee Profile Integration

Add arrears report to employee profile:

```jsx
import { ArrearsReport } from '@/components/Arrears';

function EmployeeProfile({ employeeId }) {
  return (
    <Box>
      {/* Existing profile sections */}
      
      {/* Arrears Section */}
      <Box sx={{ mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Arrears History
        </Typography>
        <ArrearsReport employeeId={employeeId} />
      </Box>
    </Box>
  );
}
```

### 3. HR Dashboard Integration

Add arrears management to HR dashboard:

```jsx
import { ArrearsForm } from '@/components/Arrears';

function HRDashboard() {
  const [arrearsFormOpen, setArrearsFormOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  const handleCreateArrears = async (data) => {
    const response = await fetch('/api/arrears', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      // Show success message
      // Refresh arrears list
    }
  };

  return (
    <>
      <Button 
        variant="contained" 
        onClick={() => setArrearsFormOpen(true)}
      >
        Create Arrears
      </Button>

      <ArrearsForm
        open={arrearsFormOpen}
        onClose={() => setArrearsFormOpen(false)}
        onSubmit={handleCreateArrears}
        employees={employees}
      />
    </>
  );
}
```

## API Integration Examples

### Creating Arrears Request

```javascript
async function createArrears(data) {
  const response = await fetch('/api/arrears', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employee: data.employeeId,
      startMonth: data.startMonth,
      endMonth: data.endMonth,
      monthlyAmount: data.monthlyAmount,
      totalAmount: data.totalAmount,
      reason: data.reason
    })
  });

  if (!response.ok) {
    throw new Error('Failed to create arrears');
  }

  return response.json();
}
```

### Fetching Pending Arrears

```javascript
async function getPendingArrears(employeeId) {
  const response = await fetch(`/api/arrears/employee/${employeeId}/pending`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch pending arrears');
  }

  return response.json();
}
```

### Approving Arrears

```javascript
async function approveArrears(arrearsId, level, approved, comments) {
  const endpoint = {
    hod: `/api/arrears/${arrearsId}/hod-approve`,
    hr: `/api/arrears/${arrearsId}/hr-approve`,
    admin: `/api/arrears/${arrearsId}/admin-approve`
  }[level];

  const response = await fetch(endpoint, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      approved,
      comments,
      ...(level === 'admin' && { modifiedAmount: null })
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to approve arrears at ${level} level`);
  }

  return response.json();
}
```

### Processing Settlement

```javascript
async function processSettlement(employeeId, month, settlements, payrollId) {
  const response = await fetch('/api/arrears/settle', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      employeeId,
      month,
      settlements,
      payrollId
    })
  });

  if (!response.ok) {
    throw new Error('Failed to process settlement');
  }

  return response.json();
}
```

## Database Queries

### Get All Pending Arrears

```javascript
db.arrearsrequests.find({
  status: { $in: ['approved', 'partially_settled'] },
  remainingAmount: { $gt: 0 }
})
```

### Get Arrears by Employee

```javascript
db.arrearsrequests.find({
  employee: ObjectId('employee_id'),
  status: { $in: ['approved', 'partially_settled', 'settled'] }
})
```

### Get Arrears Statistics

```javascript
db.arrearsrequests.aggregate([
  {
    $group: {
      _id: '$status',
      count: { $sum: 1 },
      totalAmount: { $sum: '$totalAmount' },
      remainingAmount: { $sum: '$remainingAmount' }
    }
  }
])
```

## Testing

### Unit Tests

```javascript
describe('ArrearsService', () => {
  describe('createArrearsRequest', () => {
    it('should create arrears with valid data', async () => {
      const data = {
        employee: employeeId,
        startMonth: '2024-01',
        endMonth: '2024-03',
        monthlyAmount: 5000,
        totalAmount: 15000,
        reason: 'Test arrears'
      };

      const result = await ArrearsService.createArrearsRequest(data, userId);
      expect(result).toBeDefined();
      expect(result.status).toBe('draft');
      expect(result.remainingAmount).toBe(15000);
    });
  });

  describe('hodApprove', () => {
    it('should approve arrears at HOD level', async () => {
      const result = await ArrearsService.hodApprove(
        arrearsId,
        true,
        'Approved',
        userId
      );
      expect(result.status).toBe('pending_hr');
      expect(result.hodApproval.approved).toBe(true);
    });
  });
});
```

### Integration Tests

```javascript
describe('Arrears Payroll Integration', () => {
  it('should add arrears to payroll', async () => {
    const payrollRecord = { /* ... */ };
    const settlements = [{ arrearId, amount: 5000 }];

    const updated = await ArrearsIntegrationService.addArrearsToPayroll(
      payrollRecord,
      settlements,
      employeeId
    );

    expect(updated.arrearsAmount).toBe(5000);
    expect(updated.earnings.allowances).toContainEqual(
      expect.objectContaining({ type: 'arrears' })
    );
  });
});
```

## Troubleshooting

### Issue: Arrears not appearing in payroll

**Solution**: 
1. Verify arrears status is 'approved' or 'partially_settled'
2. Check remainingAmount > 0
3. Ensure employee ID matches

### Issue: Settlement not processing

**Solution**:
1. Verify payroll record is saved before settlement
2. Check settlement amounts don't exceed remaining amount
3. Ensure user has proper authorization

### Issue: Approval workflow stuck

**Solution**:
1. Check user roles and permissions
2. Verify arrears status is correct for current step
3. Review error logs for specific issues

## Performance Optimization

### Indexing

Ensure these indexes exist for optimal performance:

```javascript
db.arrearsrequests.createIndex({ employee: 1, status: 1 });
db.arrearsrequests.createIndex({ status: 1 });
db.arrearsrequests.createIndex({ 'settlementHistory.payrollId': 1 });
db.arrearsrequests.createIndex({ createdAt: -1 });
```

### Query Optimization

Use lean() for read-only queries:

```javascript
const arrears = await ArrearsRequest.find(query).lean();
```

Use select() to limit fields:

```javascript
const arrears = await ArrearsRequest.find(query)
  .select('employee status totalAmount remainingAmount')
  .lean();
```

## Monitoring

### Key Metrics to Track

1. **Pending Arrears**: Count and total amount
2. **Settlement Rate**: Percentage of arrears settled
3. **Approval Time**: Average time for each approval level
4. **Error Rate**: Failed settlements or approvals

### Logging

All arrears operations are logged with:
- Operation type
- User ID
- Timestamp
- Status change
- Amount modifications

## Migration from Legacy System

If migrating from a legacy system:

1. **Data Import**: Create script to import existing arrears
2. **Status Mapping**: Map legacy statuses to new statuses
3. **Validation**: Verify all imported data
4. **Testing**: Test complete workflow with imported data

## Support and Maintenance

### Regular Tasks

1. **Monthly Reconciliation**: Verify settled amounts match payroll
2. **Audit Trail Review**: Check for unauthorized modifications
3. **Performance Monitoring**: Monitor query performance
4. **Backup**: Regular database backups

### Escalation Path

1. **Level 1**: HR Department
2. **Level 2**: System Administrator
3. **Level 3**: Development Team

## Conclusion

The Arrears Management Module is fully integrated with the HRMS system. Follow this guide for proper implementation and maintenance.
