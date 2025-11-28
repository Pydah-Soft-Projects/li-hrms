const LeaveSettings = require('../model/LeaveSettings');

/**
 * Leave Settings Controller
 * Manages leave/OD types, statuses, and workflow configuration
 */

// Default leave types
const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', description: 'Short term personal leave', maxDaysPerYear: 12, isPaid: true, color: '#3b82f6', sortOrder: 1 },
  { code: 'SL', name: 'Sick Leave', description: 'Leave due to illness', maxDaysPerYear: 12, requiresAttachment: true, isPaid: true, color: '#ef4444', sortOrder: 2 },
  { code: 'EL', name: 'Earned Leave', description: 'Annual leave earned over time', maxDaysPerYear: 15, carryForward: true, maxCarryForward: 30, isPaid: true, color: '#10b981', sortOrder: 3 },
  { code: 'ML', name: 'Maternity Leave', description: 'Maternity leave', maxDaysPerYear: 180, requiresAttachment: true, isPaid: true, color: '#ec4899', sortOrder: 4 },
  { code: 'PL', name: 'Paternity Leave', description: 'Paternity leave', maxDaysPerYear: 15, isPaid: true, color: '#8b5cf6', sortOrder: 5 },
  { code: 'CO', name: 'Compensatory Off', description: 'Leave for extra work hours', maxDaysPerYear: null, isPaid: true, color: '#f59e0b', sortOrder: 6 },
  { code: 'LWP', name: 'Leave Without Pay', description: 'Unpaid leave', maxDaysPerYear: null, isPaid: false, color: '#6b7280', sortOrder: 7 },
];

// Default OD types
const DEFAULT_OD_TYPES = [
  { code: 'OW', name: 'Official Work', description: 'Official work outside office', color: '#3b82f6', sortOrder: 1 },
  { code: 'TR', name: 'Training', description: 'Training or workshop attendance', color: '#10b981', sortOrder: 2 },
  { code: 'MT', name: 'Meeting', description: 'External meeting', color: '#8b5cf6', sortOrder: 3 },
  { code: 'CV', name: 'Client Visit', description: 'Client site visit', color: '#f59e0b', sortOrder: 4 },
  { code: 'CF', name: 'Conference', description: 'Conference or seminar attendance', color: '#ec4899', sortOrder: 5 },
  { code: 'FW', name: 'Fieldwork', description: 'Field work or site visit', color: '#06b6d4', sortOrder: 6 },
  { code: 'OT', name: 'Other', description: 'Other official duty', color: '#6b7280', sortOrder: 7 },
];

// Default statuses
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
];

// Default workflow
const DEFAULT_WORKFLOW = {
  isEnabled: true,
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

// @desc    Get settings for leave or OD
// @route   GET /api/leaves/settings/:type
// @access  Private
exports.getSettings = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "leave" or "od"',
      });
    }

    let settings = await LeaveSettings.findOne({ type, isActive: true });

    // If no settings exist, return defaults
    if (!settings) {
      settings = {
        type,
        types: type === 'leave' ? DEFAULT_LEAVE_TYPES : DEFAULT_OD_TYPES,
        statuses: DEFAULT_STATUSES,
        workflow: DEFAULT_WORKFLOW,
        settings: {
          allowBackdated: false,
          maxBackdatedDays: 7,
          allowFutureDated: true,
          maxAdvanceDays: 90,
          countWeekends: false,
          countHolidays: false,
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

    console.log('[GetSettings] Returning settings with workspacePermissions:', JSON.stringify(settings.settings?.workspacePermissions, null, 2));

    res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch settings',
    });
  }
};

// @desc    Create or update settings
// @route   POST /api/leaves/settings/:type
// @access  Private (Super Admin)
exports.saveSettings = async (req, res) => {
  try {
    const { type } = req.params;
    const { types, statuses, workflow, settings } = req.body;

    console.log('=== Save Settings Request ===');
    console.log('Type:', type);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Settings received:', JSON.stringify(settings, null, 2));

    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "leave" or "od"',
      });
    }

    // Find existing or create new
    let leaveSettings = await LeaveSettings.findOne({ type });

    console.log('Existing settings found:', !!leaveSettings);
    if (leaveSettings) {
      console.log('Existing settings.settings:', JSON.stringify(leaveSettings.settings, null, 2));
    }

    if (leaveSettings) {
      // Update existing
      if (types) leaveSettings.types = types;
      if (statuses) leaveSettings.statuses = statuses;
      if (workflow) leaveSettings.workflow = workflow;
      if (settings) {
        // Deep merge settings to preserve existing properties
        const existingSettings = leaveSettings.settings || {};
        const newSettings = { ...existingSettings };
        
        // Merge all settings properties, including workspacePermissions
        Object.keys(settings).forEach(key => {
          if (key === 'workspacePermissions' && settings[key]) {
            // Deep merge workspacePermissions object
            newSettings.workspacePermissions = {
              ...(existingSettings.workspacePermissions || {}),
              ...settings.workspacePermissions,
            };
          } else {
            newSettings[key] = settings[key];
          }
        });
        
        leaveSettings.settings = newSettings;
        // Mark settings as modified to ensure Mongoose saves nested objects
        leaveSettings.markModified('settings');
        if (settings.workspacePermissions) {
          leaveSettings.markModified('settings.workspacePermissions');
        }
        console.log('Merged settings.settings:', JSON.stringify(leaveSettings.settings, null, 2));
        console.log('WorkspacePermissions after merge:', JSON.stringify(leaveSettings.settings.workspacePermissions, null, 2));
      }
      leaveSettings.updatedBy = req.user._id;
    } else {
      // Create new
      leaveSettings = new LeaveSettings({
        type,
        types: types || (type === 'leave' ? DEFAULT_LEAVE_TYPES : DEFAULT_OD_TYPES),
        statuses: statuses || DEFAULT_STATUSES,
        workflow: workflow || DEFAULT_WORKFLOW,
        settings: settings || {},
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
    }

    await leaveSettings.save();
    console.log('Settings saved successfully');
    console.log('Final settings.settings:', JSON.stringify(leaveSettings.settings, null, 2));

    res.status(200).json({
      success: true,
      message: 'Settings saved successfully',
      data: leaveSettings,
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save settings',
    });
  }
};

