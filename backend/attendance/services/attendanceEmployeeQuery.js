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

function buildDateBoundaryExpr(fieldPath, operator, boundaryStr) {
  return {
    $expr: {
      [operator]: [
        { $dateToString: { format: '%Y-%m-%d', date: `$${fieldPath}`, timezone: 'Asia/Kolkata' } },
        boundaryStr,
      ],
    },
  };
}

/**
 * Shared employee roster rules for attendance (monthly grid, calendar, employees list).
 * Includes employees who were active during the period, employees who joined during the period,
 * and employees who left during the period, while excluding employees who joined after the period
 * and those who left before the period started.
 *
 * Dates are compared as calendar dates in Asia/Kolkata so UTC storage does not drop edge cases.
 *
 * @param {string} periodStartStr - YYYY-MM-DD (inclusive)
 * @param {string} periodEndStr - YYYY-MM-DD (inclusive)
 * @returns {{ $or: object[] }} Mongo clause to merge into a query (ANDs with sibling fields)
 */
function buildLeftDuringPeriodOrClause(periodStartStr, periodEndStr) {
  const joinOnOrBeforeEnd = {
    $or: [
      { doj: null },
      buildDateBoundaryExpr('doj', '$lte', periodEndStr),
    ],
  };

  const leftOnOrAfterStart = {
    $or: [
      { leftDate: null },
      buildDateBoundaryExpr('leftDate', '$gte', periodStartStr),
    ],
  };

  const leftWithinPeriod = {
    $expr: {
      $and: [
        buildDateBoundaryExpr('leftDate', '$gte', periodStartStr).$expr,
        buildDateBoundaryExpr('leftDate', '$lte', periodEndStr).$expr,
      ],
    },
  };

  return {
    $or: [
      {
        $and: [
          { is_active: { $ne: false } },
          joinOnOrBeforeEnd,
          leftOnOrAfterStart,
        ],
      },
      {
        $and: [
          joinOnOrBeforeEnd,
          leftWithinPeriod,
        ],
      },
    ],
  };
}

module.exports = { buildLeftDuringPeriodOrClause, mergeScopeWithEmployeeClauses };
