/**
 * Build a read-only employee snapshot from an employee application for verify / finalize dialogs.
 */
import { promoteWeekdayShiftScheduleOnRecord } from '@/lib/weekdayShiftSchedule';
import { resolveEmployeeField } from '@/lib/resolveEmployeeField';

export function mapApplicationToViewEmployee(application: Record<string, any>): Record<string, any> {
  const dynamicFields = { ...(application.dynamicFields || {}) };

  const snapshot = {
    ...application,
    emp_no: application.emp_no,
    employee_name: application.employee_name,
    division_id: application.division_id,
    department_id: application.department_id,
    designation_id: application.designation_id,
    employee_group_id: application.employee_group_id,
    employee_group: application.employee_group,
    department: application.department,
    division: application.division,
    designation: application.designation,
    doj: application.doj,
    dob: application.dob,
    gross_salary: application.gross_salary ?? application.proposedSalary,
    proposedSalary: application.proposedSalary,
    approvedSalary: application.approvedSalary,
    second_salary: application.second_salary,
    gender: application.gender,
    marital_status: application.marital_status,
    blood_group: application.blood_group,
    qualifications: application.qualifications,
    experience: application.experience,
    address: application.address,
    location: application.location,
    aadhar_number: application.aadhar_number,
    phone_number: resolveEmployeeField(application, 'phone_number', ['contact_number']) || application.phone_number,
    alt_phone_number: resolveEmployeeField(application, 'alt_phone_number') || application.alt_phone_number,
    email: resolveEmployeeField(application, 'email') || application.email,
    pf_number: application.pf_number,
    esi_number: application.esi_number,
    bank_account_no: application.bank_account_no,
    bank_name: application.bank_name,
    bank_place: application.bank_place,
    ifsc_code: application.ifsc_code,
    salary_mode: application.salary_mode,
    qualificationStatus: application.qualificationStatus,
    profilePhoto: application.profilePhoto,
    dynamicFields,
    employeeAllowances: application.employeeAllowances || [],
    employeeDeductions: application.employeeDeductions || [],
    paidLeaves: application.paidLeaves ?? dynamicFields.paid_leaves,
    casualLeaves: application.casualLeaves ?? dynamicFields.casual_leaves,
    allottedLeaves: application.allottedLeaves ?? dynamicFields.allottedLeaves,
    reporting_to:
      application.reporting_to ??
      application.reporting_to_ ??
      dynamicFields.reporting_to ??
      dynamicFields.reporting_to_,
    applyPF: application.applyPF,
    applyESI: application.applyESI,
    applyProfessionTax: application.applyProfessionTax,
    applyAttendanceDeduction: application.applyAttendanceDeduction,
    deductLateIn: application.deductLateIn,
    deductEarlyOut: application.deductEarlyOut,
    deductPermission: application.deductPermission,
    deductAbsent: application.deductAbsent,
    weekdayShiftSchedule: application.weekdayShiftSchedule ?? null,
    ctcSalary: application.ctcSalary,
    calculatedSalary: application.calculatedSalary,
    is_active: true,
  };

  return promoteWeekdayShiftScheduleOnRecord(snapshot);
}

/** Prefer persisted employee data; fill gaps from the application snapshot. */
export function mergeEmployeeWithApplicationSnapshot(
  employee: Record<string, any>,
  application: Record<string, any>
): Record<string, any> {
  const snapshot = mapApplicationToViewEmployee(application);
  const mergedDynamic = {
    ...(snapshot.dynamicFields || {}),
    ...(employee.dynamicFields || {}),
  };

  const merged = {
    ...snapshot,
    ...employee,
    dynamicFields: mergedDynamic,
    qualifications:
      (Array.isArray(employee.qualifications) && employee.qualifications.length > 0)
        ? employee.qualifications
        : snapshot.qualifications,
    employeeAllowances:
      (Array.isArray(employee.employeeAllowances) && employee.employeeAllowances.length > 0)
        ? employee.employeeAllowances
        : snapshot.employeeAllowances,
    employeeDeductions:
      (Array.isArray(employee.employeeDeductions) && employee.employeeDeductions.length > 0)
        ? employee.employeeDeductions
        : snapshot.employeeDeductions,
    gross_salary: employee.gross_salary ?? snapshot.gross_salary,
    proposedSalary: snapshot.proposedSalary ?? employee.proposedSalary,
    profilePhoto: employee.profilePhoto ?? snapshot.profilePhoto,
    qualificationStatus: employee.qualificationStatus ?? snapshot.qualificationStatus,
    weekdayShiftSchedule: employee.weekdayShiftSchedule ?? snapshot.weekdayShiftSchedule ?? null,
  };

  return promoteWeekdayShiftScheduleOnRecord(merged);
}
