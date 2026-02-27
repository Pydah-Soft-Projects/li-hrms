/**
 * Earned Leave Controller
 * Manages earned leave calculations and updates
 */

const { calculateEarnedLeave, getELBalance } = require('../services/earnedLeaveService');
const ELHistory = require('../model/ELHistory');
const Employee = require('../../employees/model/Employee');

/**
 * @desc    Calculate earned leave for employee
 * @route   POST /api/leaves/earned/calculate
 * @access  Private (HR, Admin, Employee for self)
 */
exports.calculateEL = async (req, res) => {
    try {
        const { employeeId, month, year } = req.body;

        // Employees can only calculate their own EL
        if (req.user.role === 'employee') {
            const selfId = (req.user.employeeRef || req.user._id || '').toString();
            if (!employeeId || selfId !== employeeId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only calculate your own earned leave'
                });
            }
        }

        const calculation = await calculateEarnedLeave(employeeId, month, year);
        
        res.status(200).json({
            success: true,
            data: calculation
        });
    } catch (error) {
        console.error('Error calculating EL:', error);
        res.status(500).json({
            success: false,
            message: 'Error calculating earned leave',
            error: error.message
        });
    }
};

/**
 * @desc    Get EL balance for employee
 * @route   GET /api/leaves/earned/balance/:employeeId
 * @access  Private (HR, Admin, Employee for self)
 */
exports.getELBalance = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { asOfDate } = req.query;

        // Employees can only view their own EL balance
        if (req.user.role === 'employee') {
            const selfId = (req.user.employeeRef || req.user._id || '').toString();
            if (!employeeId || selfId !== employeeId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only view your own earned leave balance'
                });
            }
        }

        const balance = await getELBalance(employeeId, asOfDate);
        
        res.status(200).json({
            success: true,
            data: balance
        });
    } catch (error) {
        console.error('Error fetching EL balance:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching earned leave balance',
            error: error.message
        });
    }
};

/**
 * @desc    Update earned leave for all employees (Admin/HR only)
 * @route   POST /api/leaves/earned/update-all
 * @access  Private (HR, Admin, Employee for self)
 */
exports.updateAllEL = async (req, res) => {
    try {
        const { month, year } = req.body;
        
        const result = await require('../services/earnedLeaveService').updateEarnedLeaveForAllEmployees(month, year);
        
        res.status(200).json({
            success: result.success,
            message: result.success ? 
                `EL updated for ${result.success}/${result.processed} employees` : 
                'EL update failed',
            data: result
        });
    } catch (error) {
        console.error('Error updating all EL:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating earned leave',
            error: error.message
        });
    }
};

/**
 * @desc    Get EL calculation history/log
 * @route   GET /api/leaves/earned/history/:employeeId
 * @access  Private (HR, Admin)
 */
exports.getELHistory = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year, limit = 12 } = req.query;

        if (!employeeId) {
            return res.status(400).json({
                success: false,
                message: 'Employee ID is required'
            });
        }

        // Employees can only view their own EL history
        if (req.user.role === 'employee') {
            const selfId = (req.user.employeeRef || req.user._id || '').toString();
            if (selfId !== employeeId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You can only view your own earned leave history'
                });
            }
        }

        const query = { employeeId };
        if (month && year) {
            query.month = Number(month);
            query.year = Number(year);
        } else if (year) {
            query.year = Number(year);
        }

        const history = await ELHistory.find(query)
            .sort({ createdAt: -1 })
            .limit(Number(limit) || 12)
            .lean();

        res.status(200).json({
            success: true,
            data: history
        });
    } catch (error) {
        console.error('Error fetching EL history:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching EL history',
            error: error.message
        });
    }
};
