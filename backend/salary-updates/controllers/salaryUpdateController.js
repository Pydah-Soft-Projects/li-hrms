const { processSecondSalaryUpload, generateSalaryUpdateTemplateData } = require('../services/salaryUpdateService');
const xlsx = require('xlsx');

// Bulk update second salary
const bulkUpdateSecondSalary = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const result = await processSecondSalaryUpload(req.file.buffer);

        res.json({
            success: result.success,
            message: result.message,
            data: result.stats
        });
    } catch (error) {
        console.error('Controller Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process salary update',
            error: error.message
        });
    }
};

// Bulk update employees (Dynamic)
const bulkUpdateEmployee = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const { processEmployeeUpdateUpload } = require('../services/salaryUpdateService');
        const result = await processEmployeeUpdateUpload(req.file.buffer);

        res.json({
            success: result.success,
            message: result.message,
            data: result.stats
        });
    } catch (error) {
        console.error('Bulk Update Controller Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process employee update',
            error: error.message
        });
    }
};

// Download dynamic template
const downloadEmployeeUpdateTemplate = async (req, res) => {
    try {
        let { fields } = req.query;
        if (!fields) {
            return res.status(400).json({ success: false, message: 'No fields selected' });
        }

        // Ensure fields is an array
        if (!Array.isArray(fields)) {
            fields = [fields];
        }

        const { generateEmployeeUpdateTemplateData } = require('../services/salaryUpdateService');
        const { data, headers } = await generateEmployeeUpdateTemplateData(fields);

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data, { header: headers });

        // Set column widths
        ws['!cols'] = headers.map(() => ({ wch: 20 }));

        xlsx.utils.book_append_sheet(wb, ws, 'EmployeeUpdate');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="EmployeeUpdateTemplate.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Dynamic Template Download Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate dynamic template',
            error: error.message
        });
    }
};

// Download template for second salary
const downloadTemplate = async (req, res) => {
    try {
        const { generateSalaryUpdateTemplateData } = require('../services/salaryUpdateService');
        const data = await generateSalaryUpdateTemplateData();

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);

        // Set column widths
        const headers = Object.keys(data[0] || {});
        ws['!cols'] = headers.map(() => ({ wch: 20 }));

        xlsx.utils.book_append_sheet(wb, ws, 'SecondSalaryTemplate');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="SecondSalaryTemplate.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Template Download Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate template',
            error: error.message
        });
    }
};

module.exports = {
    bulkUpdateSecondSalary,
    downloadTemplate,
    bulkUpdateEmployee,
    downloadEmployeeUpdateTemplate
};
