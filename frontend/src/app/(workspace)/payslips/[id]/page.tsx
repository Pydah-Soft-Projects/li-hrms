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
    permissionDeduction: number;
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
      let periodLabel = `For the month of ${payroll.monthName}`;
      if (payroll.startDate && payroll.endDate) {
        const startStr = new Date(payroll.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        const endStr = new Date(payroll.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        periodLabel += ` (${startStr} to ${endStr})`;
      }
      doc.text(periodLabel, pageWidth / 2, 25, { align: 'center' });

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
        ['Total Paid Days', payroll.attendance?.totalPaidDays || 0],
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
        ['Incentive', `₹ ${payroll.earnings.incentive.toFixed(2)}`],
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        {/* Top Navigation */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => router.push('/payslips')}
            className="group flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:shadow-md"
          >
            <svg className="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="font-medium">Back to List</span>
          </button>

          <button
            onClick={generateDetailedPDF}
            disabled={generatingPDF}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl disabled:opacity-50 shadow-lg hover:shadow-emerald-500/30 transition-all duration-300 flex items-center gap-2 transform hover:scale-[1.02]"
          >
            {generatingPDF ? (
              <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            <span className="font-semibold">{generatingPDF ? 'Generating...' : 'Download PDF'}</span>
          </button>
        </div>

        {/* Main Payslip Card */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl shadow-indigo-200/50 dark:shadow-none overflow-hidden border border-slate-100 dark:border-slate-700">
          {/* Payslip Header Banner */}
          <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 p-10 text-white text-center">
            <div className="inline-block px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold uppercase tracking-widest mb-4">
              Private & Confidential
            </div>
            <h1 className="text-4xl font-extrabold mb-3 tracking-tight">SALARY SLIP</h1>
            <div className="flex flex-col items-center gap-2">
              <p className="text-xl text-indigo-100 font-medium">
                {payroll.monthName} {payroll.year}
              </p>
              {payroll.startDate && payroll.endDate && (
                <p className="text-sm text-indigo-200/80 bg-black/10 px-4 py-1 rounded-full">
                  Period: {new Date(payroll.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {new Date(payroll.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <div className="p-8 md:p-12 space-y-12">
            {/* Employee Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                  <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">Employee Details</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-6">
                <DetailRow label="Employee Name" value={employee.employee_name} />
                <DetailRow label="Employee ID" value={employee.emp_no} />
                <DetailRow label="Department" value={typeof employee.department_id === 'object' ? employee.department_id.name : (employee.department_id || 'N/A')} />
                <DetailRow label="Designation" value={typeof employee.designation_id === 'object' ? employee.designation_id.name : (employee.designation_id || 'N/A')} />
                <DetailRow label="Bank Account" value={employee.bank_account_no || 'N/A'} />
                <DetailRow label="Location" value={employee.location || 'N/A'} />
                <DetailRow label="PF Number" value={employee.pf_number || 'N/A'} />
                <DetailRow label="ESI Number" value={employee.esi_number || 'N/A'} />
              </div>
            </section>

            {/* Attendance Section */}
            <section>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/40 rounded-xl">
                  <svg className="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white uppercase tracking-tight">Attendance Summary</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <StatusCard label="Month Days" value={payroll.attendance?.totalDaysInMonth} />
                <StatusCard label="Present" value={payroll.attendance?.presentDays} color="indigo" />
                <StatusCard label="Absents" value={payroll.attendance?.absentDays} color="rose" />
                <StatusCard label="Week Offs" value={payroll.attendance?.weeklyOffs} />
                <StatusCard label="Paid Leaves" value={payroll.attendance?.paidLeaveDays} color="emerald" />
                <StatusCard label="Net Paid Days" value={payroll.attendance?.totalPaidDays} highlight />
              </div>
            </section>

            {/* Salary Breakdown Section */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
              {/* Earnings Column */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-8 border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <div className="w-2 h-6 bg-emerald-500 rounded-full" />
                    EARNINGS
                  </h3>
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Additive</div>
                </div>
                <div className="space-y-4">
                  <SalaryRow label="Basic Salary" value={payroll.earnings.basicPay} />
                  <SalaryRow label="Earned Salary" value={payroll.attendance?.earnedSalary || 0} />
                  {payroll.earnings.allowances?.map((a, i) => (
                    <SalaryRow key={i} label={a.name} value={a.amount} />
                  ))}
                  <SalaryRow label="Incentive" value={payroll.earnings.incentive} />
                  <SalaryRow label="OT Allowance" value={payroll.earnings.otPay} />
                  {payroll.arrearsAmount ? <SalaryRow label="Arrears" value={payroll.arrearsAmount} /> : null}

                  <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                      <span className="font-black text-sm uppercase tracking-wider">Gross Earnings</span>
                      <span className="text-2xl font-black">₹{payroll.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Deductions Column */}
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-3xl p-8 border border-slate-100 dark:border-slate-700/50">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <div className="w-2 h-6 bg-rose-500 rounded-full" />
                    DEDUCTIONS
                  </h3>
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Subtractive</div>
                </div>
                <div className="space-y-4">
                  <SalaryRow label="Attendance Deduct" value={payroll.deductions.attendanceDeduction} isDeduction />
                  {payroll.deductions.permissionDeduction > 0 && <SalaryRow label="Permission Deduct" value={payroll.deductions.permissionDeduction} isDeduction />}
                  {payroll.deductions.leaveDeduction > 0 && <SalaryRow label="Leave Deduction" value={payroll.deductions.leaveDeduction} isDeduction />}
                  {payroll.deductions.otherDeductions?.map((d, i) => (
                    <SalaryRow key={i} label={d.name} value={d.amount} isDeduction />
                  ))}
                  {payroll.loanAdvance.totalEMI > 0 && <SalaryRow label="EMI (Loans)" value={payroll.loanAdvance.totalEMI} isDeduction />}
                  {payroll.loanAdvance.advanceDeduction > 0 && <SalaryRow label="Advance Recovery" value={payroll.loanAdvance.advanceDeduction} isDeduction />}

                  <div className="pt-6 mt-6 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                      <span className="font-black text-sm uppercase tracking-wider">Total Deductions</span>
                      <span className="text-2xl font-black">₹{payroll.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Net Salary Highlight Footer */}
          <div className="bg-slate-900 dark:bg-slate-950 p-10 text-white">
            <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="text-center md:text-left">
                <h4 className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em] mb-2">Net Payable Amount</h4>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl md:text-6xl font-black tracking-tighter">₹{payroll.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  <span className="text-indigo-400/60 font-medium">INR</span>
                </div>
                {payroll.roundOff !== 0 && (
                  <p className="text-slate-400 text-xs mt-2 italic font-medium">
                    Adjusted by ₹{payroll.roundOff?.toFixed(2)} round-off
                  </p>
                )}
              </div>

              <div className="flex flex-col items-center md:items-end gap-3">
                <div className={`px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-widest ${payroll.status === 'processed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    payroll.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}>
                  Status: {payroll.status}
                </div>
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">
                  Computer Generated Document • No Signature Required
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider font-mono">{label}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-white truncate">{value}</span>
    </div>
  );
}

function StatusCard({ label, value, color = 'slate', highlight = false }: { label: string; value: any; color?: string; highlight?: boolean }) {
  const colors: Record<string, string> = {
    slate: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40',
    indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/40',
    rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/40',
    emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/40',
    amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40',
  };

  return (
    <div className={`p-4 rounded-2xl flex flex-col items-center justify-center transition-all ${highlight ? 'bg-indigo-600 text-white shadow-lg ring-4 ring-indigo-500/10 scale-105' : colors[color] || colors.slate
      }`}>
      <span className={`text-[10px] font-bold uppercase tracking-tighter mb-1 opacity-70`}>{label}</span>
      <span className="text-xl font-black">{value || 0}</span>
    </div>
  );
}

function SalaryRow({ label, value, isDeduction = false }: { label: string; value: number; isDeduction?: boolean }) {
  if (value === 0 && !['Basic Salary', 'Earned Salary', 'Attendance Deduct'].includes(label)) return null;

  return (
    <div className="flex justify-between items-center group">
      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{label}</span>
      <span className={`text-sm font-bold ${isDeduction ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>
        {isDeduction ? '-' : ''}₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}

