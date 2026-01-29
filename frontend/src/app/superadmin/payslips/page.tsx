'use client';

import { useState, useEffect } from 'react';
import { useRouter } from "next/navigation";
import { api, Division, Department, Designation } from '@/lib/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Employee {
  _id: string;
  emp_no: string;
  employee_name: string;
  department_id?: string | { _id: string; name: string };
  designation_id?: string | { _id: string; name: string };
  location?: string;
  bank_account_no?: string;
  pf_number?: string;
  esi_number?: string;
}



interface PayrollRecord {
  _id: string;
  employeeId: Employee | string;
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  monthNumber: number;
  attendance?: {
    totalDaysInMonth: number;
    presentDays: number;
    paidLeaveDays: number;
    odDays: number;
    weeklyOffs: number;
    holidays: number;
    absentDays: number;
    payableShifts: number;
    extraDays: number;
    totalPaidDays: number;
    otHours: number;
    otDays: number;
    earnedSalary: number;
  };
  earnings: {
    basicPay: number;
    perDayBasicPay: number;
    payableAmount: number;
    incentive: number;
    otPay: number;
    otHours: number;
    totalAllowances: number;
    allowances: Array<{ name: string; amount: number }>;
    grossSalary: number;
  };
  deductions: {
    attendanceDeduction: number;
    permissionDeduction: number;
    leaveDeduction: number;
    totalOtherDeductions: number;
    otherDeductions: Array<{ name: string; amount: number }>;
    totalDeductions: number;
  };
  loanAdvance: {
    totalEMI: number;
    advanceDeduction: number;
  };
  netSalary: number;
  status: string;
  arrearsAmount?: number;
  totalDaysInMonth?: number;
  totalPayableShifts?: number;
  roundOff?: number;
}

