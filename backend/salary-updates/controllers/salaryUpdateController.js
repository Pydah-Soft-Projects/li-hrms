const { processSecondSalaryUpload } = require('../services/salaryUpdateService');
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

// Download template
const downloadTemplate = (req, res) => {
    try {
        const wb = xlsx.utils.book_new();
        const data = [
            {
                'Employee ID': 'EMP001',
                'Second Salary': 50000
            },
            {
                'Employee ID': 'EMP002',
                'Second Salary': 60000
            }
        ];

        const ws = xlsx.utils.json_to_sheet(data);

        // Set column widths
        ws['!cols'] = [
            { wch: 15 }, // Employee ID
            { wch: 15 }  // Second Salary
        ];

        xlsx.utils.book_append_sheet(wb, ws, 'Template');

        const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="SecondSalaryTemplate.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Template Download Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate template'
        });
    }
};

module.exports = {
    bulkUpdateSecondSalary,
    downloadTemplate
};
