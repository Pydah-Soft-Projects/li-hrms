"use client";

import { MissingEmployeeDetail } from "@/lib/payrollBatchValidation";

function formatDojDisplay(doj?: string): string {
  if (!doj?.trim()) return "—";
  return doj.trim();
}

type Props = {
  employees: MissingEmployeeDetail[];
};

export default function MissingPayrollEmployeeTable({ employees }: Props) {
  if (!employees.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Employee ID</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Name</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Department</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Designation</th>
            <th className="px-3 py-2 font-bold whitespace-nowrap">Date of joining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700 bg-white dark:bg-slate-900/30">
          {employees.map((emp) => (
            <tr
              key={emp.employeeId || `${emp.emp_no}-${emp.employee_name}`}
              className="text-slate-800 dark:text-slate-200"
            >
              <td className="px-3 py-2 font-semibold whitespace-nowrap">{emp.emp_no || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{emp.employee_name || "—"}</td>
              <td className="px-3 py-2">{emp.department_name?.trim() || "—"}</td>
              <td className="px-3 py-2">{emp.designation_name?.trim() || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDojDisplay(emp.doj)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
