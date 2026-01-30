const xlsx = require('xlsx');
const Employee = require('../../employees/model/Employee');
const AllowanceDeductionMaster = require('../../allowances-deductions/model/AllowanceDeductionMaster');

/** Normalize object key (case-insensitive, strips non-alphanumeric) */
function normalizeKey(obj, key) {
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = Object.keys(obj).find(k => norm(k) === norm(key));
    return found ? obj[found] : undefined;
}

/**
 * Service to handle second salary updates
 */
const processSecondSalaryUpload = async (fileBuffer) => {
    try {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        if (!data || data.length === 0) {
            return {
                success: false,
                message: 'No data found in the uploaded file',
                stats: { total: 0, updated: 0, failed: 0 }
            };
        }

        let updatedCount = 0;
        let failedCount = 0;
        const errors = [];

        // Process each row
        for (const row of data) {
            const empNo = normalizeKey(row, 'empno') || normalizeKey(row, 'employeeid');
            const secondSalary = normalizeKey(row, 'secondsalary');

            if (!empNo) {
                failedCount++;
                errors.push({ row, error: 'Missing Employee ID' });
                continue;
            }

            if (secondSalary === undefined || secondSalary === null || secondSalary === '') {
                failedCount++;
                errors.push({ empNo, error: 'Missing Second Salary value' });
                continue;
            }

            const salaryValue = Number(secondSalary);
            if (isNaN(salaryValue)) {
                failedCount++;
                errors.push({ empNo, error: `Invalid salary value: ${secondSalary}` });
                continue;
            }
            if (salaryValue < 0) {
                failedCount++;
                errors.push({ empNo, error: 'Negative salary value' });
                continue;
            }

            try {
                const result = await Employee.updateOne(
                    { emp_no: empNo },
                    { $set: { second_salary: salaryValue } }
                );

                if (result.matchedCount === 0) {
                    failedCount++;
                    errors.push({ empNo, error: 'Employee not found' });
                } else {
                    updatedCount++;
                }
            } catch (err) {
                failedCount++;
                errors.push({ empNo, error: err.message });
            }
        }

        return {
            success: true,
            message: `Processed ${data.length} records. Updated: ${updatedCount}, Failed: ${failedCount}`,
            stats: {
                total: data.length,
                updated: updatedCount,
                failed: failedCount,
                errors: errors.length > 0 ? errors : undefined
            }
        };

    } catch (error) {
        console.error('Error processing second salary upload:', error);
        throw new Error('Failed to process Excel file: ' + error.message);
    }
};

/**
 * Generates data for the salary update template by fetching all active employees.
 */
const generateSalaryUpdateTemplateData = async () => {
    try {
        const employees = await Employee.find({ is_active: true }, 'emp_no').sort({ emp_no: 1 });

        return employees.map(emp => ({
            'Employee ID': emp.emp_no,
            'Second Salary': ''
        }));
    } catch (error) {
        console.error('Error fetching employees for template:', error);
        throw new Error('Failed to fetch employees for template: ' + error.message);
    }
};

/**
 * Dynamic Employee Update - Template Generator
 */
const generateEmployeeUpdateTemplateData = async (selectedFieldIds) => {
    if (!Array.isArray(selectedFieldIds)) {
        selectedFieldIds = [];
    }
    try {
        const FormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
        const settings = await FormSettings.getActiveSettings();

        const fieldMap = {};
        if (settings && settings.groups) {
            settings.groups.forEach(group => {
                group.fields.forEach(field => {
                    fieldMap[field.id] = field.label;
                });
            });
        }

        const employees = await Employee.find({ is_active: true }).sort({ emp_no: 1 });

        const headers = ['Employee ID'];
        selectedFieldIds.forEach(id => {
            headers.push(fieldMap[id] || id);
        });

        const data = employees.map(emp => {
            const row = { 'Employee ID': emp.emp_no };
            selectedFieldIds.forEach(id => {
                const label = fieldMap[id] || id;
                row[label] = emp[id] || '';
            });
            return row;
        });

        return { data, headers };
    } catch (error) {
        console.error('Error generating dynamic template:', error);
        throw error;
    }
};

/**
 * Dynamic Employee Update - Process Upload
 */
