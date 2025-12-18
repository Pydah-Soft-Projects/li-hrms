# Running Tests for "Based on Present Days" Feature

## Prerequisites

1. Install Jest (if not already installed):
```bash
cd backend
npm install
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests in Watch Mode (Auto-rerun on file changes)
```bash
npm run test:watch
```

### Run Tests with Coverage Report
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
# Allowance Service Tests
npx jest payroll/services/__tests__/allowanceService.test.js

# Deduction Service Tests
npx jest payroll/services/__tests__/deductionService.test.js

# Merge Logic Tests
npx jest payroll/services/__tests__/allowanceDeductionResolverService.test.js

# Integration Tests
npx jest payroll/services/__tests__/payrollCalculation.integration.test.js
```

### Run Tests with Verbose Output
```bash
npx jest --verbose
```

## Test Coverage

The tests cover the following scenarios:

### 1. Allowance Service Tests (13 tests)
- ✅ Fixed allowance without proration
- ✅ Fixed allowance with proration
- ✅ Full month attendance
- ✅ Zero present days
- ✅ No attendance data provided
- ✅ Percentage-based allowances (proration ignored)
- ✅ Min/max constraints after proration
- ✅ Decimal results and rounding
- ✅ Null rule handling
- ✅ Missing attendance data fields

### 2. Deduction Service Tests (12 tests)
- ✅ Fixed deduction without proration
- ✅ Fixed deduction with proration
- ✅ Full month attendance
- ✅ Zero present days
- ✅ No attendance data provided
- ✅ Percentage-based deductions (proration ignored)
- ✅ Min/max constraints after proration
- ✅ Partial month calculations
- ✅ Decimal results and rounding
- ✅ Null rule handling
- ✅ Gross salary base for percentage

### 3. Merge Logic Tests (15 tests)
- ✅ Return base list when no overrides (includeMissing=true)
- ✅ Return empty when no overrides (includeMissing=false)
- ✅ Override by masterId
- ✅ Override by name
- ✅ Include non-overridden items (includeMissing=true)
- ✅ Exclude non-overridden items (includeMissing=false)
- ✅ Case-insensitive name matching
- ✅ Preserve base item properties
- ✅ Handle multiple overrides
- ✅ Handle overrideAmount field
- ✅ Handle new items in overrides
- ✅ Handle null/undefined overrides
- ✅ Filter invalid overrides
- ✅ Prevent duplicates

### 4. Integration Tests (9 scenarios)
- ✅ Full month attendance with proration
- ✅ Partial month attendance
- ✅ Employee override with different proration
- ✅ Mixed allowances (some prorated, some not)
- ✅ Deduction with proration
- ✅ Zero attendance days
- ✅ Complete payroll calculation
- ✅ Min/max constraints with proration
- ✅ Include missing setting behavior

## Expected Results

All tests should pass with the following output:

```
PASS  payroll/services/__tests__/allowanceService.test.js
PASS  payroll/services/__tests__/deductionService.test.js
PASS  payroll/services/__tests__/allowanceDeductionResolverService.test.js
PASS  payroll/services/__tests__/payrollCalculation.integration.test.js

Test Suites: 4 passed, 4 total
Tests:       49 passed, 49 total
Snapshots:   0 total
Time:        X.XXXs
```

## Coverage Report

After running `npm run test:coverage`, you'll see a coverage report like:

```
----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
allowanceService.js   |   95.00 |    90.00 |  100.00 |   95.00 |
deductionService.js   |   92.00 |    88.00 |  100.00 |   92.00 |
resolverService.js    |   90.00 |    85.00 |  100.00 |   90.00 |
----------------------|---------|----------|---------|---------|
```

## Troubleshooting

### Issue: Tests fail with module not found
**Solution**: Make sure you're in the backend directory and have run `npm install`

### Issue: Jest not found
**Solution**: Run `npm install jest --save-dev`

### Issue: Tests timeout
**Solution**: Increase timeout in jest.config.js or individual tests

### Issue: Coverage below threshold
**Solution**: Add more test cases or adjust threshold in jest.config.js

## Manual Testing Checklist

After automated tests pass, perform these manual tests:

1. ✅ Create allowance with basedOnPresentDays=true via API
2. ✅ Create deduction with basedOnPresentDays=true via API
3. ✅ Add employee override with basedOnPresentDays=true
4. ✅ Run payroll calculation for employee with partial attendance
5. ✅ Verify prorated amounts in payroll breakdown
6. ✅ Test with includeMissing=false setting
7. ✅ Test with min/max constraints
8. ✅ Verify logs show proration calculations

## Next Steps

1. Run all tests: `npm test`
2. Check coverage: `npm run test:coverage`
3. Fix any failing tests
4. Proceed with frontend implementation
5. Perform end-to-end testing

## Contact

For issues or questions about the tests, refer to:
- Implementation Summary: `IMPLEMENTATION_SUMMARY_BASED_ON_PRESENT_DAYS.md`
- Test files in: `backend/payroll/services/__tests__/`
