const leaveRegisterService = require('../services/leaveRegisterService');

/**
 * @desc    Get Leave Register data
 * @route   GET /api/leaves/register
 * @access  Private (Manager, HOD, HR, Admin)
 */
exports.getRegister = async (req, res) => {
    try {
        const { divisionId, departmentId, searchTerm, month } = req.query;

        // Build filters object based on user role and query
        const filters = {
            divisionId,
            departmentId,
            searchTerm,
        };

        // If user is HOD/Manager, ensure their scope is applied
        // (This is usually handled by applyScopeFilter middleware, 
        // but we can pass it explicitly if needed)
        if (req.user.role === 'hod' || req.user.role === 'manager') {
            if (req.user.divisionMapping) {
                filters.divisionId = req.user.divisionMapping.division_id;
                filters.departmentId = req.user.divisionMapping.department_id;
            }
        }

        const registerData = await leaveRegisterService.getLeaveRegister(filters, month);

        res.status(200).json({
            success: true,
            count: registerData.length,
            data: registerData,
        });
    } catch (error) {
        console.error('Error fetching leave register:', error);
        res.status(500).json({
            success: false,
            message: 'Server Error fetching leave register',
            error: error.message,
        });
    }
};
