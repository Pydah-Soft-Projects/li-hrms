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

module.exports = { buildLeftDuringPeriodOrClause };
