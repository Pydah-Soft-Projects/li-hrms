/**
 * Combine req.scopeFilter (often `{ $or: [...] }`) with extra predicates without clobbering `$or`.
 * Spreading two `{ $or }` objects loses the scope — use `$and` instead.
 *
 * @param {object} scopeFilter - from applyScopeFilter / buildScopeFilter (may be {})
 * @param {object[]} additionalClauses - non-empty Mongo filter fragments to AND with scope
 * @returns {object} Mongo filter for Employee.find / countDocuments
 */
function mergeScopeWithEmployeeClauses(scopeFilter, additionalClauses) {
  const parts = [];
  if (scopeFilter && typeof scopeFilter === 'object' && Object.keys(scopeFilter).length > 0) {
    parts.push(scopeFilter);
  }
  const extras = Array.isArray(additionalClauses) ? additionalClauses : [];
  for (const c of extras) {
    if (c && typeof c === 'object' && Object.keys(c).length > 0) {
      parts.push(c);
    }
  }
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/**
 * Shared employee roster rules for attendance (monthly grid, calendar, employees list).
 * Matches pay-register intent: show current staff plus anyone whose leftDate falls in the period.
 *
 * leftDate is compared as a calendar date in Asia/Kolkata so UTC storage does not drop edge cases.
 *
 * @param {string} periodStartStr - YYYY-MM-DD (inclusive)
 * @param {string} periodEndStr - YYYY-MM-DD (inclusive)
 * @returns {{ $or: object[] }} Mongo clause to merge into a query (ANDs with sibling fields)
 */
function buildLeftDuringPeriodOrClause(periodStartStr, periodEndStr) {
  return {
    $or: [
      { is_active: { $ne: false }, leftDate: null },
      {
        $expr: {
          $and: [
            { $ne: ['$leftDate', null] },
            {
              $gte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$leftDate', timezone: 'Asia/Kolkata' } },
                periodStartStr,
              ],
            },
            {
              $lte: [
                { $dateToString: { format: '%Y-%m-%d', date: '$leftDate', timezone: 'Asia/Kolkata' } },
                periodEndStr,
              ],
            },
          ],
        },
      },
    ],
  };
}

module.exports = { buildLeftDuringPeriodOrClause, mergeScopeWithEmployeeClauses };