const processEmployeeUpdateUpload = async (fileBuffer) => {
    try {
        const FormSettings = require('../../employee-applications/model/EmployeeApplicationFormSettings');
        const settings = await FormSettings.getActiveSettings();

        // Map labels/IDs to internal field IDs; allowlist: only fields with isBulkUpdatable
        const labelToIdMap = {};
        const formSettingsMap = {};
        if (settings && settings.groups) {
            settings.groups.forEach(group => {
                group.fields.forEach(field => {
                    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
                    labelToIdMap[normalizedLabel] = field.id;
                    labelToIdMap[field.id.toLowerCase()] = field.id;
                    formSettingsMap[field.id] = field;
                });
            });
        }

        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        if (!data || data.length === 0) return { success: false, message: 'No data found', stats: { total: 0, updated: 0, failed: 0 } };

        let updatedCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const row of data) {
            const updateData = {};
            let empNo = '';

            Object.keys(row).forEach(header => {
                const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

                if (normalizedHeader === 'employeeid' || normalizedHeader === 'empno') {
                    empNo = row[header];
                } else {
                    const fieldId = labelToIdMap[normalizedHeader];
                    const meta = formSettingsMap[fieldId];
                    if (meta && (meta.isBulkUpdatable === true || meta.isBulkUpdatable === undefined)) {
                        updateData[fieldId] = row[header];
                    }
                }
            });

            if (!empNo) {
                failedCount++;
                errors.push({ row, error: 'Missing Employee ID' });
                continue;
            }

            if (Object.keys(updateData).length === 0) {
                failedCount++;
                errors.push({ empNo, error: 'No updateable fields found in row' });
                continue;
            }

            try {
                const result = await Employee.updateOne({ emp_no: empNo }, { $set: updateData });
                if (result.matchedCount === 0) {
                    failedCount++;
                    errors.push({ empNo, error: 'Employee not found' });
                } else {
                    updatedCount++;
                }
            } catch (err) {
                failedCount++;
                errors.push({ empNo, error: err.message });
            }
        }

        return {
            success: true,
            message: `Processed ${data.length} records. Updated: ${updatedCount}, Failed: ${failedCount}`,
            stats: { total: data.length, updated: updatedCount, failed: failedCount, errors: errors.length > 0 ? errors : undefined }
        };
    } catch (error) {
        console.error('Error processing bulk employee update:', error);
        throw error;
    }
};

