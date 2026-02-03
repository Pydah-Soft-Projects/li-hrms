const express = require('express');
const router = express.Router();
const { payrollQueue, attendanceSyncQueue, applicationQueue, attendanceUploadQueue } = require('../jobs/queueManager');

/**
 * @desc    Get job status and progress
 * @route   GET /api/jobs/status/:jobId
 */
router.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { queue = 'payroll' } = req.query;

        let activeQueue;
        switch (queue) {
            case 'attendanceSync': activeQueue = attendanceSyncQueue; break;
            case 'application': activeQueue = applicationQueue; break;
            case 'attendanceUpload': activeQueue = attendanceUploadQueue; break;
            default: activeQueue = payrollQueue;
        }

        const job = await activeQueue.getJob(jobId);

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        const state = await job.getState();
        const progress = job.progress || 0;
        const result = job.returnvalue;
        const failedReason = job.failedReason;

        res.json({
            success: true,
            data: {
                id: job.id,
                name: job.name,
                state,
                progress,
                result,
                failedReason,
                timestamp: job.timestamp,
                finishedOn: job.finishedOn
            }
        });
    } catch (error) {
        console.error('Error fetching job status:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
