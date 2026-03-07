const AttendanceDaily = require('../model/AttendanceDaily');
const Employee = require('../../employees/model/Employee');
const biometricReportService = require('../services/biometricReportService');
const dayjs = require('dayjs');

/**
 * @desc    Get attendance summary report
 * @route   GET /api/attendance/reports/summary
 * @access  Private
 */
exports.getAttendanceReport = async (req, res) => {
    try {
        const { startDate, endDate, departmentId, divisionId, employeeId } = req.query;

        const query = {};
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = startDate;
            if (endDate) query.date.$lte = endDate;
        }

        if (employeeId) {
            const employee = await Employee.findById(employeeId).select('emp_no');
            if (employee) {
                query.employeeNumber = employee.emp_no;
            }
        }

        // Apply filters by fetching relevant employee IDs first if department/division is set
        if (departmentId || divisionId) {
            const empFilter = { is_active: { $ne: false } };
            if (departmentId) empFilter.department_id = departmentId;
            if (divisionId) empFilter.division_id = divisionId;

            const employees = await Employee.find(empFilter).select('emp_no');
            const empNos = employees.map(e => e.emp_no);
            query.employeeNumber = { $in: empNos };
        }

        const attendance = await AttendanceDaily.find(query)
            .sort({ date: -1, employeeNumber: 1 })
            .populate({
                path: 'employeeNumber', // This is a bit tricky since employeeNumber is a String, we might need a virtual or manual join
                options: { strictPopulate: false }
            })
            .lean();

        // Manual join for employee details since AttendanceDaily uses employeeNumber (String)
        const allEmpNos = [...new Set(attendance.map(a => a.employeeNumber))];
        const employees = await Employee.find({ emp_no: { $in: allEmpNos } })
            .select('emp_no employee_name department_id division_id')
            .populate('department_id', 'name')
            .populate('division_id', 'name')
            .lean();

        const employeeMap = employees.reduce((acc, e) => {
            acc[e.emp_no] = e;
            return acc;
        }, {});

        const reports = attendance.map(record => ({
            ...record,
            employee: employeeMap[record.employeeNumber] || { emp_no: record.employeeNumber, employee_name: 'Unknown' }
        }));

        res.status(200).json({
            success: true,
            count: reports.length,
            data: reports
        });
    } catch (error) {
        console.error('Error in getAttendanceReport:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * @desc    Get raw biometric logs (Thumb Reports)
 * @route   GET /api/attendance/reports/thumb
 * @access  Private
 */
exports.getThumbReports = async (req, res) => {
    try {
        const { startDate, endDate, employeeId, limit } = req.query;

        const filters = {
            startDate,
            endDate,
            limit: parseInt(limit) || 1000
        };

        if (employeeId) {
            const employee = await Employee.findById(employeeId).select('emp_no');
            if (employee) {
                filters.employeeId = employee.emp_no;
            }
        }

        const logs = await biometricReportService.getThumbReports(filters);

        // Map employee names for the logs
        const empIds = [...new Set(logs.map(l => l.employeeId))];
        const employees = await Employee.find({ emp_no: { $in: empIds } }).select('emp_no employee_name').lean();
        const empMap = employees.reduce((acc, e) => {
            acc[e.emp_no] = e.employee_name;
            return acc;
        }, {});

        const data = logs.map(log => ({
            ...log,
            employeeName: empMap[log.employeeId] || 'Unknown'
        }));

        res.status(200).json({
            success: true,
            count: data.length,
            data
        });
    } catch (error) {
        console.error('Error in getThumbReports:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
