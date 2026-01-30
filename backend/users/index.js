const express = require('express');
const router = express.Router();
const userController = require('./controllers/userController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes are protected
router.use(protect);

/**
 * @swagger
 * /api/users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User statistics retrieved
 */
router.get('/stats', authorize('super_admin', 'sub_admin'), userController.getUserStats);

/**
 * @swagger
 * /api/users/employees-without-account:
 *   get:
 *     summary: Get employees without user accounts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees retrieved
 */
router.get(
  '/employees-without-account',
  authorize('manager', 'super_admin', 'sub_admin', 'hr'),
  userController.getEmployeesWithoutAccount
);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update own profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile', userController.updateProfile);

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user manually
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - name
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *               roles:
 *                 type: array
 *                 items:
 *                   type: string
 *               department:
 *                 type: string
 *               departments:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: User registered
 */
router.post('/register', authorize('manager', 'super_admin', 'sub_admin', 'hr'), userController.registerUser);

/**
 * @swagger
 * /api/users/from-employee:
 *   post:
 *     summary: Create user from existing employee
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - employeeId
 *             properties:
 *               employeeId:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *               autoGeneratePassword:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: User created
 */
router.post(
  '/from-employee',
  authorize('manager', 'super_admin', 'sub_admin', 'hr'),
  userController.createUserFromEmployee
);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of users retrieved
 */
router.get('/', authorize('manager', 'super_admin', 'sub_admin', 'hr'), userController.getAllUsers);

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get single user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details retrieved
 */
router.get('/:id', userController.getUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               role:
 *                 type: string
 *               department:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/:id', authorize('manager', 'super_admin', 'sub_admin', 'hr'), userController.updateUser);

/**
 * @swagger
 * /api/users/{id}/reset-password:
 *   put:
 *     summary: Reset user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               newPassword:
 *                 type: string
 *               autoGenerate:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Password reset
 */
router.put('/:id/reset-password', authorize('super_admin', 'sub_admin'), userController.resetPassword);

/**
 * @swagger
 * /api/users/{id}/toggle-status:
 *   put:
 *     summary: Toggle user active status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Status toggled
 */
router.put('/:id/toggle-status', authorize('super_admin', 'sub_admin'), userController.toggleUserStatus);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *     responses:
 *       200:
 *         description: User deleted
 */
router.delete('/:id', authorize('super_admin', 'sub_admin'), userController.deleteUser);

module.exports = router;
