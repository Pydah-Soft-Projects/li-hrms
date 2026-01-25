'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PayrollRecord {
  _id: string;
  employeeId: {
    _id: string;
    emp_no: string;
    employee_name: string;
    department_id: { _id: string; name: string };
    designation_id: { _id: string; name: string };
    location?: string;
    bank_account_no?: string;
    pf_number?: string;
    esi_number?: string;
    uan_number?: string;
    pan_number?: string;
  };
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
    paidDays: number;
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
    totalAllowances: number;
    allowances: Array<{ name: string; amount: number; type?: string; base?: string }>;
    grossSalary: number;
  };
  deductions: {
    attendanceDeduction: number;
    attendanceDeductionBreakdown?: {
      lateInsCount: number;
      earlyOutsCount: number;
      combinedCount: number;
      daysDeducted: number;
      deductionType: string | null;
      calculationMode: string | null;
    };
    permissionDeduction: number;
    permissionDeductionBreakdown?: {
      permissionCount: number;
      eligiblePermissionCount: number;
      daysDeducted: number;
      deductionType: string | null;
      calculationMode: string | null;
    };
    leaveDeduction: number;
    totalOtherDeductions: number;
    otherDeductions: Array<{ name: string; amount: number; type?: string; base?: string }>;
    totalDeductions: number;
  };
  loanAdvance: {
    totalEMI: number;
    advanceDeduction: number;
  };
  netSalary: number;
  status: string;
  arrearsAmount?: number;
  roundOff?: number;
}

