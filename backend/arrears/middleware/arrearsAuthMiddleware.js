const User = require('../../users/model/User');
const ArrearsRequest = require('../model/ArrearsRequest');

/**
 * Middleware to check if user can create arrears
 * Only HR, Sub Admin, and Super Admin can create arrears
 */
exports.canCreateArrears = async (req, res, next) => {
  try {
    const allowedRoles = ['super_admin', 'sub_admin', 'hr'];
    if (!allowedRoles.includes(req.user.role) && !req.user.roles?.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to create arrears'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to check if user can approve arrears at HOD level
 * Only HOD and above can approve at HOD level
 */
exports.canHodApprove = async (req, res, next) => {
  try {
    const allowedRoles = ['super_admin', 'sub_admin', 'hod'];
    if (!allowedRoles.includes(req.user.role) && !req.user.roles?.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve arrears at HOD level'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to check if user can approve arrears at HR level
 * Only HR, Sub Admin, and Super Admin can approve at HR level
 */
exports.canHrApprove = async (req, res, next) => {
  try {
    const allowedRoles = ['super_admin', 'sub_admin', 'hr'];
    if (!allowedRoles.includes(req.user.role) && !req.user.roles?.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve arrears at HR level'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to check if user can approve arrears at Admin level (final approval)
 * Only Super Admin and Sub Admin can approve at Admin level
 */
exports.canAdminApprove = async (req, res, next) => {
  try {
    const allowedRoles = ['super_admin', 'sub_admin'];
    if (!allowedRoles.includes(req.user.role) && !req.user.roles?.some(r => allowedRoles.includes(r))) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to approve arrears at Admin level'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to check if arrears can be edited
 * Only draft arrears can be edited by the creator
 */
exports.canEditArrears = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Only creator or admin can edit
    const isCreator = arrears.createdBy.toString() === req.user._id.toString();
    const isAdmin = ['super_admin', 'sub_admin'].includes(req.user.role) || req.user.roles?.some(r => ['super_admin', 'sub_admin'].includes(r));

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this arrears'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to check if arrears can be deleted
 * Only draft arrears can be deleted
 */
exports.canDeleteArrears = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Only creator or admin can delete
    const isCreator = arrears.createdBy.toString() === req.user._id.toString();
    const isAdmin = ['super_admin', 'sub_admin'].includes(req.user.role) || req.user.roles?.some(r => ['super_admin', 'sub_admin'].includes(r));

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this arrears'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware to prevent editing of approved arrears
 * After admin approval, only splitting is allowed
 */
exports.preventEditAfterApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const arrears = await ArrearsRequest.findById(id);

    if (!arrears) {
      return res.status(404).json({
        success: false,
        message: 'Arrears not found'
      });
    }

    // After admin approval, no editing is allowed (only splitting during payroll)
    if (arrears.status === 'approved' || arrears.status === 'partially_settled' || arrears.status === 'settled') {
      return res.status(403).json({
        success: false,
        message: 'Approved arrears cannot be edited. Only splitting is allowed during payroll processing.'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
