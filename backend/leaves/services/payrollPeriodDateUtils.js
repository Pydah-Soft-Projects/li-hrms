const { extractISTComponents } = require('../../shared/utils/dateUtils');

function istDateStr(d) {
  if (d == null) return null;
  return extractISTComponents(d).dateStr;
}

function isPayrollPeriodClosedBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr < effStr;
}

function isPayrollPeriodEndedOnOrBeforeAsOf(payPeriodEnd, effectiveDate) {
  if (!payPeriodEnd || !effectiveDate) return false;
  const endStr = istDateStr(payPeriodEnd);
  const effStr = extractISTComponents(effectiveDate).dateStr;
  return endStr <= effStr;
}

module.exports = {
  istDateStr,
  isPayrollPeriodClosedBeforeAsOf,
  isPayrollPeriodEndedOnOrBeforeAsOf,
};
