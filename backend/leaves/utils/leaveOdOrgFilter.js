/**
 * Leave/OD list org filters: match snapshot fields on the request OR
 * employees whose current master org is in the selected scope.
 *
 * Transfers update Employee.division_id but leave documents keep the
 * division_id at application time — filtering only on the snapshot hides
 * transferred employees under their new division.
 *
 * Lookups are cached briefly to avoid re-scanning employees on every
 * Leave & OD list/stats request (managers auto-select their division).
 */
const mongoose = require('mongoose');

const CACHE_TTL_MS = Number(process.env.LEAVE_OD_ORG_FILTER_CACHE_MS) || 60_000;
const employeeIdCache = new Map();

function parseQueryObjectIds(value) {
  if (value == null || value === '' || value === 'all') return [];
  return String(value)
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id && id !== 'all' && mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function idMatch(field, ids) {
  if (!ids.length) return null;
  return { [field]: ids.length > 1 ? { $in: ids } : ids[0] };
}

function ensureAnd(filter) {
  if (!filter.$and) filter.$and = [];
  return filter.$and;
}

function cacheKey(field, ids) {
  return `${field}:${ids.map(String).sort().join(',')}`;
}

function pruneExpiredCache(now = Date.now()) {
  if (employeeIdCache.size < 100) return;
  for (const [key, entry] of employeeIdCache) {
    if (!entry || entry.expires <= now) employeeIdCache.delete(key);
  }
}

function clearLeaveOdOrgFilterCache() {
  employeeIdCache.clear();
}

async function employeeIdsForField(Employee, field, ids) {
  if (!ids.length) return [];
  const key = cacheKey(field, ids);
  const now = Date.now();
  const hit = employeeIdCache.get(key);
  if (hit && hit.expires > now) return hit.ids;

  let empIds;
  if (typeof Employee.distinct === 'function') {
    empIds = await Employee.distinct('_id', { [field]: { $in: ids } });
  } else {
    const docs = await Employee.find({ [field]: { $in: ids } }).select('_id').lean();
    empIds = docs.map((d) => d._id);
  }

  employeeIdCache.set(key, { expires: now + CACHE_TTL_MS, ids: empIds });
  pruneExpiredCache(now);
  return empIds;
}

/**
 * Build org-match clauses without attaching them (so callers can reuse once).
 * @returns {Promise<object[]>}
 */
async function resolveLeaveOdOrgFilterClauses(query, Employee) {
  const divisionIds = parseQueryObjectIds(query.division);
  const departmentIds = parseQueryObjectIds(query.department);
  const designationIds = parseQueryObjectIds(query.designation);

  const jobs = [];
  if (divisionIds.length) {
    jobs.push(
      employeeIdsForField(Employee, 'division_id', divisionIds).then((empIds) => {
        const snap = idMatch('division_id', divisionIds);
        return empIds.length ? { $or: [snap, { employeeId: { $in: empIds } }] } : snap;
      })
    );
  }
  if (departmentIds.length) {
    jobs.push(
      employeeIdsForField(Employee, 'department_id', departmentIds).then((empIds) => {
        const snapOr = {
          $or: [
            idMatch('department', departmentIds),
            idMatch('department_id', departmentIds),
          ].filter(Boolean),
        };
        return empIds.length ? { $or: [snapOr, { employeeId: { $in: empIds } }] } : snapOr;
      })
    );
  }
  if (designationIds.length) {
    jobs.push(
      employeeIdsForField(Employee, 'designation_id', designationIds).then((empIds) => {
        const snap = idMatch('designation', designationIds);
        return empIds.length ? { $or: [snap, { employeeId: { $in: empIds } }] } : snap;
      })
    );
  }

  if (!jobs.length) return [];
  return Promise.all(jobs);
}

/**
 * @param {object} filter - Mongo filter mutated in place
 * @param {{ division?: string, department?: string, designation?: string }} query
 * @param {import('mongoose').Model} Employee
 */
async function applyLeaveOdOrgFilters(filter, query, Employee) {
  const clauses = await resolveLeaveOdOrgFilterClauses(query, Employee);
  if (clauses.length) ensureAnd(filter).push(...clauses);
  return filter;
}

module.exports = {
  parseQueryObjectIds,
  applyLeaveOdOrgFilters,
  resolveLeaveOdOrgFilterClauses,
  clearLeaveOdOrgFilterCache,
  CACHE_TTL_MS,
};
