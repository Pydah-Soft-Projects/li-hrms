const SecondSalaryService = require('../services/secondSalaryService');
const SecondSalaryBatch = require('../model/SecondSalaryBatch');

/**
 * @desc    Run 2nd salary payroll for a department
 * @route   POST /api/second-salary/calculate
 */
exports.calculateSecondSalary = async (req, res) => {
    try {
        const { departmentId, divisionId, month } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required'
            });
        }

        const result = await SecondSalaryService.runSecondSalaryPayroll({
            departmentId,
            divisionId,
            month,
            userId
        });

        res.status(201).json({
            success: true,
            message: '2nd Salary payroll calculation completed',
            data: result.batch,
            summary: result.results
        });
    } catch (error) {
        console.error('Error calculating 2nd salary:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error calculating 2nd salary'
        });
    }
};

/**
 * @desc    Get all 2nd salary batches
 * @route   GET /api/second-salary/batches
 */
exports.getSecondSalaryBatches = async (req, res) => {
    try {
        const { month, departmentId, divisionId, status } = req.query;
        const filters = {};
        if (month) filters.month = month;
        if (departmentId) filters.department = departmentId;
        if (divisionId) filters.division = divisionId;
        if (status) filters.status = status;

        const batches = await SecondSalaryService.getBatches(filters);

        res.status(200).json({
            success: true,
            count: batches.length,
            data: batches
        });
    } catch (error) {
        console.error('Error fetching 2nd salary batches:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching 2nd salary batches'
        });
    }
};

/**
 * @desc    Get single 2nd salary batch details
 * @route   GET /api/second-salary/batches/:id
 */
exports.getSecondSalaryBatch = async (req, res) => {
    try {
        const batch = await SecondSalaryService.getBatchDetails(req.params.id);

        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Batch not found'
            });
        }

        res.status(200).json({
            success: true,
            data: batch
        });
    } catch (error) {
        console.error('Error fetching 2nd salary batch:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching batch details'
        });
    }
};

/**
 * @desc    Update batch status (approve, freeze, complete)
 * @route   PUT /api/second-salary/batches/:id/status
 */
exports.updateBatchStatus = async (req, res) => {
    try {
        const { status, reason } = req.body;
        const userId = req.user._id || req.user.userId || req.user.id;

        if (!status) {
            return res.status(400).json({
                success: false,
                message: 'Status is required'
            });
        }

        const batch = await SecondSalaryService.updateBatchStatus(
            req.params.id,
            status,
            userId,
            reason
        );

        res.status(200).json({
            success: true,
            message: `Batch status updated to ${status}`,
            data: batch
        });
    } catch (error) {
        console.error('Error updating batch status:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Error updating status'
        });
    }
};

/**
 * @desc    Get 2nd salary records (Payslips)
 * @route   GET /api/second-salary/records
 */
exports.getSecondSalaryRecords = async (req, res) => {
    try {
        const { month, departmentId, divisionId } = req.query;
        const filters = {};
        if (month) filters.month = month;
        if (departmentId) filters.departmentId = departmentId;
        if (divisionId) filters.divisionId = divisionId;

        const records = await SecondSalaryService.getRecords(filters);

        res.status(200).json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error) {
        console.error('Error fetching 2nd salary records:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching records'
        });
    }
};

/**
 * @desc    Get single 2nd salary record by ID
 * @route   GET /api/second-salary/records/:id
 */
exports.getSecondSalaryRecordById = async (req, res) => {
    try {
        const record = await SecondSalaryService.getRecordById(req.params.id);

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Payslip record not found'
            });
        }

        res.status(200).json({
            success: true,
            data: record
        });
    } catch (error) {
        console.error('Error fetching 2nd salary record:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching record'
        });
    }
};
/**
 * @desc    Get salary comparison (Regular vs 2nd Salary)
 * @route   GET /api/second-salary/comparison
 */
exports.getSalaryComparison = async (req, res) => {
    try {
        const { month, departmentId, divisionId, designationId, search } = req.query;
        const secondSalaryComparisonService = require('../services/secondSalaryComparisonService');

        if (!month) {
            return res.status(400).json({
                success: false,
                message: 'Month is required'
            });
        }

        const comparisonData = await secondSalaryComparisonService.getComparison(month, {
            departmentId,
            divisionId,
            designationId,
            search
        });

        res.status(200).json({
            success: true,
            count: comparisonData.length,
            data: comparisonData
        });
    } catch (error) {
        console.error('Error fetching salary comparison:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Error fetching comparison data'
        });
    }
};
