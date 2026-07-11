const mongoose = require('mongoose');
const QualificationProfile = require('../model/QualificationProfile');
const EmployeeApplicationFormSettings = require('../model/EmployeeApplicationFormSettings');
const {
  resolveQualificationProfile,
  normalizeProfilePayload,
  cloneQualificationsConfig,
  migrateLegacyQualificationProfiles,
} = require('../services/qualificationProfileService');
const {
  validateScopePayload,
  SCOPE_LABELS,
  normalizeScopeId,
  buildResolveQuery,
  profileMatchesResolveQuery,
  inferLegacyScopeType,
} = require('../services/qualificationProfileScope');

/**
 * @route GET /api/employee-applications/qualification-profiles/resolve
 */
exports.resolveProfile = async (req, res) => {
  try {
    const { division_id, department_id, designation_id } = req.query;
    const resolved = await resolveQualificationProfile(division_id, department_id, designation_id);
    res.status(200).json({ success: true, data: resolved });
  } catch (error) {
    console.error('[resolveProfile]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve qualification profile',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/employee-applications/qualification-profiles/scope-types
 */
exports.listScopeTypes = async (req, res) => {
  res.status(200).json({
    success: true,
    data: Object.entries(SCOPE_LABELS).map(([value, label]) => ({ value, label })),
  });
};

/**
 * @route GET /api/employee-applications/qualification-profiles
 */
exports.listProfiles = async (req, res) => {
  try {
    await migrateLegacyQualificationProfiles();
    const profiles = await QualificationProfile.find({ isActive: true })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .sort({ updatedAt: -1 })
      .lean();

    const data = profiles.map((p) => ({
      ...p,
      scopeLabel: SCOPE_LABELS[p.scopeType || inferLegacyScopeType(p)] || p.scopeType,
    }));

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[listProfiles]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list qualification profiles',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/employee-applications/qualification-profiles/:id
 */
exports.getProfile = async (req, res) => {
  try {
    const profile = await QualificationProfile.findById(req.params.id)
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .lean();

    if (!profile || !profile.isActive) {
      return res.status(404).json({ success: false, message: 'Qualification profile not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        ...profile,
        scopeLabel: SCOPE_LABELS[profile.scopeType] || profile.scopeType,
      },
    });
  } catch (error) {
    console.error('[getProfile]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get qualification profile',
      error: error.message,
    });
  }
};

/**
 * @route GET /api/employee-applications/qualification-profiles/lookup
 */
exports.lookupProfile = async (req, res) => {
  try {
    const scopeType = req.query.scopeType != null ? String(req.query.scopeType).trim() : '';
    const validated = validateScopePayload({
      scopeType: scopeType || 'department_designation',
      division_id: req.query.division_id,
      department_id: req.query.department_id,
      designation_id: req.query.designation_id,
    });
    if (!validated.ok) {
      return res.status(400).json({ success: false, message: validated.error });
    }

    const query = buildResolveQuery(validated.scopeType, {
      division_id: validated.division_id,
      department_id: validated.department_id,
      designation_id: validated.designation_id,
    });

    let profile = await QualificationProfile.findOne({ ...query, isActive: true })
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code')
      .lean();

    if (!profile && validated.scopeType === 'department_designation') {
      profile = await QualificationProfile.findOne({
        isActive: true,
        department_id: validated.department_id,
        designation_id: validated.designation_id,
        scopeType: { $exists: false },
      })
        .populate('division_id', 'name code')
        .populate('department_id', 'name code')
        .populate('designation_id', 'name code')
        .lean();
    }

    res.status(200).json({ success: true, data: profile || null });
  } catch (error) {
    console.error('[lookupProfile]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to lookup qualification profile',
      error: error.message,
    });
  }
};

/**
 * @route POST /api/employee-applications/qualification-profiles
 */
exports.upsertProfile = async (req, res) => {
  try {
    const validated = validateScopePayload(req.body);
    if (!validated.ok) {
      return res.status(400).json({ success: false, message: validated.error });
    }

    for (const field of ['division_id', 'department_id', 'designation_id']) {
      const val = validated[field];
      if (val && !mongoose.Types.ObjectId.isValid(val)) {
        return res.status(400).json({ success: false, message: `Invalid ${field}` });
      }
    }

    const normalized = normalizeProfilePayload(req.body);

    const profile = await QualificationProfile.findOneAndUpdate(
      { scopeKey: validated.scopeKey },
      {
        $set: {
          ...normalized,
          scopeType: validated.scopeType,
          scopeKey: validated.scopeKey,
          division_id: validated.division_id,
          department_id: validated.department_id,
          designation_id: validated.designation_id,
          isActive: true,
          updatedBy: req.user?._id || null,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
      .populate('division_id', 'name code')
      .populate('department_id', 'name code')
      .populate('designation_id', 'name code');

    res.status(200).json({
      success: true,
      message: 'Qualification profile saved',
      data: profile,
    });
  } catch (error) {
    console.error('[upsertProfile]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save qualification profile',
      error: error.message,
    });
  }
};

/**
 * @route DELETE /api/employee-applications/qualification-profiles/:id
 */
exports.deleteProfile = async (req, res) => {
  try {
    const profile = await QualificationProfile.findById(req.params.id);
    if (!profile || !profile.isActive) {
      return res.status(404).json({ success: false, message: 'Qualification profile not found' });
    }

    profile.isActive = false;
    profile.updatedBy = req.user?._id || null;
    await profile.save();

    res.status(200).json({ success: true, message: 'Qualification profile deleted' });
  } catch (error) {
    console.error('[deleteProfile]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete qualification profile',
      error: error.message,
    });
  }
};

/**
 * @route GET|POST /api/employee-applications/qualification-profiles/copy-from-global
 */
exports.copyFromGlobal = async (req, res) => {
  try {
    const settings = await EmployeeApplicationFormSettings.getActiveSettings();
    const globalQual = cloneQualificationsConfig(settings?.qualifications);
    res.status(200).json({ success: true, data: globalQual });
  } catch (error) {
    console.error('[copyFromGlobal]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load global qualifications config',
      error: error.message,
    });
  }
};
