const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'HRMS Backend API Documentation',
            version: '1.0.0',
            description: 'API documentation for the HRMS backend services with simulation support.',
            license: {
                name: 'MIT',
                url: 'https://spdx.org/licenses/MIT.html',
            },
            contact: {
                name: 'HRMS Support',
                url: 'https://github.com/your-repo',
                email: 'support@example.com',
            },
        },
        servers: [
            {
                url: 'http://localhost:5000',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        email: { type: 'string' },
                        name: { type: 'string' },
                        role: { type: 'string', enum: ['super_admin', 'sub_admin', 'hr', 'manager', 'hod', 'employee'] },
                        employeeId: { type: 'string' },
                        isActive: { type: 'boolean' },
                    }
                },
                Employee: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        employee_name: { type: 'string' },
                        division_id: { type: 'string' },
                        department_id: { type: 'string' },
                        designation_id: { type: 'string' },
                        doj: { type: 'string', format: 'date' },
                        dob: { type: 'string', format: 'date' },
                        gross_salary: { type: 'number' },
                        email: { type: 'string' },
                        phone_number: { type: 'string' },
                        is_active: { type: 'boolean' },
                    }
                },
                Department: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        divisionId: { type: 'string' },
                    }
                },
                Division: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                    }
                },
                Attendance: {
                    type: 'object',
                    properties: {
                        employeeNumber: { type: 'string' },
                        date: { type: 'string', format: 'date' },
                        inTime: { type: 'string', format: 'date-time' },
                        outTime: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['PRESENT', 'ABSENT', 'PARTIAL', 'HALF_DAY', 'HOLIDAY', 'WEEK_OFF'] },
                        totalHours: { type: 'number' },
                        isLateIn: { type: 'boolean' },
                        isEarlyOut: { type: 'boolean' },
                    }
                },
                Leave: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        leaveType: { type: 'string' },
                        fromDate: { type: 'string', format: 'date' },
                        toDate: { type: 'string', format: 'date' },
                        numberOfDays: { type: 'number' },
                        status: { type: 'string' },
                        appliedAt: { type: 'string', format: 'date-time' },
                    }
                },
                Loan: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        requestType: { type: 'string', enum: ['loan', 'salary_advance'] },
                        amount: { type: 'number' },
                        duration: { type: 'number' },
                        status: { type: 'string' },
                        appliedAt: { type: 'string', format: 'date-time' },
                    }
                },
                PayrollRecord: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        netSalary: { type: 'number' },
                        status: { type: 'string' },
                    }
                },
                BonusPolicy: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        policyType: { type: 'string' },
                        salaryComponent: { type: 'string' },
                        isActive: { type: 'boolean' },
                    }
                },
                Arrears: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        employee: { type: 'string' },
                        totalAmount: { type: 'number' },
                        startMonth: { type: 'string' },
                        endMonth: { type: 'string' },
                        status: { type: 'string' },
                    }
                },
                Shift: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        startTime: { type: 'string' },
                        endTime: { type: 'string' },
                        duration: { type: 'number' },
                    }
                },
                Permission: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        employeeNumber: { type: 'string' },
                        date: { type: 'string', format: 'date' },
                        permissionStartTime: { type: 'string', format: 'date-time' },
                        permissionEndTime: { type: 'string', format: 'date-time' },
                        status: { type: 'string' },
                    }
                },
                EmployeeApplication: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        employee_name: { type: 'string' },
                        proposedSalary: { type: 'number' },
                        status: { type: 'string' },
                    }
                },
                Designation: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        isActive: { type: 'boolean' },
                    }
                },
                Workspace: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        code: { type: 'string' },
                        type: { type: 'string' },
                        isActive: { type: 'boolean' },
                    }
                },
                AllowanceDeductionMaster: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        category: { type: 'string', enum: ['allowance', 'deduction'] },
                        isActive: { type: 'boolean' },
                    }
                },
                PayrollBatch: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        batchNumber: { type: 'string' },
                        month: { type: 'string' },
                        status: { type: 'string' },
                        totalNetSalary: { type: 'number' },
                    }
                },
                OD: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        odType: { type: 'string' },
                        fromDate: { type: 'string', format: 'date' },
                        toDate: { type: 'string', format: 'date' },
                        status: { type: 'string' },
                    }
                },
                OT: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        employeeNumber: { type: 'string' },
                        date: { type: 'string', format: 'date' },
                        otHours: { type: 'number' },
                        status: { type: 'string' },
                    }
                },
                AttendanceSettings: {
                    type: 'object',
                    properties: {
                        dataSource: { type: 'string' },
                        syncSettings: { type: 'object' },
                    }
                },
                AttendanceDeductionSettings: {
                    type: 'object',
                    properties: {
                        deductionRules: { type: 'object' },
                        isActive: { type: 'boolean' },
                    }
                },
                EarlyOutSettings: {
                    type: 'object',
                    properties: {
                        isEnabled: { type: 'boolean' },
                        allowedDurationMinutes: { type: 'number' },
                        deductionRanges: { type: 'array', items: { type: 'object' } },
                    }
                },
                MonthlyAttendanceSummary: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        totalPresentDays: { type: 'number' },
                        totalPayableShifts: { type: 'number' },
                    }
                },
                LeaveSettings: {
                    type: 'object',
                    properties: {
                        type: { type: 'string', enum: ['leave', 'od'] },
                        types: { type: 'array', items: { type: 'object' } },
                        isActive: { type: 'boolean' },
                    }
                },
                ApiResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: { type: 'object' },
                        error: { type: 'string' },
                    }
                },
                // --- SHIFTS ---
                ConfusedShift: {
                    type: 'object',
                    properties: {
                        employeeNumber: { type: 'string' },
                        date: { type: 'string' },
                        inTime: { type: 'string', format: 'date-time' },
                        outTime: { type: 'string', format: 'date-time' },
                        status: { type: 'string', enum: ['pending', 'resolved', 'dismissed'] },
                        possibleShifts: { type: 'array', items: { type: 'object' } }
                    }
                },
                PreScheduledShift: {
                    type: 'object',
                    properties: {
                        employeeNumber: { type: 'string' },
                        date: { type: 'string' },
                        shiftId: { type: 'string' },
                        status: { type: 'string', enum: ['WO', 'HOL'] },
                        scheduledBy: { type: 'string' }
                    }
                },
                RosterMeta: {
                    type: 'object',
                    properties: {
                        month: { type: 'string', format: 'YYYY-MM' },
                        strict: { type: 'boolean' }
                    }
                },
                ShiftDuration: {
                    type: 'object',
                    properties: {
                        duration: { type: 'number' },
                        label: { type: 'string' },
                        isActive: { type: 'boolean' }
                    }
                },
                // --- SECURITY ---
                SecurityLog: {
                    type: 'object',
                    properties: {
                        permissionId: { type: 'string' },
                        employeeId: { type: 'string' },
                        actionType: { type: 'string', enum: ['GATE_OUT', 'GATE_IN', 'VERIFICATION_FAILED'] },
                        verifiedBy: { type: 'string' },
                        status: { type: 'string' }
                    }
                },
                // --- BONUS ---
                BonusBatch: {
                    type: 'object',
                    properties: {
                        batchName: { type: 'string' },
                        startMonth: { type: 'string' },
                        endMonth: { type: 'string' },
                        status: { type: 'string', enum: ['pending', 'approved', 'frozen'] },
                        totalBonusAmount: { type: 'number' }
                    }
                },
                BonusRecord: {
                    type: 'object',
                    properties: {
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        calculatedBonus: { type: 'number' },
                        finalBonus: { type: 'number' },
                        isManualOverride: { type: 'boolean' }
                    }
                },
                // --- ATTENDANCE ---
                AttendanceDaily: {
                    type: 'object',
                    properties: {
                        employeeNumber: { type: 'string' },
                        date: { type: 'string' },
                        inTime: { type: 'string', format: 'date-time' },
                        outTime: { type: 'string', format: 'date-time' },
                        status: { type: 'string' },
                        totalHours: { type: 'number' },
                        isLateIn: { type: 'boolean' },
                        isEarlyOut: { type: 'boolean' }
                    }
                },
                AttendanceRawLog: {
                    type: 'object',
                    properties: {
                        employeeNumber: { type: 'string' },
                        timestamp: { type: 'string', format: 'date-time' },
                        type: { type: 'string', enum: ['IN', 'OUT'] },
                        source: { type: 'string' }
                    }
                },
                // --- PAYROLL & PAY REGISTER ---
                PayrollTransaction: {
                    type: 'object',
                    properties: {
                        emp_no: { type: 'string' },
                        transactionType: { type: 'string' },
                        category: { type: 'string', enum: ['earning', 'deduction', 'adjustment'] },
                        amount: { type: 'number' },
                        month: { type: 'string' }
                    }
                },
                SecondSalaryBatch: {
                    type: 'object',
                    properties: {
                        batchNumber: { type: 'string' },
                        month: { type: 'string' },
                        year: { type: 'number' },
                        status: { type: 'string' },
                        totalNetSalary: { type: 'number' }
                    }
                },
                SecondSalaryRecord: {
                    type: 'object',
                    properties: {
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        earnings: { type: 'object' },
                        deductions: { type: 'object' },
                        netSalary: { type: 'number' }
                    }
                },
                PayRegisterSummary: {
                    type: 'object',
                    properties: {
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        totals: { type: 'object' },
                        dailyRecords: { type: 'array', items: { type: 'object' } },
                        status: { type: 'string' }
                    }
                },
                // --- ARREARS ---
                ArrearsRequest: {
                    type: 'object',
                    properties: {
                        employee: { type: 'string' },
                        startMonth: { type: 'string' },
                        endMonth: { type: 'string' },
                        totalAmount: { type: 'number' },
                        remainingAmount: { type: 'number' },
                        status: { type: 'string' }
                    }
                },
                // --- WORKSPACES & SETTINGS ---
                Settings: {
                    type: 'object',
                    properties: {
                        key: { type: 'string' },
                        value: { type: 'object' },
                        category: { type: 'string' }
                    }
                },
                Module: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        code: { type: 'string' },
                        isActive: { type: 'boolean' }
                    }
                },
                RoleAssignment: {
                    type: 'object',
                    properties: {
                        userId: { type: 'string' },
                        workspaceId: { type: 'string' },
                        role: { type: 'string' }
                    }
                },
                // --- CONFIGURATION MODELS ---
                EmployeeApplicationFormSettings: {
                    type: 'object',
                    properties: {
                        isActive: { type: 'boolean' },
                        groups: { type: 'array', items: { type: 'object' } }
                    }
                },
                DepartmentSettings: {
                    type: 'object',
                    properties: {
                        department: { type: 'string' },
                        leaves: { type: 'object' },
                        loans: { type: 'object' }
                    }
                },
                PermissionDeductionSettings: {
                    type: 'object',
                    properties: {
                        deductionRules: { type: 'object' },
                        isActive: { type: 'boolean' }
                    }
                },
                LoanSettings: {
                    type: 'object',
                    properties: {
                        type: { type: 'string' },
                        settings: { type: 'object' },
                        workflow: { type: 'object' }
                    }
                },
                OvertimeSettings: {
                    type: 'object',
                    properties: {
                        payPerHour: { type: 'number' },
                        minOTHours: { type: 'number' },
                        isActive: { type: 'boolean' }
                    }
                },
                // --- LEAVES ---
                LeaveSplit: {
                    type: 'object',
                    properties: {
                        leaveId: { type: 'string' },
                        date: { type: 'string' },
                        leaveType: { type: 'string' },
                        status: { type: 'string' }
                    }
                },
                MonthlyLeaveRecord: {
                    type: 'object',
                    properties: {
                        emp_no: { type: 'string' },
                        month: { type: 'string' },
                        summary: { type: 'object' }
                    }
                }
            }
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: [
        './server.js',
        './authentication/index.js',
        './users/index.js',
        './employees/index.js',
        './attendance/index.js',
        './attendance/internalRoutes.js',
        './leaves/index.js',
        './payroll/index.js',
        './payroll/routes/*.js',
        './departments/index.js',
        './departments/divisionRoutes.js',
        './settings/index.js',
        './employee-applications/index.js',
        './workspaces/index.js',
        './loans/index.js',
        './ot/index.js',
        './overtime/index.js',
        './permissions/index.js',
        './security/routes/*.js',
        './shared/routes/*.js',
        './allowances-deductions/index.js',
        './arrears/index.js',
        './bonus/routes/*.js',
        './dashboard/index.js',
        './shifts/index.js',
    ],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
