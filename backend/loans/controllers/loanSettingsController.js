const LoanSettings = require('../model/LoanSettings');
const User = require('../../users/model/User');

/**
 * Loan Settings Controller
 * Manages loan/salary advance settings, workflow configuration, and workspace permissions
 */

// Default statuses for loans
const DEFAULT_STATUSES = [
  { code: 'draft', name: 'Draft', description: 'Not yet submitted', color: '#9ca3af', canEmployeeEdit: true, canEmployeeCancel: true, sortOrder: 1 },
  { code: 'pending', name: 'Pending', description: 'Awaiting approval', color: '#f59e0b', canEmployeeEdit: true, canEmployeeCancel: true, sortOrder: 2 },
  { code: 'hod_approved', name: 'HOD Approved', description: 'Approved by HOD, pending HR', color: '#3b82f6', canEmployeeEdit: false, canEmployeeCancel: true, sortOrder: 3 },
  { code: 'hod_rejected', name: 'HOD Rejected', description: 'Rejected by HOD', color: '#ef4444', isFinal: true, sortOrder: 4 },
  { code: 'hr_approved', name: 'HR Approved', description: 'Approved by HR, pending final', color: '#10b981', canEmployeeEdit: false, canEmployeeCancel: false, sortOrder: 5 },
  { code: 'hr_rejected', name: 'HR Rejected', description: 'Rejected by HR', color: '#ef4444', isFinal: true, sortOrder: 6 },
  { code: 'approved', name: 'Approved', description: 'Finally approved', color: '#10b981', isFinal: true, isApproved: true, sortOrder: 7 },
  { code: 'rejected', name: 'Rejected', description: 'Finally rejected', color: '#ef4444', isFinal: true, sortOrder: 8 },
  { code: 'cancelled', name: 'Cancelled', description: 'Cancelled by employee', color: '#6b7280', isFinal: true, sortOrder: 9 },
  { code: 'disbursed', name: 'Disbursed', description: 'Loan disbursed to employee', color: '#8b5cf6', isFinal: false, sortOrder: 10 },
  { code: 'active', name: 'Active', description: 'Loan is active and being repaid', color: '#10b981', isFinal: false, sortOrder: 11 },
  { code: 'completed', name: 'Completed', description: 'Loan fully repaid', color: '#059669', isFinal: true, isApproved: true, sortOrder: 12 },
];

// Default workflow
const DEFAULT_WORKFLOW = {
  isEnabled: true,
  useDynamicWorkflow: false,
  steps: [
    {
      stepOrder: 1,
      stepName: 'HOD Approval',
      approverRole: 'hod',
      availableActions: ['approve', 'reject', 'forward', 'return'],
      approvedStatus: 'hod_approved',
      rejectedStatus: 'hod_rejected',
      nextStepOnApprove: 2,
      isActive: true,
    },
    {
      stepOrder: 2,
      stepName: 'HR Approval',
      approverRole: 'hr',
      availableActions: ['approve', 'reject', 'return'],
      approvedStatus: 'approved',
      rejectedStatus: 'hr_rejected',
      nextStepOnApprove: null, // Final step
      isActive: true,
    },
  ],
  finalAuthority: {
    role: 'hr',
    anyHRCanApprove: true,
    authorizedHRUsers: [],
  },
};

// @desc    Get settings for loan or salary_advance
// @route   GET /api/loans/settings/:type
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['loan', 'salary_advance'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "loan" or "salary_advance"',
      });
    }

    let settings = await LoanSettings.findOne({ type, isActive: true });

    // If no settings exist, return defaults
    if (!settings) {
      settings = {
        type,
        statuses: DEFAULT_STATUSES,
        workflow: {
          ...DEFAULT_WORKFLOW,
          useDynamicWorkflow: false, // Default to static workflow
        },
        settings: {
          maxAmount: null,
          minAmount: 1000,
          maxDuration: 60,
          minDuration: 1,
          interestRate: 0,
          isInterestApplicable: false,
          maxPerEmployee: null,
          maxActivePerEmployee: 1,
          eligibleDepartments: [],
          eligibleDesignations: [],
          minServicePeriod: 0,
          sendEmailNotifications: true,
          notifyOnStatusChange: true,
          notifyApproverOnNew: true,
          workspacePermissions: {},
        },
        isDefault: true, // Flag to indicate these are default settings
      };
    }

    // Ensure workspacePermissions is included in response
    if (settings.settings && !settings.settings.workspacePermissions) {
      settings.settings.workspacePermissions = {};
    }

    console.log('[GetLoanSettings] Returning settings with workspacePermissions:', JSON.stringify(settings.settings?.workspacePermissions, null, 2));

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching loan settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

