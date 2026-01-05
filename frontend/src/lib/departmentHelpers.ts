// Helper function to filter departments by division
// Department model has divisions: [] array (plural)
export const filterDepartmentsByDivision = (departments: any[], divisionId: string) => {
    return departments.filter(dept => {
        // Check if department has divisions array
        if (!dept.divisions || dept.divisions.length === 0) return false;

        // Check if the selected division is in the department's divisions array
        return dept.divisions.some((div: any) => {
            const divId = typeof div === 'string' ? div : div._id;
            return divId === divisionId;
        });
    });
};
