const express = require('express');
const router = express.Router();
const payRegisterController = require('./controllers/payRegisterController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// All routes exclude employee role
router.use((req, res, next) => {
  if (req.user && req.user.role === 'employee') {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Employees cannot access pay register.',
    });
  }
  next();
});

/**
 * @swagger
 * /api/pay-register/upload-summary/{month}:
 *   post:
 *     summary: Bulk upload monthly pay register summaries
 *     tags: [PayRegister]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: month
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Summary uploaded
 */
router.post('/upload-summary/:month', payRegisterController.uploadSummaryBulk);

/**
 * @swagger
 * /api/pay-register/employees/{month}:
 *   get:
 *     summary: Get all employees with pay registers for a specific month
 *     tags: [PayRegister]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees with registers
 */
router.get('/employees/:month', payRegisterController.getEmployeesWithPayRegister);

/**
 * @swagger
 * /api/pay-register/{employeeId}/{month}:
 *   get:
 *     summary: Get pay register for a specific employee and month
 *     tags: [PayRegister]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pay register details retrieved
 */
router.get('/:employeeId/:month', payRegisterController.getPayRegister);

router.post('/:employeeId/:month', payRegisterController.createPayRegister);
router.put('/:employeeId/:month', payRegisterController.updatePayRegister);
router.put('/:employeeId/:month/daily/:date', payRegisterController.updateDailyRecord);
router.post('/:employeeId/:month/sync', payRegisterController.syncPayRegister);
router.get('/:employeeId/:month/history', payRegisterController.getEditHistory);

module.exports = router;