export default function PayslipsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<PayrollRecord[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Filters
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // PDF Generation
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingBulkPDF, setGeneratingBulkPDF] = useState(false);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const recordsPerPage = 20;

  useEffect(() => {
    const today = new Date();
    const day = today.getDate();
    let defaultMonth = '';
    if (day > 15) {
      // Current month (YYYY-MM)
      defaultMonth = today.toISOString().substring(0, 7);
    } else {
      // Previous month
      const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      defaultMonth = prevMonth.toISOString().substring(0, 7);
    }
    setSelectedMonth(defaultMonth);

    setSelectedMonth(defaultMonth);

    fetchDivisions();
    fetchDepartments();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      fetchPayrollRecords();
      if (selectedDepartment) {
        fetchDesignations(selectedDepartment);
      } else {
        setDesignations([]);
        setSelectedDesignation('');
      }
    }
  }, [selectedMonth, selectedDepartment, selectedDivision]);

  useEffect(() => {
    applyFilters();
  }, [payrollRecords, searchQuery, selectedDesignation, selectedEmployee, statusFilter]);

  const fetchDivisions = async () => {
    try {
      const response = await api.getDivisions();
      if (response.success) {
        setDivisions(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching divisions:', error);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await api.getDepartments();
      if (response.success) {
        setDepartments(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching departments:', error);
    }
  };

  const fetchDesignations = async (deptId: string) => {
    try {
      const response = await api.getDesignations(deptId);
      if (response.success) {
        setDesignations(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching designations:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await api.getEmployees();
      if (response.success) {
        setEmployees(response.data || []);
      }
    } catch (error) {
      console.error('Error fetching employees:', error);
    }
  };

  const fetchPayrollRecords = async () => {
    if (!selectedMonth) return;

    setLoading(true);
    try {
      const params: any = { month: selectedMonth };
      if (selectedDivision) params.divisionId = selectedDivision;
      if (selectedDepartment) params.departmentId = selectedDepartment;

      const response = await api.getPayrollRecords(params);
      if (response.success) {
        setPayrollRecords(response.data || []);
      }
    } catch (error: any) {
      console.error('Error fetching payroll records:', error);
      toast.error(error.message || 'Failed to fetch payroll records');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...payrollRecords];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(record => {
        const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
        return (
          record.emp_no.toLowerCase().includes(query) ||
          employee?.employee_name.toLowerCase().includes(query)
        );
      });
    }

    // Designation filter
    if (selectedDesignation) {
      filtered = filtered.filter(record => {
        const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
        const designationId = typeof employee?.designation_id === 'object'
          ? employee.designation_id._id
          : employee?.designation_id;
        return designationId === selectedDesignation;
      });
    }

    // Employee filter
    if (selectedEmployee) {
      filtered = filtered.filter(record => {
        const empId = typeof record.employeeId === 'object' ? record.employeeId._id : record.employeeId;
        return empId === selectedEmployee;
      });
    }

    // Status filter
    if (statusFilter) {
      filtered = filtered.filter(record => record.status === statusFilter);
    }

    setFilteredRecords(filtered);
    setCurrentPage(1);
  };

  const getDeptName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return departments.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const getDesigName = (id: any) => {
    if (!id) return 'N/A';
    if (typeof id === 'object' && id.name) return id.name;
    return designations.find(d => d._id === id)?.name || (typeof id === 'string' ? id : 'N/A');
  };

  const drawPayslipOnDoc = (doc: jsPDF, record: PayrollRecord) => {
    const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
    if (!employee) return false;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Company Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PAYSLIP', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Month: ${record.monthName}`, pageWidth / 2, 28, { align: 'center' });

    // Employee Details Box
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('EMPLOYEE DETAILS', 14, 40);

    doc.setFont('helvetica', 'normal');
    const col1X = 14;
    const col2X = 80;
    const col3X = 145;

    let yPos = 48;

    // Row 1
    doc.setFont('helvetica', 'bold');
    doc.text('Employee Code:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(record.emp_no || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Department:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(getDeptName(employee.department_id), col2X + 25, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Location:', col3X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.location || 'N/A', col3X + 20, yPos);

    yPos += 7;

    // Row 2
    doc.setFont('helvetica', 'bold');
    doc.text('Name:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.employee_name || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Designation:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(getDesigName(employee.designation_id), col2X + 25, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('Bank Acc:', col3X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.bank_account_no || 'N/A', col3X + 20, yPos);

    yPos += 7;

    // Row 3
    doc.setFont('helvetica', 'bold');
    doc.text('PF Number:', col1X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.pf_number || 'N/A', col1X + 30, yPos);

    doc.setFont('helvetica', 'bold');
    doc.text('ESI Number:', col2X, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(employee.esi_number || 'N/A', col2X + 25, yPos);

    yPos += 5;

    // Attendance Details
    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('ATTENDANCE DETAILS', 14, yPos);
    yPos += 6;

    const attendanceData = [
      ['Month Days', record.totalDaysInMonth || record.attendance?.totalDaysInMonth || 0],
      ['Present Days', record.attendance?.presentDays || 0],
      ['Week Offs', record.attendance?.weeklyOffs || 0],
      ['Paid Leaves', record.attendance?.paidLeaveDays || 0],
      ['OD Days', record.attendance?.odDays || 0],
      ['Absents', record.attendance?.absentDays || 0],
      ['Payable Shifts', record.totalPayableShifts || record.attendance?.payableShifts || 0],
      ['Extra Days', record.attendance?.extraDays || 0],
      ['Total Paid Days', record.attendance?.totalPaidDays || 0],
      ['OT Hours', record.attendance?.otHours || 0],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Attendance Type', 'Days/Hours']],
      body: attendanceData,
      theme: 'grid',
      headStyles: { fillColor: [66, 139, 202], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 40, halign: 'right' }
      },
      margin: { left: 14, right: 14 }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;

    // Earnings and Deductions Side by Side
    doc.setFont('helvetica', 'bold');
    doc.text('EARNINGS', 14, yPos);
    doc.text('DEDUCTIONS', pageWidth / 2 + 7, yPos);
    yPos += 6;

    // Earnings Table
    const earningsData = [
      ['Basic Pay', record.earnings.basicPay.toFixed(2)],
      ['Earned Salary', record.attendance?.earnedSalary?.toFixed(2) || '0.00'],
      ...(record.earnings.allowances || []).map(a => [a.name, a.amount.toFixed(2)]),
      ['Incentive', record.earnings.incentive.toFixed(2)],
      ['OT Pay', record.earnings.otPay.toFixed(2)],
      ['Arrears', (record.arrearsAmount || 0).toFixed(2)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Earnings', 'Amount (Rs.)']],
      body: earningsData,
      theme: 'grid',
      headStyles: { fillColor: [92, 184, 92], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: 14, right: pageWidth / 2 + 7 }
    });

    // Deductions Table
    const deductionsData = [
      ['Attendance Deduction', record.deductions.attendanceDeduction.toFixed(2)],
      ['Permission Deduction', record.deductions.permissionDeduction.toFixed(2)],
      ['Leave Deduction', record.deductions.leaveDeduction.toFixed(2)],
      ...(record.deductions.otherDeductions || []).map(d => [d.name, d.amount.toFixed(2)]),
      ['EMI', record.loanAdvance.totalEMI.toFixed(2)],
      ['Advance', record.loanAdvance.advanceDeduction.toFixed(2)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [['Deductions', 'Amount (Rs.)']],
      body: deductionsData,
      theme: 'grid',
      headStyles: { fillColor: [217, 83, 79], fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: pageWidth / 2 + 7, right: 14 }
    });

    const finalY = Math.max((doc as any).lastAutoTable.finalY, yPos + 40);

    // Summary
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    const summaryY = finalY + 10;
    doc.text('SALARY SUMMARY', 14, summaryY);

    doc.setFontSize(10);
    doc.text('Gross Salary:', 14, summaryY + 8);
    doc.text(`Rs. ${record.earnings.grossSalary.toFixed(2)}`, 80, summaryY + 8);

    doc.text('Total Deductions:', 14, summaryY + 15);
    doc.text(`Rs. ${record.deductions.totalDeductions.toFixed(2)}`, 80, summaryY + 15);

    if (record.roundOff !== undefined) {
      doc.text('Round Off:', 14, summaryY + 22);
      doc.text(`Rs. ${record.roundOff.toFixed(2)}`, 80, summaryY + 22);
    }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('NET SALARY:', 14, summaryY + 32);
    doc.text(`Rs. ${record.netSalary.toFixed(2)}`, 80, summaryY + 32);

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('This is a computer-generated payslip and does not require a signature.', pageWidth / 2, pageHeight - 10, { align: 'center' });

    return true;
  };

  const generatePayslipPDF = async (record: PayrollRecord) => {
    setGeneratingPDF(true);
    toast.info('Generating payslip PDF...', { autoClose: 1000 });
    try {
      const doc = new jsPDF();
      const success = drawPayslipOnDoc(doc, record);
      if (success) {
        doc.save(`Payslip_${record.emp_no}_${record.month}.pdf`);
        toast.success('Payslip PDF generated successfully!');
      } else {
        toast.error('Employee data not found');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate payslip PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const generateBulkPayslipsPDF = async () => {
    if (selectedRecords.size === 0) {
      toast.warning('Please select at least one payslip to export');
      return;
    }

    setGeneratingBulkPDF(true);
    toast.info(`Generating ${selectedRecords.size} payslip(s)...`, { autoClose: 2000 });
    try {
      const recordsToExport = filteredRecords.filter(r => selectedRecords.has(r._id));
      const doc = new jsPDF();
      let addedPages = 0;

      for (let i = 0; i < recordsToExport.length; i++) {
        const record = recordsToExport[i];
        if (addedPages > 0) doc.addPage();

        const success = drawPayslipOnDoc(doc, record);
        if (success) {
          addedPages++;
        }
      }

      if (addedPages > 0) {
        doc.save(`Bulk_Payslips_${selectedMonth}.pdf`);
        toast.success(`${addedPages} payslips exported successfully!`);
        setSelectedRecords(new Set());
      } else {
        toast.error('No valid payslips found to export');
      }
    } catch (error) {
      console.error('Error generating bulk PDF:', error);
      toast.error('Failed to generate bulk payslips');
    } finally {
      setGeneratingBulkPDF(false);
    }
  };

  const toggleSelectRecord = (recordId: string) => {
    const newSelected = new Set(selectedRecords);
    if (newSelected.has(recordId)) {
      newSelected.delete(recordId);
    } else {
      newSelected.add(recordId);
    }
    setSelectedRecords(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedRecords.size === filteredRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(filteredRecords.map(r => r._id)));
    }
  };

  // Pagination
  const indexOfLastRecord = currentPage * recordsPerPage;
  const indexOfFirstRecord = indexOfLastRecord - recordsPerPage;
  const currentRecords = filteredRecords.slice(indexOfFirstRecord, indexOfLastRecord);
  const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-800 dark:text-white mb-2">
            📄 Employee Payslips
          </h1>
          <p className="text-slate-600 dark:text-slate-300">
            View, search, and export employee payslips
          </p>
        </div>

        {/* Filters Section */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">
            🔍 Filters & Search
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Month Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Month *
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                required
              />
            </div>

            {/* Division Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Division
              </label>
              <select
                value={selectedDivision}
                onChange={(e) => {
                  setSelectedDivision(e.target.value);
                  setSelectedDepartment(''); // Reset department
                  setSelectedDesignation(''); // Reset designation
                }}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Divisions</option>
                {divisions.map(div => (
                  <option key={div._id} value={div._id}>{div.name}</option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Department
              </label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Departments</option>
                {departments
                  .filter(dept => {
                    if (!selectedDivision) return true;
                    // Find selected division and check if department is in its list
                    const currentDiv = divisions.find(d => d._id === selectedDivision);
                    return currentDiv?.departments?.some((d: any) => d === dept._id || d._id === dept._id);
                  })
                  .map(dept => (
                    <option key={dept._id} value={dept._id}>{dept.name}</option>
                  ))}
              </select>
            </div>

            {/* Designation Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Designation
              </label>
              <select
                value={selectedDesignation}
                onChange={(e) => setSelectedDesignation(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Designations</option>
                {designations.map(desig => (
                  <option key={desig._id} value={desig._id}>{desig.name}</option>
                ))}
              </select>
            </div>

            {/* Employee Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Employee
              </label>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Employees</option>
                {employees.map(emp => (
                  <option key={emp._id} value={emp._id}>
                    {emp.emp_no} - {emp.employee_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              >
                <option value="">All Status</option>
                <option value="calculated">Calculated</option>
                <option value="approved">Approved</option>
                <option value="processed">Processed</option>
              </select>
            </div>

            {/* Search Bar */}
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Search
              </label>
              <input
                type="text"
                placeholder="Search by employee code or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3 mt-6">
            <button
              onClick={fetchPayrollRecords}
              disabled={!selectedMonth || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:scale-105"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Search Payslips</span>
                </>
              )}
            </button>

            <button
              onClick={generateBulkPayslipsPDF}
              disabled={selectedRecords.size === 0 || generatingBulkPDF}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:scale-105"
            >
              {generatingBulkPDF ? (
                <>
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Export Selected ({selectedRecords.size})</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedDepartment('');
                setSelectedDesignation('');
                setSelectedEmployee('');
                setStatusFilter('');
              }}
              className="px-6 py-2 bg-slate-500 text-white rounded-lg hover:bg-slate-600 shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:scale-105"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear Filters</span>
            </button>
          </div>
        </div>

        {/* Results Summary */}
        {filteredRecords.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4 mb-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <input
                  type="checkbox"
                  checked={selectedRecords.size === filteredRecords.length && filteredRecords.length > 0}
                  onChange={toggleSelectAll}
                  className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-slate-700 dark:text-slate-300">
                  Found <strong>{filteredRecords.length}</strong> payslip(s) |
                  Selected <strong>{selectedRecords.size}</strong>
                </span>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          </div>
        )}

        {/* Payslips Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === currentRecords.length && currentRecords.length > 0}
                      onChange={toggleSelectAll}
                      className="w-5 h-5 rounded focus:ring-2 focus:ring-white"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Emp Code</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Employee Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Department / Designation</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Month</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">Gross Salary</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">Deductions</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold">Net Salary</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Status</th>
                  <th className="px-4 py-3 text-center text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      Loading payslips...
                    </td>
                  </tr>
                ) : currentRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-slate-500">
                      {selectedMonth ? 'No payslips found. Try adjusting your filters.' : 'Please select a month to view payslips.'}
                    </td>
                  </tr>
                ) : (
                  currentRecords.map((record) => {
                    const employee = typeof record.employeeId === 'object' ? record.employeeId : null;
                    const department = typeof employee?.department_id === 'object' ? employee.department_id.name : '';

                    return (
                      <tr key={record._id} className="hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedRecords.has(record._id)}
                            onChange={() => toggleSelectRecord(record._id)}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                          {record.emp_no}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                          {employee?.employee_name || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                          <div className="font-medium">{getDeptName(employee?.department_id)}</div>
                          <div className="text-xs text-slate-500">{getDesigName(employee?.designation_id)}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                          {record.monthName}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-green-600 dark:text-green-400">
                          Rs.{record.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-red-600 dark:text-red-400">
                          Rs.{record.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-blue-600 dark:text-blue-400">
                          Rs.{record.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${record.status === 'processed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                            record.status === 'approved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                            }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => router.push(`/superadmin/payslips/${record._id}`)}
                              className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-xs font-medium transition-all duration-200 hover:shadow-md transform hover:scale-105"
                              title="View Details"
                            >
                              👁️ View
                            </button>
                            <button
                              onClick={() => generatePayslipPDF(record)}
                              disabled={generatingPDF}
                              className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-xs font-medium transition-all duration-200 hover:shadow-md transform hover:scale-105"
                              title="Export PDF"
                            >
                              📄 PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 dark:border-slate-600"
              >
                Previous
              </button>
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-300 dark:border-slate-600"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
