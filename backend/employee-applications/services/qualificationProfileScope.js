/**
 * Qualification profile scope types and resolution order.
 * More specific scopes win; global form settings is the final fallback.
 */

const SCOPE_TYPES = [
  'division',
  'department',
  'designation',
  'department_designation',
  'division_designation',
  'division_department',
  'division_department_designation',
];

const SCOPE_LABELS = {
  division: 'Division default',
  department: 'Department default',
  designation: 'Designation default',
  department_designation: 'Department + Designation',
  division_designation: 'Division + Designation',
  division_department: 'Division + Department',
  division_department_designation: 'Division + Department + Designation',
};

/** Most specific first */
const RESOLUTION_ORDER = [
  'division_department_designation',
  'department_designation',
  'division_designation',
  'division_department',
  'designation',
  'department',
  'division',
];

const SCOPE_REQUIRED_FIELDS = {
  division: ['division_id'],
  department: ['department_id'],
  designation: ['designation_id'],
  department_designation: ['department_id', 'designation_id'],
  division_designation: ['division_id', 'designation_id'],
  division_department: ['division_id', 'department_id'],
  division_department_designation: ['division_id', 'department_id', 'designation_id'],
};

function normalizeScopeId(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object' && value._id != null) return String(value._id).trim();
  return String(value).trim() || null;
}

function buildScopeKey(scopeType, ids = {}) {
  const division_id = normalizeScopeId(ids.division_id);
  const department_id = normalizeScopeId(ids.department_id);
  const designation_id = normalizeScopeId(ids.designation_id);

  switch (scopeType) {
    case 'division':
      return `division:${division_id}`;
    case 'department':
      return `department:${department_id}`;
    case 'designation':
      return `designation:${designation_id}`;
    case 'department_designation':
      return `department_designation:${department_id}:${designation_id}`;
    case 'division_designation':
      return `division_designation:${division_id}:${designation_id}`;
    case 'division_department':
      return `division_department:${division_id}:${department_id}`;
    case 'division_department_designation':
      return `division_department_designation:${division_id}:${department_id}:${designation_id}`;
    default:
      throw new Error(`Invalid scopeType: ${scopeType}`);
  }
}

function validateScopePayload(body) {
  const scopeType = body?.scopeType != null ? String(body.scopeType).trim() : '';
  if (!SCOPE_TYPES.includes(scopeType)) {
    return { ok: false, error: `scopeType must be one of: ${SCOPE_TYPES.join(', ')}` };
  }

  const division_id = normalizeScopeId(body.division_id);
  const department_id = normalizeScopeId(body.department_id);
  const designation_id = normalizeScopeId(body.designation_id);

  const required = SCOPE_REQUIRED_FIELDS[scopeType] || [];
  const idMap = { division_id, department_id, designation_id };

  for (const field of required) {
    if (!idMap[field]) {
      return { ok: false, error: `${field} is required for scope "${scopeType}"` };
    }
  }

  const forbidden = ['division_id', 'department_id', 'designation_id'].filter(
    (f) => !required.includes(f) && idMap[f]
  );
  if (forbidden.length) {
    return {
      ok: false,
      error: `${forbidden.join(', ')} must be empty for scope "${scopeType}"`,
    };
  }

  let scopeKey;
  try {
    scopeKey = buildScopeKey(scopeType, { division_id, department_id, designation_id });
  } catch (e) {
    return { ok: false, error: e.message };
  }

  return {
    ok: true,
    scopeType,
    scopeKey,
    division_id: required.includes('division_id') ? division_id : null,
    department_id: required.includes('department_id') ? department_id : null,
    designation_id: required.includes('designation_id') ? designation_id : null,
  };
}

function buildResolveQuery(scopeType, ctx) {
  const division_id = normalizeScopeId(ctx.division_id);
  const department_id = normalizeScopeId(ctx.department_id);
  const designation_id = normalizeScopeId(ctx.designation_id);

  const required = SCOPE_REQUIRED_FIELDS[scopeType] || [];
  const query = { isActive: true, scopeType };

  if (required.includes('division_id')) {
    if (!division_id) return null;
    query.division_id = division_id;
  } else {
    query.division_id = null;
  }

  if (required.includes('department_id')) {
    if (!department_id) return null;
    query.department_id = department_id;
  } else {
    query.department_id = null;
  }

  if (required.includes('designation_id')) {
    if (!designation_id) return null;
    query.designation_id = designation_id;
  } else {
    query.designation_id = null;
  }

  return query;
}

function canResolveScope(scopeType, ctx) {
  return buildResolveQuery(scopeType, ctx) != null;
}

function profileMatchesResolveQuery(profile, query) {
  if (!profile || !query) return false;
  if (String(profile.scopeType || '') !== String(query.scopeType || '')) return false;
  const fields = ['division_id', 'department_id', 'designation_id'];
  return fields.every((f) => {
    const qv = query[f] == null ? null : String(query[f]);
    const pv = profile[f] == null ? null : String(profile[f]);
    return qv === pv;
  });
}

function inferLegacyScopeType(profile) {
  if (!profile) return null;
  if (profile.scopeType) return profile.scopeType;
  if (profile.department_id && profile.designation_id) return 'department_designation';
  if (profile.division_id && profile.department_id && profile.designation_id) {
    return 'division_department_designation';
  }
  if (profile.division_id && profile.designation_id) return 'division_designation';
  if (profile.division_id && profile.department_id) return 'division_department';
  if (profile.division_id) return 'division';
  if (profile.department_id) return 'department';
  if (profile.designation_id) return 'designation';
  return null;
}

module.exports = {
  SCOPE_TYPES,
  SCOPE_LABELS,
  RESOLUTION_ORDER,
  SCOPE_REQUIRED_FIELDS,
  normalizeScopeId,
  buildScopeKey,
  validateScopePayload,
  buildResolveQuery,
  canResolveScope,
  profileMatchesResolveQuery,
  inferLegacyScopeType,
};