export default function PayslipDetailPage() {
  const router = useRouter();
  const params = useParams();
  const payrollId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [payroll, setPayroll] = useState<PayrollRecord | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payrollId) {
      fetchPayrollDetail();
    }
  }, [payrollId]);

  const fetchPayrollDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching payroll with ID:', payrollId);
      const response = await api.getPayrollById(payrollId);
      console.log('Fetch Response:', response);
      if (response.success) {
        setPayroll(response.data);
      } else {
        console.warn('Payslip not found or API error:', response.message);
        setError(response.message || 'Payslip not found');
        toast.error('Failed to fetch payslip details: ' + (response.message || 'Not found'));
      }
    } catch (err: any) {
      console.error('Error fetching payslip:', err);
      setError(err.message || 'Network error occurred');
      toast.error(err.message || 'Failed to fetch payslip details');
    } finally {
      setLoading(false);
    }
  };

  const generateDetailedPDF = () => {
    if (!payroll) return;

    setGeneratingPDF(true);
    toast.info('Generating detailed payslip PDF...', { autoClose: 1500 });
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const employee = payroll.employeeId;

      // ===== HEADER =====
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, 35, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('SALARY SLIP', pageWidth / 2, 15, { align: 'center' });

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`For the month of ${payroll.monthName}`, pageWidth / 2, 25, { align: 'center' });

      doc.setTextColor(0, 0, 0);

      // ===== EMPLOYEE INFORMATION =====
      let yPos = 45;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
      doc.text('EMPLOYEE INFORMATION', 14, yPos);

      yPos += 10;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');

      const getDept = (dept: any) => typeof dept === 'object' ? dept.name : (dept || 'N/A');
      const getDesig = (desig: any) => typeof desig === 'object' ? desig.name : (desig || 'N/A');

      const employeeInfo = [
        ['Employee Code:', employee.emp_no, 'Name:', employee.employee_name],
        ['Department:', getDept(employee.department_id), 'Designation:', getDesig(employee.designation_id)],
        ['Location:', employee.location || 'N/A', 'Bank Account:', employee.bank_account_no || 'N/A'],
        ['PF Number:', employee.pf_number || 'N/A', 'ESI Number:', employee.esi_number || 'N/A'],
        ['UAN Number:', employee.uan_number || 'N/A', 'PAN Number:', employee.pan_number || 'N/A'],
      ];

      employeeInfo.forEach(([label1, value1, label2, value2]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(label1, 14, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(value1, 50, yPos);

        doc.setFont('helvetica', 'bold');
        doc.text(label2, 110, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(value2, 145, yPos);

        yPos += 6;
      });

      // ===== ATTENDANCE DETAILS =====
      yPos += 5;
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
      doc.text('ATTENDANCE DETAILS', 14, yPos);
      yPos += 8;

      const attendanceData = [
        ['Month Days', payroll.attendance?.totalDaysInMonth || 0],
        ['Present Days', payroll.attendance?.presentDays || 0],
        ['Week Offs', payroll.attendance?.weeklyOffs || 0],
        ['Paid Leaves', payroll.attendance?.paidLeaveDays || 0],
        ['OD Days', payroll.attendance?.odDays || 0],
        ['Absents', payroll.attendance?.absentDays || 0],
        ['Payable Shifts', payroll.attendance?.payableShifts || 0],
        ['Extra Days', payroll.attendance?.extraDays || 0],
        ['Paid Days', payroll.attendance?.paidDays || 0],
        ['Total Paid Days', payroll.attendance?.totalPaidDays || 0],
        ['Late-Ins Count', payroll.deductions?.attendanceDeductionBreakdown?.lateInsCount || 0],
        ['Permissions Count', payroll.deductions?.permissionDeductionBreakdown?.permissionCount || 0],
        ['OT Hours', payroll.attendance?.otHours || 0],
        ['OT Days', payroll.attendance?.otDays || 0],
      ];

      // Corrected autoTable call for attendanceData
      autoTable(doc, {
        startY: yPos,
        head: [['Attendance Type', 'Count']],
        body: attendanceData,
        theme: 'striped',
        headStyles: { fillColor: [52, 152, 219], fontSize: 10, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 90, fontStyle: 'bold' },
          1: { cellWidth: 30, halign: 'right' }
        },
        margin: { left: 14, right: pageWidth / 2 + 5 }
      });

      // "PRIVATE & CONFIDENTIAL" text - placed after the main header but before employee info
      doc.setTextColor(41, 128, 185);
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('PRIVATE & CONFIDENTIAL', pageWidth / 2, 40, { align: 'center' });
      doc.setTextColor(0, 0, 0); // Reset color

      // ===== SALARY BREAKDOWN =====
      yPos = (doc as any).lastAutoTable.finalY + 10;

      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
      doc.text('SALARY BREAKDOWN', 14, yPos);
      yPos += 8;

      // EARNINGS TABLE
      const earningsData = [
        ['Basic Pay', `₹ ${payroll.earnings.basicPay.toFixed(2)}`],
        ['Per Day Salary', `₹ ${payroll.earnings.perDayBasicPay.toFixed(2)}`],
        ['Earned Salary', `₹ ${(payroll.attendance?.earnedSalary || 0).toFixed(2)}`],
        ...(payroll.earnings.allowances || []).map(a => [a.name, `₹ ${a.amount.toFixed(2)}`]),
        ['Extra Days Pay', `₹ ${payroll.earnings.incentive.toFixed(2)}`],
        ['OT Pay', `₹ ${payroll.earnings.otPay.toFixed(2)}`],
        ['Arrears', `₹ ${(payroll.arrearsAmount || 0).toFixed(2)}`],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['EARNINGS', 'Amount']],
        body: earningsData,
        foot: [['GROSS SALARY', `₹ ${payroll.earnings.grossSalary.toFixed(2)}`]],
        theme: 'striped',
        headStyles: { fillColor: [46, 204, 113], fontSize: 10, fontStyle: 'bold' },
        footStyles: { fillColor: [39, 174, 96], fontSize: 10, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: 14, right: pageWidth / 2 + 5 }
      });

      // DEDUCTIONS TABLE
      const deductionsData = [
        ['Attendance Deduction', `₹ ${payroll.deductions.attendanceDeduction.toFixed(2)}`],
        ['Permission Deduction', `₹ ${payroll.deductions.permissionDeduction.toFixed(2)}`],
        ['Leave Deduction', `₹ ${payroll.deductions.leaveDeduction.toFixed(2)}`],
        ...(payroll.deductions.otherDeductions || []).map(d => [d.name, `₹ ${d.amount.toFixed(2)}`]),
        ['EMI Deduction', `₹ ${payroll.loanAdvance.totalEMI.toFixed(2)}`],
        ['Advance Deduction', `₹ ${payroll.loanAdvance.advanceDeduction.toFixed(2)}`],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['DEDUCTIONS', 'Amount']],
        body: deductionsData,
        foot: [['TOTAL DEDUCTIONS', `₹ ${payroll.deductions.totalDeductions.toFixed(2)}`]],
        theme: 'striped',
        headStyles: { fillColor: [231, 76, 60], fontSize: 10, fontStyle: 'bold' },
        footStyles: { fillColor: [192, 57, 43], fontSize: 10, fontStyle: 'bold', textColor: 255 },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          0: { cellWidth: 60 },
          1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
        },
        margin: { left: pageWidth / 2 + 5, right: 14 }
      });

      // ===== NET SALARY =====
      const finalY = Math.max((doc as any).lastAutoTable.finalY, yPos + 100);
      yPos = finalY + 5;

      // Round Off display in PDF
      if (payroll.roundOff !== undefined && payroll.roundOff !== 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Round Off:', 14, yPos);
        doc.text(`₹ ${payroll.roundOff.toFixed(2)}`, pageWidth - 14, yPos, { align: 'right' });
        yPos += 8;
      }

      doc.setFillColor(41, 128, 185);
      doc.rect(10, yPos - 8, pageWidth - 20, 18, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('NET SALARY (Take Home):', 14, yPos);
      doc.text(`₹ ${payroll.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' });

      doc.setTextColor(0, 0, 0);

      // ===== FOOTER =====
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text('This is a computer-generated payslip and does not require a signature.', pageWidth / 2, pageHeight - 15, { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

      // Save PDF
      doc.save(`Payslip_${employee.emp_no}_${payroll.month}.pdf`);
      toast.success('Detailed payslip PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-300">Loading payslip details...</p>
        </div>
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Payslip Not Found</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {error || "The requested payslip record could not be found or you don't have permission to view it."}
          </p>
          <button
            onClick={() => router.push('/superadmin/payslips')}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg font-medium"
          >
            Back to Payslips List
          </button>
        </div>
      </div>
    );
  }

  const employee = payroll.employeeId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push('/superadmin/payslips')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Payslips
          </button>

          <button
            onClick={generateDetailedPDF}
            disabled={generatingPDF}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-md hover:shadow-lg transition-all duration-200 flex items-center gap-2 transform hover:scale-105"
          >
            {generatingPDF ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>📄 Export PDF</span>
              </>
            )}
          </button>
        </div>

        {/* Payslip Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-xl p-6 shadow-lg">
          <h1 className="text-3xl font-bold text-center mb-2">SALARY SLIP</h1>
          <p className="text-center text-blue-100">For the month of {payroll.monthName}</p>
        </div>

        {/* Employee Information */}
        <div className="bg-white dark:bg-slate-800 p-6 border-x border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            Employee Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Employee Code:</span>
              <span className="text-slate-800 dark:text-white">{employee.emp_no}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Name:</span>
              <span className="text-slate-800 dark:text-white">{employee.employee_name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Department:</span>
              <span className="text-slate-800 dark:text-white">
                {typeof employee.department_id === 'object' ? employee.department_id.name : (employee.department_id || 'N/A')}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Designation:</span>
              <span className="text-slate-800 dark:text-white">
                {typeof employee.designation_id === 'object' ? employee.designation_id.name : (employee.designation_id || 'N/A')}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Location:</span>
              <span className="text-slate-800 dark:text-white">{employee.location || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">Bank Account:</span>
              <span className="text-slate-800 dark:text-white">{employee.bank_account_no || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">PF Number:</span>
              <span className="text-slate-800 dark:text-white">{employee.pf_number || 'N/A'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
              <span className="font-semibold text-slate-600 dark:text-slate-400">ESI Number:</span>
              <span className="text-slate-800 dark:text-white">{employee.esi_number || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Attendance Details */}
        <div className="bg-white dark:bg-slate-800 p-6 border-x border-t border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Attendance Details
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { label: 'Month Days', value: payroll.attendance?.totalDaysInMonth || 0 },
              { label: 'Present Days', value: payroll.attendance?.presentDays || 0 },
              { label: 'Week Offs', value: payroll.attendance?.weeklyOffs || 0 },
              { label: 'Paid Leaves', value: payroll.attendance?.paidLeaveDays || 0 },
              { label: 'OD Days', value: payroll.attendance?.odDays || 0 },
              { label: 'Absents', value: payroll.attendance?.absentDays || 0 },
              { label: 'Payable Shifts', value: payroll.attendance?.payableShifts || 0 },
              { label: 'Extra Days', value: payroll.attendance?.extraDays || 0 },
              { label: 'Paid Days', value: payroll.attendance?.paidDays || 0, highlight: true },
              { label: 'Total Paid Days', value: payroll.attendance?.totalPaidDays || 0, highlight: true },
              { label: 'Late-Ins Count', value: payroll.deductions?.attendanceDeductionBreakdown?.lateInsCount || 0 },
              { label: 'Permissions Count', value: payroll.deductions?.permissionDeductionBreakdown?.permissionCount || 0 },
              { label: 'OT Hours', value: payroll.attendance?.otHours || 0 },
              { label: 'OT Days', value: payroll.attendance?.otDays || 0 },
            ].map((item, idx) => (
              <div key={idx} className={`p-4 rounded-lg ${item.highlight ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-600' : 'bg-slate-50 dark:bg-slate-700'}`}>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-1">{item.label}</p>
                <p className={`text-2xl font-bold ${item.highlight ? 'text-blue-600' : 'text-slate-800 dark:text-white'}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Salary Breakdown */}
        <div className="bg-white dark:bg-slate-800 p-6 border border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-4">Salary Breakdown</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Earnings */}
            <div>
              <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Earnings
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Basic Pay</span>
                  <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.earnings.basicPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Earned Salary</span>
                  <span className="font-semibold text-slate-800 dark:text-white">₹{(payroll.attendance?.earnedSalary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {payroll.earnings.allowances?.map((allowance, idx) => (
                  <div key={idx} className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{allowance.name}</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{allowance.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">Extra Days Pay</span>
                  <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.earnings.incentive.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400">OT Pay</span>
                  <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.earnings.otPay.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                {payroll.arrearsAmount && payroll.arrearsAmount > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Arrears</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.arrearsAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 bg-green-50 dark:bg-green-900/20 px-3 rounded-lg mt-2">
                  <span className="font-bold text-green-700 dark:text-green-400">GROSS SALARY</span>
                  <span className="font-bold text-green-700 dark:text-green-400">₹{payroll.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-3 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
                Deductions
              </h3>
              <div className="space-y-2">
                {payroll.deductions.attendanceDeduction > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Attendance Deduction</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.deductions.attendanceDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {payroll.deductions.permissionDeduction > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Permission Deduction</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.deductions.permissionDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {payroll.deductions.leaveDeduction > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Leave Deduction</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.deductions.leaveDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {payroll.deductions.otherDeductions?.map((deduction, idx) => (
                  <div key={idx} className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">{deduction.name}</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{deduction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
                {payroll.loanAdvance.totalEMI > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">EMI Deduction</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.loanAdvance.totalEMI.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {payroll.loanAdvance.advanceDeduction > 0 && (
                  <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-slate-600 dark:text-slate-400">Advance Deduction</span>
                    <span className="font-semibold text-slate-800 dark:text-white">₹{payroll.loanAdvance.advanceDeduction.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 bg-red-50 dark:bg-red-900/20 px-3 rounded-lg mt-2">
                  <span className="font-bold text-red-700 dark:text-red-400">TOTAL DEDUCTIONS</span>
                  <span className="font-bold text-red-700 dark:text-red-400">₹{payroll.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Net Salary */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-b-xl p-6 shadow-lg">
          <div className="space-y-2">
            {payroll.roundOff !== undefined && payroll.roundOff !== 0 && (
              <div className="flex items-center justify-between text-blue-100 text-sm">
                <span>Round Off</span>
                <span>₹{payroll.roundOff.toFixed(2)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">NET SALARY (Take Home)</h2>
              <p className="text-4xl font-bold">₹{payroll.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
          <p className="text-blue-100 text-sm mt-2">This is a computer-generated payslip</p>
        </div>

        {/* Status Badge */}
        <div className="mt-6 text-center">
          <span className={`inline-block px-6 py-2 rounded-full text-sm font-semibold ${payroll.status === 'processed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
            payroll.status === 'approved' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}>
            Status: {payroll.status.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
