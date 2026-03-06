/**
 * Employee number helpers: next number and next N numbers for bulk.
 * Considers both Employee and pending EmployeeApplication emp_nos.
 */

const Employee = require('../model/Employee');
const EmployeeApplication = require('../../employee-applications/model/EmployeeApplication');

/**
 * Parse emp_no to numeric value. Handles "100", "E50" -> 50, "ABC" -> NaN (skip).
 * @param {string} empNo
 * @returns {number|null}
 */
function parseNumericEmpNo(empNo) {
  if (empNo == null || typeof empNo !== 'string') return null;
  const s = String(empNo).trim();
  if (!s) return null;
  // Allow leading non-digits: take the last contiguous digit sequence, or full string if digits
  const match = s.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  const fullNum = parseInt(s, 10);
  return Number.isNaN(fullNum) ? null : fullNum;
}

/**
 * Get max numeric emp_no from Employee and pending EmployeeApplication collections.
 * @returns {Promise<number>} Max numeric value, or 0 if none.
 */
async function getMaxNumericEmpNo() {
  const [employees, applications] = await Promise.all([
    Employee.find({}).select('emp_no').lean(),
    EmployeeApplication.find({ status: 'pending' }).select('emp_no').lean(),
  ]);
  const allEmpNos = [
    ...employees.map((e) => e.emp_no),
    ...applications.map((a) => a.emp_no),
  ].filter(Boolean);
  const numerics = allEmpNos.map(parseNumericEmpNo).filter((n) => n != null && !Number.isNaN(n));
  if (numerics.length === 0) return 0;
  return Math.max(...numerics);
}

/**
 * Get the next single employee number (max + 1).
 * @returns {Promise<string>}
 */
async function getNextEmpNo() {
  const max = await getMaxNumericEmpNo();
  return String(max + 1);
}

/**
 * Get the next N employee numbers for bulk assign. [max+1, max+2, ..., max+count].
 * @param {number} count
 * @returns {Promise<string[]>}
 */
async function getNextEmpNos(count) {
  if (count <= 0) return [];
  const max = await getMaxNumericEmpNo();
  return Array.from({ length: count }, (_, i) => String(max + 1 + i));
}

module.exports = {
  parseNumericEmpNo,
  getMaxNumericEmpNo,
  getNextEmpNo,
  getNextEmpNos,
};
