const PayrollRecord = require('../model/PayrollRecord');
const SecondSalaryRecord = require('../model/SecondSalaryRecord');
const Employee = require('../../employees/model/Employee');

/**
 * Service to handle comparison logic
 */
const secondSalaryComparisonService = {

    /**
     * Get comparison data for a given month and filters
     */
    async getComparison(month, filters = {}) {
        const { departmentId, divisionId, designationId, search } = filters;

        // Build query for Employees first to handle 'search' and 'designation' efficiently
        // or we can query records directly if we populate.
        // Better approach: Query Records directly with populated employee filters if possible,
        // or filter in memory if volume is manageable. 
        // Given existing patterns, let's build a match query for the Populate options or main query.

        const matchQuery = { month };
        if (divisionId) matchQuery.division_id = divisionId;

        // Fetch Regular Records
        const regularRecords = await PayrollRecord.find(matchQuery)
            .populate({
                path: 'employeeId',
                select: 'employee_name emp_no designation_id department_id photo',
                populate: [
                    { path: 'designation_id', select: 'name' },
                    { path: 'department_id', select: 'name' }
                ]
            })
            .lean();

        // Fetch Second Salary Records
        const secondSalaryRecords = await SecondSalaryRecord.find(matchQuery)
            .populate({
                path: 'employeeId',
                select: 'employee_name emp_no designation_id department_id photo',
                populate: [
                    { path: 'designation_id', select: 'name' },
                    { path: 'department_id', select: 'name' }
                ]
            })
            .lean();

        // Create a Map of employees to combine data
        const employeeMap = new Map();

        // Helper to process list
        const processList = (list, type) => {
            list.forEach(record => {
                if (!record.employeeId) return;

                // Apply Text filters (Search, Department, Designation)
                const emp = record.employeeId;

                // Department Filter
                if (departmentId && emp.department_id?._id.toString() !== departmentId) return;

                // Designation Filter
                if (designationId && emp.designation_id?._id.toString() !== designationId) return;

                // Search Filter (Name or Emp No)
                if (search) {
                    const searchLower = search.toLowerCase();
                    const nameMatch = emp.employee_name?.toLowerCase().includes(searchLower);
                    const empNoMatch = emp.emp_no?.toLowerCase().includes(searchLower);
                    if (!nameMatch && !empNoMatch) return;
                }

                const empId = emp._id.toString();
                if (!employeeMap.has(empId)) {
                    employeeMap.set(empId, {
                        employee: {
                            _id: emp._id,
                            name: emp.employee_name,
                            emp_no: emp.emp_no,
                            photo: emp.photo,
                            designation: emp.designation_id?.name || 'N/A',
                            department: emp.department_id?.name || 'N/A'
                        },
                        regularNetSalary: 0,
                        secondSalaryNet: 0
                    });
                }

                const entry = employeeMap.get(empId);
                if (type === 'regular') {
                    entry.regularNetSalary = record.netSalary || 0;
                } else if (type === 'second') {
                    entry.secondSalaryNet = record.netSalary || 0;
                }
            });
        };

        processList(regularRecords, 'regular');
        processList(secondSalaryRecords, 'second');

        const comparisonList = Array.from(employeeMap.values()).map(item => ({
            ...item,
            difference: item.regularNetSalary - item.secondSalaryNet
        }));

        // Sort by Emp No
        comparisonList.sort((a, b) => a.employee.emp_no.localeCompare(b.employee.emp_no));

        return comparisonList;
    }
};

module.exports = secondSalaryComparisonService;
