const { isSecondSalaryGloballyEnabled } = require('../secondSalaryFeatureGate');

/**
 * Blocks second-salary HTTP routes when Payroll setting enable_second_salary is false.
 */
async function requireSecondSalaryEnabled(req, res, next) {
  try {
    const ok = await isSecondSalaryGloballyEnabled();
    if (!ok) {
      return res.status(403).json({
        success: false,
        message: 'Second salary is disabled in Payroll settings.',
        code: 'SECOND_SALARY_DISABLED',
      });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = requireSecondSalaryEnabled;
