'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
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
  startDate?: string;
  endDate?: string;
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
    toast.info('Generating executive payslip PDF...', { autoClose: 1500 });
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const employee = payroll.employeeId;

      // COLORS
      const primaryColor: [number, number, number] = [30, 41, 59]; // slate-800 (Navy)
      const accentColor: [number, number, number] = [5, 150, 105]; // emerald-600
      const lightBg: [number, number, number] = [248, 250, 252]; // slate-50
      const borderColor: [number, number, number] = [226, 232, 240]; // slate-200

      // ===== PAGE BORDER =====
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.2);
      doc.rect(5, 5, pageWidth - 10, pageHeight - 10);

      // ===== HEADER SECTION =====
      // Left Accent Bar
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(10, 15, 2, 15, 'F');

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('PAYSLIP', 16, 24);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139); // slate-500
      let periodLabel = `${payroll.monthName} ${payroll.year}`;
      if (payroll.startDate && payroll.endDate) {
        const startStr = new Date(payroll.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = new Date(payroll.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        periodLabel += ` | ${startStr} - ${endStr}`;
      }
      doc.text(periodLabel, 16, 30);

      // Company Placeholder / ID
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
      doc.text('PRIVATE & CONFIDENTIAL', pageWidth - 15, 22, { align: 'right' });
      doc.setTextColor(148, 163, 184); // slate-400
      doc.setFont('helvetica', 'normal');
      doc.text(`Ref: ${payroll._id.toString().slice(-8).toUpperCase()}`, pageWidth - 15, 27, { align: 'right' });

      // ===== SUMMARY CARDS ROW (Dashboard Style) =====
      let yPos = 40;
      const cardWidth = (pageWidth - 30) / 3;
      const cardHeight = 20;

      const formatValue = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

      // Card 1: Gross
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(10, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('GROSS EARNINGS', 14, yPos + 7);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text(formatValue(payroll.earnings.grossSalary), 14, yPos + 15);

      // Card 2: Deductions
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(15 + cardWidth, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL DEDUCTIONS', 15 + cardWidth + 4, yPos + 7);
      doc.setFontSize(11);
      doc.setTextColor(190, 18, 60); // rose-700
      doc.text(formatValue(payroll.deductions.totalDeductions), 15 + cardWidth + 4, yPos + 15);

      // Card 3: Net Pay
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.roundedRect(20 + cardWidth * 2, yPos, cardWidth, cardHeight, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(209, 213, 219); // slate-300
      doc.text('NET PAYABLE', 20 + cardWidth * 2 + 4, yPos + 7);
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(formatValue(payroll.netSalary), 20 + cardWidth * 2 + 4, yPos + 15);

      // ===== EMPLOYEE INFORMATION GRID =====
      yPos += 35;
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.1);
      doc.line(10, yPos - 8, pageWidth - 10, yPos - 8); // Top separator

      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('EMPLOYEE DETAILS', 10, yPos - 3);

      yPos += 5;
      const getDept = (dept: any) => typeof dept === 'object' ? dept.name : (dept || 'N/A');
      const getDesig = (desig: any) => typeof desig === 'object' ? desig.name : (desig || 'N/A');

      const empGrid = [
        { label: 'Name', value: employee.employee_name },
        { label: 'Employee ID', value: employee.emp_no },
        { label: 'Designation', value: getDesig(employee.designation_id) },
        { label: 'Department', value: getDept(employee.department_id) },
        { label: 'Bank Account', value: employee.bank_account_no || 'N/A' },
        { label: 'Location', value: employee.location || 'N/A' },
        { label: 'PAN Number', value: employee.pan_number || 'N/A' },
        { label: 'UAN Number', value: employee.uan_number || 'N/A' },
      ];

      doc.setFontSize(8);
      empGrid.forEach((item, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const xOffset = col === 0 ? 10 : pageWidth / 2 + 5;
        const yOffset = yPos + (row * 6);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(item.label, xOffset, yOffset);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(item.value.toString(), xOffset + 35, yOffset);
      });

      // ===== ATTENDANCE SUMMARY =====
      yPos += 30;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
      doc.setFontSize(8);
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('ATTENDANCE SUMMARY', 14, yPos);

      yPos += 8;
      const attData = [
        `Month Days: ${payroll.attendance?.totalDaysInMonth || 0}`,
        `Present: ${payroll.attendance?.presentDays || 0}`,
        `Paid Leaves: ${payroll.attendance?.paidLeaveDays || 0}`,
        `Net Paid Days: ${payroll.attendance?.totalPaidDays || 0}`,
      ];
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(attData.join('    |    '), 14, yPos);

      // ===== SALARY TABLES (MINIMALIST) =====
      yPos += 12;
      const formatCurr = (amount: number) => `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Earnings
      const earningsBody = [
        ['Basic Pay', formatCurr(payroll.earnings.basicPay)],
        ['Earned Basic', formatCurr(payroll.attendance?.earnedSalary || 0)],
        ...(payroll.earnings.allowances || []).map(a => [a.name, formatCurr(a.amount)]),
        ['Extra Days Pay', formatCurr(payroll.earnings.incentive)],
        ['OT Pay', formatCurr(payroll.earnings.otPay)],
        ['Arrears', formatCurr(payroll.arrearsAmount || 0)],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['EARNINGS', 'AMOUNT']],
        body: earningsBody,
        theme: 'plain',
        headStyles: { fontStyle: 'bold', textColor: primaryColor, fontSize: 8, cellPadding: 2 },
        bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: 10, right: pageWidth / 2 + 2 },
        didDrawPage: (data) => {
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          doc.line(10, data.cursor!.y, pageWidth / 2 - 2, data.cursor!.y);
        }
      });

      // Deductions
      const deductionsBody = [
        ['Attendance Deduction', formatCurr(payroll.deductions.attendanceDeduction)],
        ['Permission Deduction', formatCurr(payroll.deductions.permissionDeduction)],
        ['Leave Deduction', formatCurr(payroll.deductions.leaveDeduction)],
        ...(payroll.deductions.otherDeductions || []).map(d => [d.name, formatCurr(d.amount)]),
        ['EMI Deduction', formatCurr(payroll.loanAdvance.totalEMI)],
        ['Advance Deduction', formatCurr(payroll.loanAdvance.advanceDeduction)],
      ];

      autoTable(doc, {
        startY: yPos,
        head: [['DEDUCTIONS', 'AMOUNT']],
        body: deductionsBody,
        theme: 'plain',
        headStyles: { fontStyle: 'bold', textColor: [190, 18, 60], fontSize: 8, cellPadding: 2 },
        bodyStyles: { fontSize: 8, textColor: [51, 65, 85], cellPadding: 2 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
        margin: { left: pageWidth / 2 + 2, right: 10 },
        didDrawPage: (data) => {
          doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
          doc.line(pageWidth / 2 + 2, data.cursor!.y, pageWidth - 10, data.cursor!.y);
        }
      });

      // ===== FINAL NET PAY BLOCK =====
      yPos = Math.max((doc as any).lastAutoTable.finalY + 15, yPos + 80);

      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.roundedRect(10, yPos, pageWidth - 20, 25, 2, 2, 'F');

      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('NET PAYABLE IN WORDS', 16, yPos + 8);

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      const netInWords = (payroll.netSalary).toFixed(0); // Optional: add number to words helper later
      doc.text(`Total amount of: ${formatValue(payroll.netSalary)} (Approx INR)`, 16, yPos + 16);

      if (payroll.roundOff !== 0 && payroll.roundOff !== undefined) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(148, 163, 184);
        doc.text(`* Adjusted by ${formatValue(payroll.roundOff)} round-off`, pageWidth - 15, yPos + 22, { align: 'right' });
      }

      // ===== SIGNATURE BLOCKS =====
      yPos += 45;
      doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
      doc.setLineWidth(0.5);

      // Signature lines
      doc.line(20, yPos, 70, yPos);
      doc.line(pageWidth - 70, yPos, pageWidth - 20, yPos);

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.text('Employee Signature', 45, yPos + 5, { align: 'center' });
      doc.text('Authorized Signatory', pageWidth - 45, yPos + 5, { align: 'center' });

      // ===== FOOTER =====
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(148, 163, 184);
      doc.text('This is a computer-generated document and does not require a physical signature.', pageWidth / 2, pageHeight - 12, { align: 'center' });
      doc.text(`Generated on: ${new Date().toLocaleString('en-IN')}`, pageWidth / 2, pageHeight - 8, { align: 'center' });

      doc.save(`Payslip_${employee.emp_no}_${payroll.month}.pdf`);
      toast.success('Executive PDF generated successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };




  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <p className="text-slate-600 dark:text-slate-300">Loading payslip details...</p>
        </div>
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full mx-4">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Payslip Not Found</h1>
          <p className="text-slate-600 dark:text-slate-300 mb-6">
            {error || "The requested payslip record could not be found or you don't have permission to view it."}
          </p>
          <Link
            href="/superadmin/payslips"
            className="w-full px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-lg font-medium inline-block text-center"
          >
            Back to Payslips List
          </Link>
        </div>
      </div>
    );
  }

  const employee = payroll.employeeId;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/50 via-teal-50/50 to-emerald-100/50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-2 md:p-4">
      <div className="w-full max-w-[1400px] mx-auto">
        {/* Main Payslip Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[1.5rem] shadow-xl shadow-emerald-200/20 dark:shadow-none overflow-hidden border border-slate-100 dark:border-slate-700">
          {/* Payslip Header Banner */}
          <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 px-4 py-2 text-white relative flex items-center justify-between">
            <Link
              href="/superadmin/payslips"
              className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-white border border-white/10 transition-all text-xs font-bold uppercase tracking-wider"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Back</span>
            </Link>

            <div className="flex flex-col items-center">
              <h1 className="text-lg md:text-xl font-black tracking-tight leading-none mb-1">SALARY SLIP</h1>
              <div className="flex items-center gap-3">
                <p className="text-xs md:text-sm text-emerald-50 font-bold">
                  {payroll.monthName} {payroll.year}
                </p>
                <div className="px-2 py-0.5 bg-white/20 backdrop-blur-md rounded-full text-[8px] font-bold uppercase tracking-widest whitespace-nowrap">
                  Private & Confidential
                </div>
              </div>
            </div>

            <button
              onClick={generateDetailedPDF}
              disabled={generatingPDF}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-lg text-white border border-white/10 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>{generatingPDF ? 'PDF...' : 'Download'}</span>
            </button>
          </div>

          <div className="p-4 md:p-5 space-y-3">
            {/* Reorganized Profile and Attendance sections into side-by-side columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1 bg-emerald-50 dark:bg-emerald-900/40 rounded-lg">
                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h2 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Employee Profile</h2>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <DetailRow label="Name" value={employee.employee_name} />
                  <DetailRow label="Employee ID" value={employee.emp_no} />
                  <DetailRow label="Department" value={typeof employee.department_id === 'object' ? (employee.department_id as any).name : (employee.department_id || 'N/A')} />
                  <DetailRow label="Designation" value={typeof employee.designation_id === 'object' ? (employee.designation_id as any).name : (employee.designation_id || 'N/A')} />
                  <DetailRow label="PF No" value={employee.pf_number || 'N/A'} />
                  <DetailRow label="ESI No" value={employee.esi_number || 'N/A'} />
                  <DetailRow label="UAN No" value={employee.uan_number || 'N/A'} />
                  <DetailRow label="PAN No" value={employee.pan_number || 'N/A'} />
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1 bg-amber-50 dark:bg-amber-900/40 rounded-lg">
                    <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h2 className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-wider">Attendance Data</h2>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 bg-slate-50/50 dark:bg-slate-900/30 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <StatusCard label="Days" value={payroll.attendance?.totalDaysInMonth} />
                  <StatusCard label="Present" value={payroll.attendance?.presentDays} color="emerald" />
                  <StatusCard label="Abs" value={payroll.attendance?.absentDays} color="rose" />
                  <StatusCard label="Off" value={payroll.attendance?.weeklyOffs} />
                  <StatusCard label="Leave" value={payroll.attendance?.paidLeaveDays} color="teal" />
                  <StatusCard label="Late" value={payroll.deductions?.attendanceDeductionBreakdown?.lateInsCount} color="amber" />
                  <StatusCard label="Perm" value={payroll.deductions?.permissionDeductionBreakdown?.permissionCount} color="emerald" />
                  <StatusCard label="OT" value={payroll.attendance?.otDays} color="amber" />
                  <StatusCard label="Paid" value={payroll.attendance?.totalPaidDays} highlight />
                </div>
              </section>
            </div>

            {/* Salary Breakdown Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 pt-2">
              {/* Earnings Column */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                    EARNINGS
                  </h3>
                  <div className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Additive</div>
                </div>
                <div className="space-y-1">
                  <SalaryRow label="Basic Salary" value={payroll.earnings.basicPay} />
                  <SalaryRow label="Earned Salary" value={payroll.attendance?.earnedSalary || 0} />
                  {payroll.earnings.allowances?.map((a, i) => (
                    <SalaryRow key={i} label={a.name} value={a.amount} />
                  ))}
                  <SalaryRow label="Extra Days Pay" value={payroll.earnings.incentive} />
                  <SalaryRow label="OT Allowance" value={payroll.earnings.otPay} />
                  {payroll.arrearsAmount ? <SalaryRow label="Arrears" value={payroll.arrearsAmount} /> : null}

                  <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center text-emerald-600 dark:text-emerald-400">
                      <span className="font-black text-[9px] uppercase tracking-widest">Gross Total</span>
                      <span className="text-lg font-black">₹{payroll.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deductions Column */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-black text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <div className="w-1.5 h-4 bg-rose-500 rounded-full" />
                    DEDUCTIONS
                  </h3>
                  <div className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest">Subtractive</div>
                </div>
                <div className="space-y-1">
                  <SalaryRow label="Attendance Deduct" value={payroll.deductions.attendanceDeduction} isDeduction />
                  {payroll.deductions.permissionDeduction > 0 && <SalaryRow label="Permission Deduct" value={payroll.deductions.permissionDeduction} isDeduction />}
                  {payroll.deductions.leaveDeduction > 0 && <SalaryRow label="Leave Deduction" value={payroll.deductions.leaveDeduction} isDeduction />}
                  {payroll.deductions.otherDeductions?.map((d, i) => (
                    <SalaryRow key={i} label={d.name} value={d.amount} isDeduction />
                  ))}
                  {payroll.loanAdvance.totalEMI > 0 && <SalaryRow label="EMI (Loans)" value={payroll.loanAdvance.totalEMI} isDeduction />}
                  {payroll.loanAdvance.advanceDeduction > 0 && <SalaryRow label="Advance Recovery" value={payroll.loanAdvance.advanceDeduction} isDeduction />}

                  <div className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between items-center text-rose-600 dark:text-rose-400">
                      <span className="font-black text-[9px] uppercase tracking-widest">Total Deductions</span>
                      <span className="text-lg font-black">₹{payroll.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Net Salary Highlight Footer */}
          <div className="bg-slate-900 dark:bg-slate-950 p-4 md:p-5 text-white">
            <div className="max-w-4xl mx-auto flex flex-row items-center justify-between gap-4">
              <div>
                <h4 className="text-emerald-400 text-[8px] font-black uppercase tracking-[0.2em] mb-0.5">Final Net Payable</h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl md:text-3xl font-black tracking-tighter">₹{payroll.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  <span className="text-emerald-500/60 text-[10px] font-bold">INR</span>
                </div>
                {payroll.roundOff !== 0 && (
                  <p className="text-slate-500 text-[9px] italic font-medium">
                    Adjusted by ₹{payroll.roundOff?.toFixed(2)} round-off
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${payroll.status === 'processed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  payroll.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                  {payroll.status}
                </div>
                <div className="text-[8px] text-slate-600 uppercase font-black tracking-tighter text-right">
                  System Generated • No Signature Required
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Reusable UI Components
function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider font-mono">{label}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-white truncate">{value}</span>
    </div>
  );
}

function StatusCard({ label, value, color = 'slate', highlight = false }: { label: string; value: any; color?: string; highlight?: boolean }) {
  const colors: Record<string, string> = {
    slate: 'text-slate-600 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800',
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/40 border-indigo-100/50 dark:border-indigo-900/30',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-900/40 border-rose-100/50 dark:border-rose-900/30',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/40 border-emerald-100/50 dark:border-emerald-900/30',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-900/40 border-amber-100/50 dark:border-amber-900/30',
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/40 border-blue-100/50 dark:border-blue-900/30',
  };

  return (
    <div className={`py-2 px-1 rounded-2xl flex flex-col items-center justify-center transition-all border ${highlight
      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 border-emerald-500 scale-[1.03] z-10'
      : colors[color] || colors.slate
      }`}>
      <span className={`text-[9px] font-bold uppercase tracking-widest mb-1 text-center ${highlight ? 'text-emerald-50/80' : 'opacity-60'}`}>
        {label}
      </span>
      <span className={`text-lg font-black tracking-tight leading-none ${highlight ? 'text-white' : ''}`}>
        {value || 0}
      </span>
    </div>
  );
}

function SalaryRow({ label, value, isDeduction = false }: { label: string; value: number; isDeduction?: boolean }) {
  if (value === 0 && !['Basic Salary', 'Earned Salary', 'Attendance Deduct'].includes(label)) return null;

  return (
    <div className="flex justify-between items-center group py-0.5">
      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{label}</span>
      <span className={`text-xs font-black ${isDeduction ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>
        {isDeduction ? '-' : ''}₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}