module.exports = {
    processSecondSalaryUpload,
    generateSalaryUpdateTemplateData,
    generateEmployeeUpdateTemplateData,
    processEmployeeUpdateUpload,

    /**
     * Bulk Employee Allowances/Deductions Update - Template Generator
     * Exports all active employees and all active A&D masters.
     * Deductions are shown as negative values in Excel.
     */
    generateEmployeeADUpdateTemplateData: async () => {
        try {
            const masters = await AllowanceDeductionMaster.find({ isActive: true })
            .select('name category globalRule departmentRules')
            .sort({ category: 1, name: 1 });

        const employees = await Employee.find({ is_active: true })
            .select('emp_no employeeAllowances employeeDeductions division_id department_id')
            .sort({ emp_no: 1 });

        const headers = ['Employee ID'];
        const masterHeaders = masters.map(m => `${m.name} (${m.category})`);
        headers.push(...masterHeaders);

        // Helper to resolve rule for an employee from a master
        const resolveRule = (master, divisionId, departmentId) => {
            if (!master) return null;

            const divIdStr = divisionId ? String(divisionId) : null;
            const deptIdStr = departmentId ? String(departmentId) : null;

            // 1. Check for Division + Department specific rule
            if (divIdStr && deptIdStr && master.departmentRules) {
                const divDeptRule = master.departmentRules.find(r =>
                    r.divisionId && String(r.divisionId) === divIdStr &&
                    r.departmentId && String(r.departmentId) === deptIdStr
                );
                if (divDeptRule) return divDeptRule;
            }

            // 2. Check for Department only rule
            if (deptIdStr && master.departmentRules) {
                const deptRule = master.departmentRules.find(r =>
                    !r.divisionId &&
                    r.departmentId && String(r.departmentId) === deptIdStr
                );
                if (deptRule) return deptRule;
            }

            // 3. Fallback to Global Rule
            return master.globalRule;
        };

        const data = employees.map(emp => {
            const row = { 'Employee ID': emp.emp_no };

            const allowMap = new Map();
            (Array.isArray(emp.employeeAllowances) ? emp.employeeAllowances : []).forEach(a => {
                if (a?.masterId) allowMap.set(String(a.masterId), a);
            });
            const deductMap = new Map();
            (Array.isArray(emp.employeeDeductions) ? emp.employeeDeductions : []).forEach(d => {
                if (d?.masterId) deductMap.set(String(d.masterId), d);
            });

            masters.forEach(m => {
                const key = `${m.name} (${m.category})`;
                const id = String(m._id);

                // Priority 1: Employee Override
                let activeRule = m.category === 'deduction' ? deductMap.get(id) : allowMap.get(id);

                // Priority 2: Master Resolution (Division/Dept/Global)
                if (!activeRule) {
                    activeRule = resolveRule(m, emp.division_id, emp.department_id);
                }

                let value = '';
                if (activeRule) {
                    // 1. Try to respect the explicitly set type
                    if (activeRule.type === 'percentage') {
                        value = activeRule.percentage;
                    } else if (activeRule.type === 'fixed') {
                        value = activeRule.amount;
                    }

                    // 2. Fallback: If value is missing (null/undefined), check any available numeric field
                    if (value === null || value === undefined || value === '') {
                        if (activeRule.amount !== null && activeRule.amount !== undefined) {
                            value = activeRule.amount;
                        } else if (activeRule.percentage !== null && activeRule.percentage !== undefined) {
                            value = activeRule.percentage;
                        }
                    }

                    // 3. Ensure we return an empty string for null/undefined rather than the value null/undefined
                    if (value === null || value === undefined) {
                        value = '';
                    }
                }

                // Show deductions as negative values in the Excel
                if (m.category === 'deduction' && value !== '' && value !== null && value !== undefined) {
                    const n = Number(value);
                    value = Number.isFinite(n) ? -Math.abs(n) : value;
                }

                row[key] = value;
            });

            return row;
        });

        return { data, headers };
        } catch (err) {
            console.error('Error in generateEmployeeADUpdateTemplateData:', err);
            throw new Error('Failed to generate employee A&D update template: ' + (err.message || err));
        }
    },
    /**
     * Bulk Employee Allowances/Deductions Update - Process Upload
     * Updates only existing masters (identified by Name (Category) header).
     * Deductions can be provided as negative or positive; they are stored as positive amounts/percentages.
     * Blank cell => remove override for that master from employee overrides.
     */
    processEmployeeADUpdateUpload: async (fileBuffer) => {
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(sheet);

        if (!rows || rows.length === 0) {
            return { success: false, message: 'No data found', stats: { total: 0, updated: 0, failed: 0 } };
        }

        const masters = await AllowanceDeductionMaster.find({ isActive: true })
            .select('name category globalRule')
            .sort({ category: 1, name: 1 });

        // Map "Name (Category)" -> Master Object
        const masterByHeader = new Map();
        masters.forEach(m => {
            masterByHeader.set(`${m.name} (${m.category})`, m);
        });

        let updatedCount = 0;
        let failedCount = 0;
        const errors = [];

        for (const row of rows) {
            const empNo = normalizeKey(row, 'empno') || normalizeKey(row, 'employeeid');
            if (!empNo) {
                failedCount++;
                errors.push({ row, error: 'Missing Employee ID' });
                continue;
            }

            try {
                const employee = await Employee.findOne({ emp_no: String(empNo).trim().toUpperCase() });
                if (!employee) {
                    failedCount++;
                    errors.push({ empNo, error: 'Employee not found' });
                    continue;
                }

                const nextAllowances = Array.isArray(employee.employeeAllowances) ? [...employee.employeeAllowances] : [];
                const nextDeductions = Array.isArray(employee.employeeDeductions) ? [...employee.employeeDeductions] : [];

                const upsertOverride = (arr, masterId, overrideObj) => {
                    const idx = arr.findIndex(x => String(x.masterId) === String(masterId));
                    if (idx >= 0) arr[idx] = { ...arr[idx].toObject?.() || arr[idx], ...overrideObj };
                    else arr.push(overrideObj);
                };
                const removeOverride = (arr, masterId) => arr.filter(x => String(x.masterId) !== String(masterId));

                Object.keys(row).forEach(header => {
                    // Find master by exact header match from template
                    const master = masterByHeader.get(header);
                    if (!master) return;

                    const masterId = String(master._id);

                    const cell = row[header];
                    const isBlank = cell === undefined || cell === null || cell === '';

                    const targetArr = master.category === 'deduction' ? nextDeductions : nextAllowances;

                    if (isBlank) {
                        if (master.category === 'deduction') {
                            const filtered = removeOverride(targetArr, masterId);
                            nextDeductions.length = 0;
                            nextDeductions.push(...filtered);
                        } else {
                            const filtered = removeOverride(targetArr, masterId);
                            nextAllowances.length = 0;
                            nextAllowances.push(...filtered);
                        }
                        return;
                    }

                    const n = Number(cell);
                    if (!Number.isFinite(n)) {
                        errors.push({ empNo, rowIdentifier: empNo, masterId, column: header, cellValue: cell, error: `Non-numeric value for column "${header}": ${cell}` });
                        return;
                    }
                    const valueAbs = Math.abs(n);

                    const rule = master.globalRule || {};
                    const overrideObj = {
                        masterId,
                        name: master.name,
                        category: master.category,
                        type: rule.type,
                        amount: rule.type === 'fixed' ? valueAbs : null,
                        percentage: rule.type === 'percentage' ? valueAbs : null,
                        percentageBase: rule.type === 'percentage' ? (rule.percentageBase || null) : null,
                        minAmount: rule.minAmount ?? null,
                        maxAmount: rule.maxAmount ?? null,
                        basedOnPresentDays: rule.type === 'fixed' ? (rule.basedOnPresentDays || false) : false,
                        isOverride: true,
                    };

                    if (master.category === 'deduction') upsertOverride(nextDeductions, masterId, overrideObj);
                    else upsertOverride(nextAllowances, masterId, overrideObj);
                });

                employee.employeeAllowances = nextAllowances;
                employee.employeeDeductions = nextDeductions;
                await employee.save();
                updatedCount++;
            } catch (err) {
                failedCount++;
                errors.push({ empNo, error: err.message });
            }
        }

        return {
            success: true,
            message: `Processed ${rows.length} records. Updated: ${updatedCount}, Failed: ${failedCount}`,
            stats: { total: rows.length, updated: updatedCount, failed: failedCount, errors: errors.length > 0 ? errors : undefined }
        };
    }
};
