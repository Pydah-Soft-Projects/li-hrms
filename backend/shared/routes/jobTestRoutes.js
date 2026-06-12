const express = require('express');
const router = express.Router();
const { payrollQueue } = require('../jobs/queueManager');

// Trigger a test payroll job
router.post('/test-payroll', async (req, res) => {
    try {
        const job = await payrollQueue.add('testPayroll', {
            employeeId: 'TEST_123',
            month: '2024-01',
            triggeredAt: new Date().toISOString()
        });
        res.json({ success: true, jobId: job.id, message: 'Payroll job added to queue' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
