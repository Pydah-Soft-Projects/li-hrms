const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Models
const Loan = require('../loans/model/Loan');
const LoanSettings = require('../loans/model/LoanSettings');
const User = require('../users/model/User');
const Department = require('../departments/model/Department');
const Division = require('../departments/model/Division');
const Employee = require('../employees/model/Employee');

// Import Controller
const loanController = require('../loans/controllers/loanController');

async function runVerification() {
    console.log('--- Starting Loan Workflow Verification ---');

    if (!process.env.MONGODB_URI) {
        console.error('MONGODB_URI not found in env');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB.');

    try {
        // --- DATA SETUP ---
        console.log('\n--- Setting up Test Data ---');

        // Find or create test users
        // Per request: ensure we run approvals as `RAVI buraga` with role `super_admin`
        let superAdmin = await User.findOne({
            role: 'super_admin',
            name: { $regex: /RAVI\s*buraga/i },
        });
        if (!superAdmin) {
            console.log('Creating dummy super_admin (RAVI buraga)...');
            superAdmin = await User.create({
                name: 'RAVI buraga',
                email: 'ravi.buraga@example.com',
                password: 'password123',
                role: 'super_admin',
                roles: ['super_admin']
            });
        }

        let hrUser = await User.findOne({ role: 'hr' });
        if (!hrUser) {
            console.log('Creating dummy HR user...');
            hrUser = await User.create({
                name: 'Test HR',
                email: 'test_hr@example.com',
                password: 'password123',
                role: 'hr',
                roles: ['hr']
            });
        }

        let hodUser = await User.findOne({ role: 'hod' });
        if (!hodUser) {
            console.log('Creating dummy HOD user...');
            hodUser = await User.create({
                name: 'Test HOD',
                email: 'test_hod@example.com',
                password: 'password123',
                role: 'hod',
                roles: ['hod']
            });
        }

        let managerUser = await User.findOne({ role: 'manager' });
        if (!managerUser) {
            console.log('Creating dummy Manager user...');
            managerUser = await User.create({
                name: 'Test Manager',
                email: 'test_manager@example.com',
                password: 'password123',
                role: 'manager',
                roles: ['manager']
            });
        }

        // Create a dummy employee
        let testEmployee = await Employee.findOne({ emp_no: 'TEST_LOAN_EMP' });
        if (!testEmployee) {
            testEmployee = await Employee.create({
                emp_no: 'TEST_LOAN_EMP',
                employee_name: 'Test Loan Employee',
                gross_salary: 50000,
                is_active: true
            });
        }

        // Create a dummy department/division
        let testDept = await Department.findOne({ name: 'TEST_LOAN_DEPT' });
        if (!testDept) {
            testDept = await Department.create({
                name: 'TEST_LOAN_DEPT',
                hod: hodUser._id
            });
        } else {
            testDept.hod = hodUser._id;
            await testDept.save();
        }

        let testDiv = await Division.findOne({ name: 'TEST_LOAN_DIV' });
        if (!testDiv) {
            testDiv = await Division.create({
                name: 'TEST_LOAN_DIV',
                code: 'TLD001',
                manager: managerUser._id
            });
        } else {
            testDiv.manager = managerUser._id;
            await testDiv.save();
        }

        // --- 1. SETTINGS SETUP ---
        console.log('\n--- 1. Setting up Loan Settings (HR as Final) ---');
        await LoanSettings.deleteMany({ type: { $in: ['salary_advance', 'loan'] } });

        const workflowSteps = [
            {
                stepOrder: 1,
                stepName: 'Manager Approval',
                approverRole: 'manager',
                isActive: true,
                nextStepOnApprove: 2,
                availableActions: ['approve', 'reject', 'forward'],
                canEditSanctionedAmount: true,
            },
            {
                stepOrder: 2,
                stepName: 'HR Approval',
                approverRole: 'hr',
                isActive: true,
                nextStepOnApprove: null,
                availableActions: ['approve', 'reject'],
                canControlInterest: true,
            },
        ];

        // Salary advance workflow settings
        await LoanSettings.create({
            type: 'salary_advance',
            settings: {
                minAmount: 1000,
                maxAmount: 100000,
                minDuration: 1,
                maxDuration: 12,
                maxActivePerEmployee: 1,
                salaryBasedLimits: { enabled: true, advancePercentage: 50, considerAttendance: false },
            },
            workflow: {
                isEnabled: true,
                useDynamicWorkflow: false,
                allowHigherAuthorityToApproveLowerLevels: true,
                steps: workflowSteps,
                finalAuthority: {
                    role: 'hr',
                    anyHRCanApprove: true,
                },
            },
            isActive: true,
        });

        // Loan workflow settings (needed for interest-rate modification test)
        await LoanSettings.create({
            type: 'loan',
            settings: {
                minAmount: 1000,
                maxAmount: 200000,
                minDuration: 1,
                maxDuration: 60,
                maxActivePerEmployee: 1,
                isInterestApplicable: true,
                interestRate: 10,
            },
            workflow: {
                isEnabled: true,
                useDynamicWorkflow: false,
                allowHigherAuthorityToApproveLowerLevels: true,
                steps: workflowSteps,
                finalAuthority: {
                    role: 'hr',
                    anyHRCanApprove: true,
                },
            },
            isActive: true,
        });

        // --- 2. CREATE LOAN APPLICATION ---
        console.log('\n--- 2. Creating Salary Advance Application ---');
        const loan = await Loan.create({
            employeeId: testEmployee._id,
            emp_no: testEmployee.emp_no,
            department: testDept._id,
            division_id: testDiv._id,
            requestType: 'salary_advance',
            amount: 10000,
            originalAmount: 10000,
            reason: 'Test Loan Reason',
            duration: 1,
            appliedBy: testEmployee._id,
            appliedAt: new Date(),
            status: 'pending',
            workflow: {
                currentStep: 'hod',
                nextApprover: 'hod'
            },
            advanceConfig: {
                totalAmount: 10000,
                deductionPerCycle: 10000,
                numberOfCycles: 1
            }
        });
        console.log('✅ Created Loan ID:', loan._id);

        // Mock Res object
        const mockRes = () => {
            const res = {};
            res.status = (code) => { res.statusCode = code; return res; };
            res.json = (data) => { res.data = data; return res; };
            return res;
        };

        // --- 3. HOD FORWARDING ---
        console.log('\n--- 3. HOD Forwarding ---');
        let req = {
            params: { id: loan._id },
            user: hodUser,
            body: { action: 'forward', comments: 'Forwarding to Manager' }
        };
        let res = mockRes();

        const firstDeductionPayrollYm = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();

        await loanController.processLoanAction(req, res);

        let updatedLoan = await Loan.findById(loan._id);
        if (updatedLoan.workflow.currentStep === 'manager') {
            console.log('✅ PASS: HOD successfully forwarded to Manager.');
        } else {
            console.log('❌ FAIL: HOD forwarding failed. Current step:', updatedLoan.workflow.currentStep);
        }

        // --- 4. MANAGER APPROVAL (with amount change) ---
        console.log('\n--- 4. Manager Approval with Amount Modification (10000 -> 8000) ---');
        req = {
            params: { id: loan._id },
            user: managerUser,
            body: {
                action: 'approve',
                approvalAmount: 8000,
                comments: 'Reducing amount to 8k'
            }
        };
        res = mockRes();

        await loanController.processLoanAction(req, res);

        updatedLoan = await Loan.findById(loan._id);
        if (updatedLoan.amount === 8000 && updatedLoan.workflow.currentStep === 'hr') {
            console.log('✅ PASS: Manager approved and reduced amount. Next step: HR.');
            const recalculated =
                updatedLoan.advanceConfig?.deductionPerCycle === 8000 &&
                updatedLoan.advanceConfig?.deductionCycles === 1 &&
                updatedLoan.repayment?.totalInstallments === 1 &&
                updatedLoan.repayment?.remainingBalance === 8000;
            console.log('Checking recalculation:', recalculated ? '✅ Recalculated' : '❌ Failed Recalculation');
            console.log('Checking history:', updatedLoan.changeHistory.length > 0 ? '✅ History logged' : '❌ History missing');
        } else {
            console.log('❌ FAIL: Manager action failed. Amount:', updatedLoan.amount, 'Step:', updatedLoan.workflow.currentStep);
        }

        // --- 5. HR FINAL APPROVAL ---
        console.log('\n--- 5. HR Final Approval (Role: HR) ---');
        req = {
            params: { id: loan._id },
            user: hrUser,
            body: { action: 'approve', comments: 'Final approval by HR', firstDeductionPayrollMonth: firstDeductionPayrollYm }
        };
        res = mockRes();

        await loanController.processLoanAction(req, res);

        updatedLoan = await Loan.findById(loan._id);
        if (updatedLoan.status === 'approved' && updatedLoan.workflow.currentStep === 'completed') {
            console.log('✅ PASS: HR final approval successful.');
        } else {
            console.log('❌ FAIL: HR approval failed. Status:', updatedLoan.status, 'Step:', updatedLoan.workflow.currentStep);
        }

        // --- 6. SUPERADMIN BYPASS TEST ---
        console.log('\n--- 6. SuperAdmin Bypass Test ---');
        const bypassLoan = await Loan.create({
            employeeId: testEmployee._id,
            emp_no: testEmployee.emp_no,
            department: testDept._id,
            requestType: 'salary_advance',
            amount: 5000,
            originalAmount: 5000,
            reason: 'Bypass Reason',
            duration: 1,
            appliedBy: testEmployee._id,
            appliedAt: new Date(),
            status: 'pending',
            workflow: {
                currentStep: 'hod',
                nextApprover: 'hod'
            }
        });

        const bypassFirstDeductionYm = (() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        req = {
            params: { id: bypassLoan._id },
            user: superAdmin,
            body: {
                action: 'approve',
                comments: 'SuperAdmin Instant Approval',
                firstDeductionPayrollMonth: bypassFirstDeductionYm,
            },
        };
        res = mockRes();

        await loanController.processLoanAction(req, res);

        const checkedBypass = await Loan.findById(bypassLoan._id);
        const scheduleOk =
            checkedBypass.approvals?.final?.firstDeductionPayrollMonth === bypassFirstDeductionYm
            && checkedBypass.repayment?.nextPaymentDate;

        const advanced =
            checkedBypass.status !== 'pending'
            && checkedBypass.workflow.currentStep !== 'hod';

        if (advanced) {
            console.log('✅ PASS: SuperAdmin bypass advanced the workflow.');
            console.log('Bypass result:', {
                status: checkedBypass.status,
                currentStep: checkedBypass.workflow.currentStep,
                nextApprover: checkedBypass.workflow.nextApprover,
                scheduleOk,
            });
        } else {
            console.log('❌ FAIL: SuperAdmin bypass did not advance. Status:', checkedBypass.status, 'Step:', checkedBypass.workflow.currentStep);
        }

        // --- 7. FINAL AUTHORITY OVERRIDE TEST ---
        console.log('\n--- 7. Final Authority Override Test (Role: Specific User) ---');
        const overrideSettings = await LoanSettings.findOne({ type: 'salary_advance', isActive: true });
        overrideSettings.workflow.finalAuthority = {
            role: 'specific_user',
            userId: superAdmin._id
        };
        await overrideSettings.save();

        const overrideLoan = await Loan.create({
            employeeId: testEmployee._id,
            emp_no: testEmployee.emp_no,
            department: testDept._id,
            requestType: 'salary_advance',
            amount: 3000,
            originalAmount: 3000,
            reason: 'Override Reason',
            duration: 1,
            appliedBy: testEmployee._id,
            appliedAt: new Date(),
            status: 'hr_approved', // Already at HR step
            workflow: {
                currentStep: 'hr',
                nextApprover: 'hr'
            }
        });

        console.log('Case: HR tries to approve but they are NOT the final authority');
        req = {
            params: { id: overrideLoan._id },
            user: hrUser,
            body: { action: 'approve', comments: 'HR trying to finalize' }
        };
        res = mockRes();

        await loanController.processLoanAction(req, res);

        const checkHRAction = await Loan.findById(overrideLoan._id);
        if (checkHRAction.status === 'hr_approved' && checkHRAction.workflow.currentStep === 'final') {
            console.log('✅ PASS: HR moved it to "final" (final_authority) because they aren\'t final authority.');
        } else {
            console.log('❌ FAIL: HR action did not respect final authority setting. Status:', checkHRAction.status, 'Step:', checkHRAction.workflow.currentStep);
        }

        // --- 8. INTEREST RATE MODIFICATION TEST ---
        console.log('\n--- 8. Interest Rate Modification Test (HR Role) ---');
        const interestLoan = await Loan.create({
            employeeId: testEmployee._id,
            emp_no: testEmployee.emp_no,
            department: testDept._id,
            requestType: 'loan',
            amount: 10000,
            originalAmount: 10000,
            reason: 'Interest Modification Test',
            duration: 10,
            appliedBy: testEmployee._id,
            appliedAt: new Date(),
            status: 'manager_approved', // At HR step
            loanConfig: {
                interestRate: 10,
                emiAmount: 1046,
                totalAmount: 10464
            },
            workflow: {
                currentStep: 'hr',
                nextApprover: 'hr'
            }
        });

        console.log('Case: HR approves and updates interest rate to 15%');
        req = {
            params: { id: interestLoan._id },
            user: hrUser,
            body: {
                action: 'approve',
                comments: 'Updating interest rate for better risk management',
                approvalInterestRate: 15,
                firstDeductionPayrollMonth: firstDeductionPayrollYm
            }
        };
        res = mockRes();

        await loanController.processLoanAction(req, res);

        const checkedInterest = await Loan.findById(interestLoan._id);
        console.log('Modified Interest Rate:', checkedInterest.loanConfig.interestRate);
        console.log('Modified EMI:', checkedInterest.loanConfig.emiAmount);
        console.log('Change History Count:', checkedInterest.changeHistory.length);

        if (checkedInterest.loanConfig.interestRate === 15 &&
            checkedInterest.loanConfig.emiAmount > 1046 &&
            checkedInterest.changeHistory.some(h => h.field === 'interestRate')) {
            console.log('✅ PASS: Interest rate updated, EMI recalculated, and history logged.');
        } else {
            console.log('❌ FAIL: Interest rate modification failed or recalculation incorrect.');
        }

        console.log('\n--- Verification Completed Successfully ---');

    } catch (error) {
        if (error.name === 'ValidationError') {
            console.error('Validation Error Details:');
            for (let field in error.errors) {
                console.error(`- ${field}: ${error.errors[field].message}`);
            }
        } else {
            console.error('Verification Fatal Error:', error);
        }
    } finally {
        // Cleanup test data (optional but good for repeatability)
        await Loan.deleteMany({ emp_no: 'TEST_LOAN_EMP' });
        await LoanSettings.deleteMany({ type: { $in: ['salary_advance', 'loan'] } });
        // await Employee.deleteMany({ emp_no: 'TEST_LOAN_EMP' });
        // await User.deleteMany({ email: /test_.*@example.com/ });

        await mongoose.disconnect();
    }
}

runVerification();
