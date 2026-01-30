const express = require('express');
const router = express.Router();
const workspaceController = require('./controllers/workspaceController');
const moduleController = require('./controllers/moduleController');
const { protect, authorize } = require('../authentication/middleware/authMiddleware');

// All routes require authentication
router.use(protect);

/**
 * @swagger
 * /api/workspaces/my-workspaces:
 *   get:
 *     summary: Get all workspaces accessible to the current user
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of workspaces
 */
router.get('/my-workspaces', workspaceController.getMyWorkspaces);

/**
 * @swagger
 * /api/workspaces/switch:
 *   post:
 *     summary: Switch active workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Workspace switched
 */
router.post('/switch', workspaceController.switchWorkspace);

// ==========================================
// MODULE ROUTES (Super Admin only)
// ==========================================

router.get('/modules', authorize('super_admin'), moduleController.getModules);
router.get('/modules/:id', authorize('super_admin'), moduleController.getModule);
router.post('/modules', authorize('super_admin'), moduleController.createModule);
router.put('/modules/:id', authorize('super_admin'), moduleController.updateModule);
router.delete('/modules/:id', authorize('super_admin'), moduleController.deleteModule);

// ==========================================
// WORKSPACE ROUTES (Super Admin only for management)
// ==========================================

/**
 * @swagger
 * /api/workspaces:
 *   get:
 *     summary: Get all workspaces (Admin only)
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all workspaces
 */
router.get('/', authorize('super_admin', 'sub_admin'), workspaceController.getWorkspaces);

/**
 * @swagger
 * /api/workspaces/{id}:
 *   get:
 *     summary: Get single workspace details
 *     tags: [Workspaces]
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
 *         description: Workspace details retrieved
 */
router.get('/:id', workspaceController.getWorkspace);

/**
 * @swagger
 * /api/workspaces:
 *   post:
 *     summary: Create a new workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Workspace created
 */
router.post('/', authorize('super_admin'), workspaceController.createWorkspace);

router.put('/:id', authorize('super_admin'), workspaceController.updateWorkspace);
router.delete('/:id', authorize('super_admin'), workspaceController.deleteWorkspace);

// Workspaces module and user management
router.post('/:id/modules', authorize('super_admin'), workspaceController.addModuleToWorkspace);
router.put('/:id/modules/:moduleCode', authorize('super_admin'), workspaceController.updateWorkspaceModule);
router.delete('/:id/modules/:moduleCode', authorize('super_admin'), workspaceController.removeModuleFromWorkspace);
router.get('/:id/users', authorize('super_admin', 'sub_admin'), workspaceController.getWorkspaceUsers);
router.post('/:id/assign', authorize('super_admin', 'sub_admin'), workspaceController.assignUserToWorkspace);
router.delete('/:id/users/:userId', authorize('super_admin', 'sub_admin'), workspaceController.removeUserFromWorkspace);

module.exports = router;

