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

module.exports = {
    processSecondSalaryUpload
};
