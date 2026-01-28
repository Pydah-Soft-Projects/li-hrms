const xlsx = require('xlsx');
const Employee = require('../../employees/model/Employee');

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
            // Normalize keys to lowercase to be safe
            const normalizeKey = (obj, key) => {
                const found = Object.keys(obj).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === key.toLowerCase().replace(/[^a-z0-9]/g, ''));
                return found ? obj[found] : undefined;
            };

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

        // Map labels/IDs to internal field IDs
        const labelToIdMap = {};
        if (settings && settings.groups) {
            settings.groups.forEach(group => {
                group.fields.forEach(field => {
                    const normalizedLabel = field.label.toLowerCase().replace(/[^a-z0-9]/g, '');
                    labelToIdMap[normalizedLabel] = field.id;
                    labelToIdMap[field.id.toLowerCase()] = field.id;
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

            // Map columns to fields
            Object.keys(row).forEach(header => {
                const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');

                if (normalizedHeader === 'employeeid' || normalizedHeader === 'empno') {
                    empNo = row[header];
                } else {
                    const fieldId = labelToIdMap[normalizedHeader];
                    if (fieldId && fieldId !== 'emp_no' && fieldId !== 'gross_salary' && fieldId !== 'proposedSalary') {
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
    processEmployeeUpdateUpload
};