// @desc    Create or update settings
// @route   POST /api/loans/settings/:type
// @route   PUT /api/loans/settings/:type
// @access  Private (Super Admin)
exports.saveSettings = async (req, res) => {
  try {
    const { type } = req.params;
    const { statuses, workflow, settings } = req.body;

    console.log('=== Save Loan Settings Request ===');
    console.log('Type:', type);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Settings received:', JSON.stringify(settings, null, 2));

    if (!['loan', 'salary_advance'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "loan" or "salary_advance"',
      });
    }

    // Find existing settings or create new
    let loanSettings = await LoanSettings.findOne({ type, isActive: true });

    if (!loanSettings) {
      loanSettings = new LoanSettings({
        type,
        statuses: statuses || DEFAULT_STATUSES,
        workflow: workflow || DEFAULT_WORKFLOW,
        settings: settings || {},
        createdBy: req.user._id,
      });
    } else {
      // Update existing
      loanSettings.updatedBy = req.user._id;
      
      if (statuses) {
        loanSettings.statuses = statuses;
      }
      
      if (workflow) {
        loanSettings.workflow = workflow;
      }
      
      if (settings) {
        // Deep merge settings to preserve workspacePermissions
        const existingSettings = loanSettings.settings || {};
        const mergedSettings = {
          ...existingSettings,
          ...settings,
          // Preserve workspacePermissions by merging
          workspacePermissions: {
            ...(existingSettings.workspacePermissions || {}),
            ...(settings.workspacePermissions || {}),
          },
        };
        
        console.log('Existing settings:', JSON.stringify(existingSettings, null, 2));
        console.log('Merged settings:', JSON.stringify(mergedSettings, null, 2));
        
        loanSettings.settings = mergedSettings;
        
        // Explicitly mark nested objects as modified
        loanSettings.markModified('settings');
        loanSettings.markModified('settings.workspacePermissions');
      }
    }

    await loanSettings.save();

    console.log('Settings saved successfully');

    res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      data: loanSettings,
    });
  } catch (error) {
    console.error('Error saving loan settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};

// @desc    Get users for workflow configuration
// @route   GET /api/loans/settings/:type/users
// @access  Private (Super Admin)
exports.getUsersForWorkflow = async (req, res) => {
  try {
    const { role } = req.query;
    
    // Build query
    const query = { isActive: true };
    if (role) {
      query.role = role;
    }

    // Get users with their roles
    const users = await User.find(query)
      .select('name email role department')
      .populate('department', 'name')
      .sort({ name: 1 });

    // Group users by role
    const usersByRole = {};
    users.forEach(user => {
      const userRole = user.role || 'employee';
      if (!usersByRole[userRole]) {
        usersByRole[userRole] = [];
      }
      usersByRole[userRole].push({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      });
    });

    res.status(200).json({
      success: true,
      data: {
        users,
        usersByRole,
      },
    });
  } catch (error) {
    console.error('Error fetching users for workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch users',
    });
  }
};

// @desc    Get workflow configuration
// @route   GET /api/loans/settings/:type/workflow
// @access  Private
exports.getWorkflow = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['loan', 'salary_advance'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "loan" or "salary_advance"',
      });
    }

    const settings = await LoanSettings.findOne({ type, isActive: true });
    
    if (!settings) {
      return res.status(200).json({
        success: true,
        data: DEFAULT_WORKFLOW,
      });
    }

    res.status(200).json({
      success: true,
      data: settings.workflow || DEFAULT_WORKFLOW,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workflow',
    });
  }
};

// @desc    Update workflow configuration
// @route   PUT /api/loans/settings/:type/workflow
// @access  Private (Super Admin)
exports.updateWorkflow = async (req, res) => {
  try {
    const { type } = req.params;
    const workflow = req.body;

    if (!['loan', 'salary_advance'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "loan" or "salary_advance"',
      });
    }

    let loanSettings = await LoanSettings.findOne({ type, isActive: true });

    if (!loanSettings) {
      loanSettings = new LoanSettings({
        type,
        workflow: workflow || DEFAULT_WORKFLOW,
        statuses: DEFAULT_STATUSES,
        settings: {},
        createdBy: req.user._id,
      });
    } else {
      loanSettings.workflow = workflow || loanSettings.workflow;
      loanSettings.updatedBy = req.user._id;
      loanSettings.markModified('workflow');
    }

    await loanSettings.save();

    res.status(200).json({
      success: true,
      message: 'Workflow updated successfully',
      data: loanSettings.workflow,
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update workflow',
    });
  }
};