// @desc    Get leave/OD types
// @route   GET /api/leaves/types/:type
// @access  Private
exports.getTypes = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
      });
    }

    const settings = await LeaveSettings.findOne({ type, isActive: true });
    const types = settings?.types || (type === 'leave' ? DEFAULT_LEAVE_TYPES : DEFAULT_OD_TYPES);

    // Filter to active types only
    const activeTypes = types.filter(t => t.isActive !== false);

    res.status(200).json({
      success: true,
      data: activeTypes,
    });
  } catch (error) {
    console.error('Error fetching types:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch types',
    });
  }
};

// @desc    Add a new leave/OD type
// @route   POST /api/leaves/types/:type
// @access  Private (Super Admin)
exports.addType = async (req, res) => {
  try {
    const { type } = req.params;
    const typeData = req.body;

    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
      });
    }

    let settings = await LeaveSettings.findOne({ type });

    if (!settings) {
      // Create settings with defaults plus new type
      settings = new LeaveSettings({
        type,
        types: type === 'leave' ? [...DEFAULT_LEAVE_TYPES, typeData] : [...DEFAULT_OD_TYPES, typeData],
        statuses: DEFAULT_STATUSES,
        workflow: DEFAULT_WORKFLOW,
        createdBy: req.user._id,
      });
    } else {
      // Check if code already exists
      if (settings.types.some(t => t.code === typeData.code)) {
        return res.status(400).json({
          success: false,
          error: 'Type with this code already exists',
        });
      }
      settings.types.push(typeData);
      settings.updatedBy = req.user._id;
    }

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Type added successfully',
      data: settings.types,
    });
  } catch (error) {
    console.error('Error adding type:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add type',
    });
  }
};

// @desc    Update workflow configuration
// @route   PUT /api/leaves/workflow/:type
// @access  Private (Super Admin)
exports.updateWorkflow = async (req, res) => {
  try {
    const { type } = req.params;
    const { workflow } = req.body;

    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
      });
    }

    let settings = await LeaveSettings.findOne({ type });

    if (!settings) {
      settings = new LeaveSettings({
        type,
        types: type === 'leave' ? DEFAULT_LEAVE_TYPES : DEFAULT_OD_TYPES,
        statuses: DEFAULT_STATUSES,
        workflow,
        createdBy: req.user._id,
      });
    } else {
      settings.workflow = workflow;
      settings.updatedBy = req.user._id;
    }

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Workflow updated successfully',
      data: settings.workflow,
    });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update workflow',
    });
  }
};

// @desc    Get workflow for a type
// @route   GET /api/leaves/workflow/:type
// @access  Private
exports.getWorkflow = async (req, res) => {
  try {
    const { type } = req.params;
    
    if (!['leave', 'od'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid type',
      });
    }

    const settings = await LeaveSettings.findOne({ type, isActive: true });
    const workflow = settings?.workflow || DEFAULT_WORKFLOW;

    res.status(200).json({
      success: true,
      data: workflow,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch workflow',
    });
  }
};

// @desc    Initialize default settings
// @route   POST /api/leaves/settings/initialize
// @access  Private (Super Admin)
exports.initializeSettings = async (req, res) => {
  try {
    // Check if settings already exist
    const existingLeave = await LeaveSettings.findOne({ type: 'leave' });
    const existingOD = await LeaveSettings.findOne({ type: 'od' });

    const results = [];

    if (!existingLeave) {
      const leaveSettings = new LeaveSettings({
        type: 'leave',
        types: DEFAULT_LEAVE_TYPES,
        statuses: DEFAULT_STATUSES,
        workflow: DEFAULT_WORKFLOW,
        settings: {
          allowBackdated: false,
          maxBackdatedDays: 7,
          allowFutureDated: true,
          maxAdvanceDays: 90,
          countWeekends: false,
          countHolidays: false,
          sendEmailNotifications: true,
          notifyOnStatusChange: true,
          notifyApproverOnNew: true,
        },
        createdBy: req.user._id,
      });
      await leaveSettings.save();
      results.push('Leave settings initialized');
    } else {
      results.push('Leave settings already exist');
    }

    if (!existingOD) {
      const odSettings = new LeaveSettings({
        type: 'od',
        types: DEFAULT_OD_TYPES,
        statuses: DEFAULT_STATUSES,
        workflow: DEFAULT_WORKFLOW,
        settings: {
          allowBackdated: true, // ODs are often applied after the fact
          maxBackdatedDays: 30,
          allowFutureDated: true,
          maxAdvanceDays: 90,
          sendEmailNotifications: true,
          notifyOnStatusChange: true,
          notifyApproverOnNew: true,
        },
        createdBy: req.user._id,
      });
      await odSettings.save();
      results.push('OD settings initialized');
    } else {
      results.push('OD settings already exist');
    }

    res.status(200).json({
      success: true,
      message: results.join('. '),
    });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initialize settings',
    });
  }
};

