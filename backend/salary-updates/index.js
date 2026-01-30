const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../authentication/middleware/authMiddleware'); // Corrected path
const { bulkUpdateSecondSalary, downloadTemplate, bulkUpdateEmployee, downloadEmployeeUpdateTemplate } = require('./controllers/salaryUpdateController');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes
// POST /api/salary-updates/bulk-update/upload
router.post(
    '/bulk-update/upload',
    protect,
    authorize('super_admin'),
    upload.single('file'),
    bulkUpdateEmployee
);

// GET /api/salary-updates/bulk-update/template
router.get(
    '/bulk-update/template',
    protect,
    authorize('super_admin'),
    downloadEmployeeUpdateTemplate
);

// Legacy/Internal: Second Salary Updates
// POST /api/salary-updates/second-salary/upload
router.post(
    '/second-salary/upload',
    protect,
    authorize('super_admin'),
    upload.single('file'),
    bulkUpdateSecondSalary
);

// GET /api/salary-updates/second-salary/template
router.get(
    '/second-salary/template',
    protect,
    authorize('super_admin'),
    downloadTemplate
);

module.exports = router;