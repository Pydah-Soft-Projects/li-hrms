const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../../authentication/middleware/authMiddleware');
const {
    getTodayPermissions,
    generateGateOutQR,
    generateGateInQR,
    verifyGatePass
} = require('../controllers/securityController');

// All routes are protected
router.use(protect);

// Security Dashboard Routes (Super Admin & Security roles)
// Assuming 'security' role exists or reusing 'super_admin'/'sub_admin' for now
router.get('/permissions/today', authorize('super_admin', 'sub_admin', 'security'), getTodayPermissions);
router.post('/verify', authorize('super_admin', 'sub_admin', 'security'), verifyGatePass);

// Employee QR Generation Routes
router.post('/gate-pass/out/:id', generateGateOutQR);
router.post('/gate-pass/in/:id', generateGateInQR);

module.exports = router;
