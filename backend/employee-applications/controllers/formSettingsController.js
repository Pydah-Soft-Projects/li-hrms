/**
 * Employee Application Form Settings Controller
 * Manages dynamic form configuration
 */

const EmployeeApplicationFormSettings = require('../model/EmployeeApplicationFormSettings');

/**
 * @desc    Get active form settings
 * @route   GET /api/employee-applications/form-settings
 * @access  Private
 */
exports.getSettings = async (req, res) => {
  try {
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    const settingsObj = settings.toObject();

    // Ensure DOJ is present in basic_info for existing settings
    const basicInfoGroup = settingsObj.groups.find((g) => g.id === 'basic_info');
    if (basicInfoGroup && !basicInfoGroup.fields.some((f) => f.id === 'doj')) {
      const dojField = {
        id: 'doj',
        label: 'Date of Joining',
        type: 'date',
        dataType: 'date',
        isRequired: false,
        isSystem: true,
        dateFormat: 'dd-mm-yyyy',
        order: 5,
        isEnabled: true,
      };

      // Find proposedSalary to adjust its order
      const proposedSalary = basicInfoGroup.fields.find((f) => f.id === 'proposedSalary');
      if (proposedSalary && proposedSalary.order <= 5) {
        proposedSalary.order = 6;
      }

      basicInfoGroup.fields.push(dojField);
      basicInfoGroup.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    // Ensure Email is present in contact_info for existing settings
    const contactInfoGroup = settingsObj.groups.find((g) => g.id === 'contact_info');
    if (contactInfoGroup && !contactInfoGroup.fields.some((f) => f.id === 'email')) {
      const emailField = {
        id: 'email',
        label: 'Email',
        type: 'email',
        dataType: 'string',
        isRequired: false,
        isSystem: true,
        placeholder: 'example@email.com',
        order: 2,
        isEnabled: true,
      };
      contactInfoGroup.fields.push(emailField);
      contactInfoGroup.fields.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    res.status(200).json({
      success: true,
      data: settingsObj,
    });
  } catch (error) {
    console.error('Error fetching form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Initialize default form settings
 * @route   POST /api/employee-applications/form-settings/initialize
 * @access  Private (Super Admin, Sub Admin)
 */
exports.initializeSettings = async (req, res) => {
  try {
    const settings = await EmployeeApplicationFormSettings.initializeDefault(req.user._id);

    res.status(201).json({
      success: true,
      message: 'Form settings initialized successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error initializing form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Update form settings
 * @route   PUT /api/employee-applications/form-settings
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateSettings = async (req, res) => {
  try {
    const { groups } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    // Validate groups structure
    if (groups && Array.isArray(groups)) {
      // Ensure system groups are preserved
      const systemGroupIds = ['basic_info', 'personal_info', 'contact_info', 'bank_details'];
      const existingSystemGroups = settings.groups.filter((g) => systemGroupIds.includes(g.id));

      // Merge system groups with new groups
      const newGroups = groups.map((group) => {
        const existingSystemGroup = existingSystemGroups.find((g) => g.id === group.id);
        if (existingSystemGroup && existingSystemGroup.isSystem) {
          // Preserve system group structure but allow label updates
          return {
            ...existingSystemGroup.toObject(),
            label: group.label || existingSystemGroup.label,
            description: group.description || existingSystemGroup.description,
            order: group.order !== undefined ? group.order : existingSystemGroup.order,
            isEnabled: group.isEnabled !== undefined ? group.isEnabled : existingSystemGroup.isEnabled,
            // Update field labels but preserve system field structure
            fields: group.fields
              ? group.fields.map((field) => {
                const existingField = existingSystemGroup.fields.find((f) => f.id === field.id);
                if (existingField && existingField.isSystem) {
                  return {
                    ...existingField.toObject(),
                    label: field.label || existingField.label,
                    placeholder: field.placeholder !== undefined ? field.placeholder : existingField.placeholder,
                    order: field.order !== undefined ? field.order : existingField.order,
                    isEnabled: field.isEnabled !== undefined ? field.isEnabled : existingField.isEnabled,
                  };
                }
                return field;
              })
              : existingSystemGroup.fields,
          };
        }
        return group;
      });

      settings.groups = newGroups;
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Form settings updated successfully',
      data: settings,
    });
  } catch (error) {
    console.error('Error updating form settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form settings',
      error: error.message,
    });
  }
};

/**
 * @desc    Add new group
 * @route   POST /api/employee-applications/form-settings/groups
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addGroup = async (req, res) => {
  try {
    const { id, label, description, isArray, order, fields } = req.body;

    if (!id || !label) {
      return res.status(400).json({
        success: false,
        message: 'Group ID and label are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found. Please initialize settings first.',
      });
    }

    // Check if group already exists
    if (settings.groups.some((g) => g.id === id)) {
      return res.status(400).json({
        success: false,
        message: 'Group with this ID already exists',
      });
    }

    const newGroup = {
      id,
      label,
      description: description || '',
      isSystem: false,
      isArray: isArray || false,
      order: order !== undefined ? order : settings.groups.length + 1,
      isEnabled: true,
      fields: fields || [],
    };

    settings.groups.push(newGroup);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Group added successfully',
      data: newGroup,
    });
  } catch (error) {
    console.error('Error adding group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add group',
      error: error.message,
    });
  }
};

/**
 * @desc    Update group
 * @route   PUT /api/employee-applications/form-settings/groups/:groupId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { label, description, isArray, order, isEnabled } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Cannot modify system groups structure, only labels
    if (group.isSystem) {
      if (label !== undefined) group.label = label;
      if (description !== undefined) group.description = description;
      if (order !== undefined) group.order = order;
      if (isEnabled !== undefined) group.isEnabled = isEnabled;
      // Cannot change isArray for system groups
    } else {
      // Custom groups can be fully modified
      if (label !== undefined) group.label = label;
      if (description !== undefined) group.description = description;
      if (isArray !== undefined) group.isArray = isArray;
      if (order !== undefined) group.order = order;
      if (isEnabled !== undefined) group.isEnabled = isEnabled;
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Group updated successfully',
      data: group,
    });
  } catch (error) {
    console.error('Error updating group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update group',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete group
 * @route   DELETE /api/employee-applications/form-settings/groups/:groupId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const groupIndex = settings.groups.findIndex((g) => g.id === groupId);
    if (groupIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const group = settings.groups[groupIndex];

    // Cannot delete system groups
    if (group.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system group',
      });
    }

    settings.groups.splice(groupIndex, 1);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Group deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete group',
      error: error.message,
    });
  }
};

/**
 * @desc    Add field to group
 * @route   POST /api/employee-applications/form-settings/groups/:groupId/fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addField = async (req, res) => {
  try {
    const { groupId } = req.params;
    const fieldData = req.body;

    if (!fieldData.id || !fieldData.label || !fieldData.type || !fieldData.dataType) {
      return res.status(400).json({
        success: false,
        message: 'Field ID, label, type, and dataType are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    // Cannot add fields to system groups (only system fields allowed)
    if (group.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot add custom fields to system groups',
      });
    }

    // Check if field already exists
    if (group.fields.some((f) => f.id === fieldData.id)) {
      return res.status(400).json({
        success: false,
        message: 'Field with this ID already exists in this group',
      });
    }

    const newField = {
      ...fieldData,
      isSystem: false,
      isEnabled: fieldData.isEnabled !== undefined ? fieldData.isEnabled : true,
      order: fieldData.order !== undefined ? fieldData.order : group.fields.length + 1,
    };

    group.fields.push(newField);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Field added successfully',
      data: newField,
    });
  } catch (error) {
    console.error('Error adding field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update field in group
 * @route   PUT /api/employee-applications/form-settings/groups/:groupId/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateField = async (req, res) => {
  try {
    const { groupId, fieldId } = req.params;
    const fieldData = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const fieldIndex = group.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Field not found',
      });
    }

    const field = group.fields[fieldIndex];

    // System fields: only label, placeholder, order, isEnabled can be changed
    if (field.isSystem) {
      if (fieldData.label !== undefined) field.label = fieldData.label;
      if (fieldData.placeholder !== undefined) field.placeholder = fieldData.placeholder;
      if (fieldData.order !== undefined) field.order = fieldData.order;
      if (fieldData.isEnabled !== undefined) field.isEnabled = fieldData.isEnabled;
    } else {
      // Custom fields: can be fully modified
      Object.keys(fieldData).forEach((key) => {
        if (key !== 'id' && key !== 'isSystem') {
          field[key] = fieldData[key];
        }
      });
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Field updated successfully',
      data: field,
    });
  } catch (error) {
    console.error('Error updating field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update field',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete field from group
 * @route   DELETE /api/employee-applications/form-settings/groups/:groupId/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteField = async (req, res) => {
  try {
    const { groupId, fieldId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    const group = settings.groups.find((g) => g.id === groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found',
      });
    }

    const fieldIndex = group.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Field not found',
      });
    }

    const field = group.fields[fieldIndex];

    // Cannot delete system fields
    if (field.isSystem) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete system field',
      });
    }

    group.fields.splice(fieldIndex, 1);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Field deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update qualifications configuration (enable/disable and certificate upload)
 * @route   PUT /api/employee-applications/form-settings/qualifications
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateQualificationsConfig = async (req, res) => {
  try {
    const { isEnabled, enableCertificateUpload } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications) {
      settings.qualifications = { isEnabled: true, enableCertificateUpload: false, fields: [] };
    }

    // Update fields if provided
    if (isEnabled !== undefined) {
      settings.qualifications.isEnabled = isEnabled;
    }
    if (enableCertificateUpload !== undefined) {
      settings.qualifications.enableCertificateUpload = enableCertificateUpload;
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    console.log('[Form Settings] Qualifications config updated:', {
      isEnabled: settings.qualifications.isEnabled,
      enableCertificateUpload: settings.qualifications.enableCertificateUpload,
    });

    res.status(200).json({
      success: true,
      message: 'Qualifications configuration updated successfully',
      data: settings.qualifications,
    });
  } catch (error) {
    console.error('Error updating qualifications config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update qualifications configuration',
      error: error.message,
    });
  }
};

/**
 * @desc    Add field to qualifications
 * @route   POST /api/employee-applications/form-settings/qualifications/fields
 * @access  Private (Super Admin, Sub Admin)
 */
exports.addQualificationsField = async (req, res) => {
  try {
    const { id, label, type, isRequired, isEnabled, placeholder, validation, options, order } = req.body;

    if (!id || !label || !type) {
      return res.status(400).json({
        success: false,
        message: 'Field id, label, and type are required',
      });
    }

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications) {
      settings.qualifications = { isEnabled: true, fields: [] };
    }

    // Check if field already exists
    const existingField = settings.qualifications.fields.find((f) => f.id === id);
    if (existingField) {
      return res.status(400).json({
        success: false,
        message: 'Field with this id already exists',
      });
    }

    const newField = {
      id,
      label,
      type,
      isRequired: isRequired || false,
      isEnabled: isEnabled !== undefined ? isEnabled : true,
      placeholder: placeholder || '',
      validation: validation || {},
      options: options || [],
      order: order || settings.qualifications.fields.length + 1,
    };

    settings.qualifications.fields.push(newField);
    settings.qualifications.fields.sort((a, b) => a.order - b.order);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(201).json({
      success: true,
      message: 'Qualifications field added successfully',
      data: newField,
    });
  } catch (error) {
    console.error('Error adding qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Update qualifications field
 * @route   PUT /api/employee-applications/form-settings/qualifications/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.updateQualificationsField = async (req, res) => {
  try {
    const { fieldId } = req.params;
    const { label, isRequired, isEnabled, placeholder, validation, options, order } = req.body;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications || !settings.qualifications.fields) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications fields not found',
      });
    }

    const field = settings.qualifications.fields.find((f) => f.id === fieldId);
    if (!field) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications field not found',
      });
    }

    // Update allowed fields
    if (label !== undefined) field.label = label;
    if (isRequired !== undefined) field.isRequired = isRequired;
    if (isEnabled !== undefined) field.isEnabled = isEnabled;
    if (placeholder !== undefined) field.placeholder = placeholder;
    if (validation !== undefined) field.validation = { ...field.validation, ...validation };
    if (options !== undefined) field.options = options;
    if (order !== undefined) {
      field.order = order;
      settings.qualifications.fields.sort((a, b) => a.order - b.order);
    }

    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Qualifications field updated successfully',
      data: field,
    });
  } catch (error) {
    console.error('Error updating qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update qualifications field',
      error: error.message,
    });
  }
};

/**
 * @desc    Delete qualifications field
 * @route   DELETE /api/employee-applications/form-settings/qualifications/fields/:fieldId
 * @access  Private (Super Admin, Sub Admin)
 */
exports.deleteQualificationsField = async (req, res) => {
  try {
    const { fieldId } = req.params;

    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Form settings not found',
      });
    }

    if (!settings.qualifications || !settings.qualifications.fields) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications fields not found',
      });
    }

    const fieldIndex = settings.qualifications.fields.findIndex((f) => f.id === fieldId);
    if (fieldIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Qualifications field not found',
      });
    }

    settings.qualifications.fields.splice(fieldIndex, 1);
    settings.updatedBy = req.user._id;
    settings.version = (settings.version || 1) + 1;

    await settings.save();

    res.status(200).json({
      success: true,
      message: 'Qualifications field deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting qualifications field:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete qualifications field',
      error: error.message,
    });
  }
};

