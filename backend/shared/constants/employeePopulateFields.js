/**
 * Standard employee fields for list/detail APIs that show employee identity in the UI.
 */
const EMPLOYEE_LIST_SELECT =
  'employee_name emp_no profilePhoto department_id division_id designation_id';

const EMPLOYEE_LIST_SELECT_WITH_SALARY = `${EMPLOYEE_LIST_SELECT} gross_salary`;

const EMPLOYEE_LIST_SELECT_WITH_CONTACT = `${EMPLOYEE_LIST_SELECT} email phone_number`;

const EMPLOYEE_ID_POPULATE = {
  path: 'employeeId',
  select: EMPLOYEE_LIST_SELECT,
  populate: [
    { path: 'designation_id', select: 'name title code' },
    { path: 'department_id', select: 'name code' },
    { path: 'division_id', select: 'name code' },
  ],
};

module.exports = {
  EMPLOYEE_LIST_SELECT,
  EMPLOYEE_LIST_SELECT_WITH_SALARY,
  EMPLOYEE_LIST_SELECT_WITH_CONTACT,
  EMPLOYEE_ID_POPULATE,
};
