const {
    formatEmployeeLabel,
    buildMissingPayrollApprovalMessage,
    createMissingPayrollApprovalError,
} = require('../payrollBatchValidationMessages');

describe('payrollBatchValidationMessages', () => {
    test('formatEmployeeLabel combines emp_no and name', () => {
        expect(formatEmployeeLabel({ emp_no: 'E001', employee_name: 'Jane Doe' })).toBe(
            'E001 - Jane Doe'
        );
    });

    test('buildMissingPayrollApprovalMessage lists employees', () => {
        const msg = buildMissingPayrollApprovalMessage([
            { emp_no: 'B002', employee_name: 'Bob' },
            { emp_no: 'A001', employee_name: 'Alice' },
        ]);
        expect(msg).toContain('payroll not calculated for:');
        expect(msg).toContain('B002 - Bob');
        expect(msg).toContain('A001 - Alice');
    });

    test('createMissingPayrollApprovalError sets code and details', () => {
        const details = [{ employeeId: 'id1', emp_no: 'X1', employee_name: 'Test' }];
        const err = createMissingPayrollApprovalError(details);
        expect(err.code).toBe('MISSING_PAYROLL');
        expect(err.missingEmployees).toEqual(details);
        expect(err.message).toMatch(/X1 - Test/);
    });
});
