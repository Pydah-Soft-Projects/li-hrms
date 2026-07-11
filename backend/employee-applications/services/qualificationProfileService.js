const EmployeeApplicationFormSettings = require('../model/EmployeeApplicationFormSettings');
const QualificationProfile = require('../model/QualificationProfile');
const {
  RESOLUTION_ORDER,
  normalizeScopeId,
  buildResolveQuery,
  profileMatchesResolveQuery,
  inferLegacyScopeType,
  buildScopeKey,
} = require('./qualificationProfileScope');

function cloneQualField(field) {
  if (!field || typeof field !== 'object') return null;
  const id = field.id != null ? String(field.id).trim() : '';
  const label = field.label != null ? String(field.label).trim() : '';
  if (!id || !label) return null;
  return {
    id,
    label,
    type: field.type || 'text',
    isRequired: !!field.isRequired,
    isEnabled: field.isEnabled !== false,
    placeholder: field.placeholder || '',
    validation:
      field.validation && typeof field.validation === 'object' ? { ...field.validation } : {},
    options: Array.isArray(field.options)
      ? field.options.map((o) => ({ label: o?.label ?? '', value: o?.value ?? '' }))
      : [],
    gridRows: Array.isArray(field.gridRows) ? [...field.gridRows] : undefined,
    order: field.order != null ? Number(field.order) : 0,
  };
}

function cloneQualificationsConfig(config) {
  const c = config || {};
  const fields = Array.isArray(c.fields)
    ? c.fields.map(cloneQualField).filter(Boolean)
    : [];
  fields.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    isEnabled: c.isEnabled !== false,
    enableCertificateUpload: !!c.enableCertificateUpload,
    fields,
    defaultRows: Array.isArray(c.defaultRows)
      ? c.defaultRows.map((r) => (r && typeof r === 'object' ? { ...r } : r))
      : [],
  };
}

function emptyGlobalQualificationsConfig() {
  return {
    isEnabled: true,
    enableCertificateUpload: false,
    fields: [],
    defaultRows: [],
  };
}

function buildSettingsWithResolvedQualifications(formSettings, resolved) {
  const base =
    formSettings && typeof formSettings.toObject === 'function'
      ? formSettings.toObject()
      : { ...(formSettings || {}) };
  const qual = cloneQualificationsConfig(resolved);
  return {
    ...base,
    qualifications: qual,
  };
}

function profileToResolved(profile, source, ctx = {}) {
  const qual = cloneQualificationsConfig(profile);
  return {
    source,
    scopeType: profile.scopeType || inferLegacyScopeType(profile),
    scopeKey: profile.scopeKey || null,
    profileId: profile._id,
    division_id: profile.division_id || ctx.division_id || null,
    department_id: profile.department_id || ctx.department_id || null,
    designation_id: profile.designation_id || ctx.designation_id || null,
    ...qual,
  };
}

function findProfileInList(profiles, scopeType, ctx) {
  const query = buildResolveQuery(scopeType, ctx);
  if (!query) return null;

  const hit = profiles.find((p) => {
    if (!p || p.isActive === false) return false;
    const effectiveType = p.scopeType || inferLegacyScopeType(p);
    if (effectiveType !== scopeType) return false;
    return profileMatchesResolveQuery(
      {
        scopeType: effectiveType,
        division_id: p.division_id,
        department_id: p.department_id,
        designation_id: p.designation_id,
      },
      query
    );
  });
  if (hit) return hit;

  if (scopeType === 'department_designation') {
    return profiles.find(
      (p) =>
        p &&
        p.isActive !== false &&
        !p.scopeType &&
        normalizeScopeId(p.department_id) === normalizeScopeId(ctx.department_id) &&
        normalizeScopeId(p.designation_id) === normalizeScopeId(ctx.designation_id)
    );
  }

  return null;
}

