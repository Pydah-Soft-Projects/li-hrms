/**
 * Accrual Controller
 * Triggers monthly leave accruals (CL, EL) and CCL expiration.
 * The accrual engine is implemented in services/accrualEngine.js but is not
 * called by any cron/scheduler – this API allows HR/Admin to run it manually
 * or for an external cron to call it (e.g. on the 1st of each month).
 */

const accrualEngine = require('../services/accrualEngine');
const monthlyPoolCarryForwardService = require('../services/monthlyPoolCarryForwardService');

/**
 * @desc    Run monthly accruals for a given month/year (CL + EL credits, CCL expiry)
 * @route   POST /api/leaves/accrual/run-monthly
 * @body    { month: number, year: number }  (optional; defaults to previous month)
 * @access  Private (HR, Sub-admin, Super-admin only)
 */
exports.runMonthlyAccruals = async (req, res) => {
    try {
        let { month, year } = req.body || {};
        const now = new Date();
        if (month == null || year == null) {
            // Default: previous month (so we don't accrue "current" month before it ends)
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 15);
            month = prev.getMonth() + 1;
            year = prev.getFullYear();
        }
        month = Number(month);
        year = Number(year);
        if (month < 1 || month > 12 || !year) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month (1-12) or year',
            });
        }

        const results = await accrualEngine.postMonthlyAccruals(month, year);

        res.status(200).json({
            success: true,
            message: `Monthly accruals completed for ${month}/${year}`,
            data: results,
        });
    } catch (error) {
        console.error('Error running monthly accruals:', error);
        res.status(500).json({
            success: false,
            message: 'Error running monthly accruals',
            error: error.message,
        });
    }
};

/**
 * @desc    Run monthly apply-pool carry-forward / forfeit for a closed payroll period (same as cron step after EL expiry)
 * @route   POST /api/leaves/accrual/run-monthly-pool-carry
 * @body    { month: number, year: number } — payroll cycle month/year label
 */
exports.runMonthlyPoolCarryForward = async (req, res) => {
    try {
        let { month, year } = req.body || {};
        if (month == null || year == null) {
            return res.status(400).json({
                success: false,
                message: 'month and year are required (payroll cycle label)',
            });
        }
        month = Number(month);
        year = Number(year);
        if (month < 1 || month > 12 || !year) {
            return res.status(400).json({
                success: false,
                message: 'Invalid month (1-12) or year',
            });
        }

        const data = await monthlyPoolCarryForwardService.processPayrollCycleCarryForward(month, year);

        res.status(200).json({
            success: true,
            message: `Monthly pool carry / forfeit completed for payroll ${month}/${year}`,
            data,
        });
    } catch (error) {
        console.error('Error running monthly pool carry:', error);
        res.status(500).json({
            success: false,
            message: 'Error running monthly pool carry-forward',
            error: error.message,
        });
    }
};