async function resolveQualificationProfile(divisionId, departmentId, designationId, options = {}) {
  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const globalQual = cloneQualificationsConfig(
    settings?.qualifications || emptyGlobalQualificationsConfig()
  );

  const ctx = {
    division_id: normalizeScopeId(divisionId),
    department_id: normalizeScopeId(departmentId),
    designation_id: normalizeScopeId(designationId),
  };

  const profiles =
    options.profiles ||
    (await QualificationProfile.find({ isActive: true }).lean());

  for (const scopeType of RESOLUTION_ORDER) {
    const profile = findProfileInList(profiles, scopeType, ctx);
    if (profile) {
      return profileToResolved(profile, scopeType, ctx);
    }
  }

  return {
    source: 'global',
    scopeType: null,
    scopeKey: null,
    profileId: null,
    division_id: ctx.division_id,
    department_id: ctx.department_id,
    designation_id: ctx.designation_id,
    ...globalQual,
  };
}

function normalizeProfilePayload(body) {
  const fields = Array.isArray(body.fields) ? body.fields : [];
  const defaultRows = Array.isArray(body.defaultRows) ? body.defaultRows : [];
  return {
    isEnabled: body.isEnabled !== false,
    enableCertificateUpload: !!body.enableCertificateUpload,
    fields: fields
      .map((f, index) => ({
        id: String(f.id || '').trim(),
        label: String(f.label || '').trim(),
        type: f.type || 'text',
        isRequired: !!f.isRequired,
        isEnabled: f.isEnabled !== false,
        placeholder: f.placeholder || '',
        validation: f.validation || {},
        options: Array.isArray(f.options) ? f.options : [],
        gridRows: Array.isArray(f.gridRows) ? f.gridRows.filter((r) => String(r).trim()) : undefined,
        order: f.order != null ? Number(f.order) : index + 1,
      }))
      .filter((f) => f.id && f.label),
    defaultRows,
  };
}

async function getQualificationSettingsForScope(divisionId, departmentId, designationId) {
  const formSettings = await EmployeeApplicationFormSettings.getActiveSettings();
  const resolved = await resolveQualificationProfile(divisionId, departmentId, designationId);
  return buildSettingsWithResolvedQualifications(formSettings, resolved);
}

function getQualFieldLabelsFromConfig(qualConfig) {
  const fields = qualConfig?.fields || [];
  const labels = [];
  const seen = new Set();
  fields.forEach((field) => {
    const label = field?.label ? String(field.label).trim() : '';
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      labels.push(label);
    }
  });
  return labels;
}

async function buildProfileResolverForEmployees(employees) {
  const settings = await EmployeeApplicationFormSettings.getActiveSettings();
  const globalQual = cloneQualificationsConfig(
    settings?.qualifications || emptyGlobalQualificationsConfig()
  );
  const profiles = await QualificationProfile.find({ isActive: true }).lean();

  return (divisionId, departmentId, designationId) => {
    const ctx = {
      division_id: normalizeScopeId(divisionId?._id || divisionId),
      department_id: normalizeScopeId(departmentId?._id || departmentId),
      designation_id: normalizeScopeId(designationId?._id || designationId),
    };

    for (const scopeType of RESOLUTION_ORDER) {
      const profile = findProfileInList(profiles, scopeType, ctx);
      if (profile) {
        return profileToResolved(profile, scopeType, ctx);
      }
    }

    return {
      source: 'global',
      scopeType: null,
      profileId: null,
      ...globalQual,
    };
  };
}

async function migrateLegacyQualificationProfiles() {
  const legacy = await QualificationProfile.find({
    isActive: true,
    $or: [{ scopeType: { $exists: false } }, { scopeKey: { $exists: false } }, { scopeKey: '' }],
  });

  for (const doc of legacy) {
    const scopeType = inferLegacyScopeType(doc) || 'department_designation';
    doc.scopeType = scopeType;
    doc.scopeKey = buildScopeKey(scopeType, {
      division_id: doc.division_id,
      department_id: doc.department_id,
      designation_id: doc.designation_id,
    });
    await doc.save();
  }

  return legacy.length;
}

module.exports = {
  cloneQualificationsConfig,
  emptyGlobalQualificationsConfig,
  buildSettingsWithResolvedQualifications,
  resolveQualificationProfile,
  getQualificationSettingsForScope,
  getQualFieldLabelsFromConfig,
  buildProfileResolverForEmployees,
  normalizeProfilePayload,
  migrateLegacyQualificationProfiles,
  profileToResolved,
  findProfileInList,
};
