'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface SecondSalaryRecord {
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
    startDate?: string;
    endDate?: string;
    attendance: {
        totalDaysInMonth: number;
        presentDays: number;
        paidLeaveDays: number;
        weeklyOffs: number;
        holidays: number;
        absentDays: number;
        payableShifts: number;
        extraDays: number;
        totalPaidDays: number;
        paidDays: number;
        attendanceDeductionDays?: number;
        finalPaidDays?: number;
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
        attendanceDeductionBreakdown?: {
            lateInsCount: number;
            earlyOutsCount: number;
            combinedCount?: number;
            daysDeducted?: number;
        };
        permissionDeductionBreakdown?: {
            permissionCount: number;
        };
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

export default function SecondSalaryPayslipDetail() {
    const router = useRouter();
    const params = useParams();
    const recordId = params?.id as string;

    const [loading, setLoading] = useState(true);
    const [record, setRecord] = useState<SecondSalaryRecord | null>(null);
    const [generatingPDF, setGeneratingPDF] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (recordId) {
            fetchRecordDetail();
        }
    }, [recordId]);

    const fetchRecordDetail = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get(`/second-salary/records/${recordId}`);
            if (response.success) {
                setRecord(response.data);
            } else {
                setError(response.message || 'Payslip not found');
                toast.error('Failed to fetch payslip details');
            }
        } catch (err: any) {
            console.error('Error fetching payslip:', err);
            setError(err.message || 'Network error occurred');
            toast.error('Failed to fetch payslip details');
        } finally {
            setLoading(false);
        }
    };

    const generateDetailedPDF = () => {
        if (!record) return;

        setGeneratingPDF(true);
        toast.info('Generating detailed payslip PDF...', { autoClose: 1500 });
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const employee = record.employeeId;

            // ===== HEADER =====
            doc.setFillColor(41, 128, 185);
            doc.rect(0, 0, pageWidth, 35, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont('helvetica', 'bold');
            doc.text('2ND SALARY SLIP', pageWidth / 2, 15, { align: 'center' });

            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            let periodLabel = `For the month of ${record.monthName}`;
            if (record.startDate && record.endDate) {
                const startStr = new Date(record.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                const endStr = new Date(record.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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

            // ===== ATTENDANCE SUMMARY (no background, bold title) =====
            yPos += 5;
            doc.setFontSize(11);
            doc.setTextColor(30, 41, 59);
            doc.setFont('helvetica', 'bold');
            doc.text('ATTENDANCE SUMMARY', 14, yPos);
            yPos += 8;

            const attDedDays = record.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? record.attendance?.attendanceDeductionDays ?? 0;
            const totalPaid = record.attendance?.totalPaidDays ?? record.attendance?.paidDays ?? 0;
            const finalPaid = record.attendance?.finalPaidDays ?? Math.max(0, totalPaid - attDedDays);
            const totalLeaves = (record.attendance as any)?.totalLeaveDays ?? (record.attendance?.paidLeaveDays ?? 0) + ((record.attendance as any)?.totalLopDays ?? 0);
            const attendanceData = [
                ['Month Days', record.attendance?.totalDaysInMonth || 0],
                ['Present Days', record.attendance?.presentDays || 0],
                ['Week Offs', record.attendance?.weeklyOffs || 0],
                ['Paid Leaves', record.attendance?.paidLeaveDays || 0],
                ['Total Leaves', totalLeaves],
                ['Absents', record.attendance?.absentDays || 0],
                ['Payable Shifts', record.attendance?.payableShifts || 0],
                ['Extra Days', record.attendance?.extraDays || 0],
                ['Total Paid Days', totalPaid],
                ['Attendance Deduction Days (Late)', attDedDays],
                ['Final Paid Days', finalPaid],
                ['Late-Ins Count', record.deductions?.attendanceDeductionBreakdown?.lateInsCount || 0],
                ['Permissions Count', record.deductions?.permissionDeductionBreakdown?.permissionCount || 0],
                ['OT Hours', record.attendance?.otHours || 0],
                ['OT Days', record.attendance?.otDays || 0],
            ];

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
                didParseCell: (data) => {
                    if (data.section === 'body' && data.row.index === 9) {
                        data.cell.styles.fillColor = [254, 226, 226];
                        data.cell.styles.textColor = [185, 28, 28];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (data.section === 'body' && data.row.index === 10) {
                        data.cell.styles.fillColor = [220, 252, 231];
                        data.cell.styles.textColor = [22, 101, 52];
                        data.cell.styles.fontStyle = 'bold';
                    }
                },
                margin: { left: 14, right: pageWidth / 2 + 5 }
            });
            doc.setTextColor(0, 0, 0);

            // ===== SALARY BREAKDOWN =====
            yPos = (doc as any).lastAutoTable.finalY + 10;

            doc.setFont('helvetica', 'bold');
            doc.setFillColor(240, 240, 240);
            doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
            doc.text('SALARY BREAKDOWN', 14, yPos);
            yPos += 8;

            // EARNINGS TABLE
            const formatCurr = (amount: number) => `Rs. ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const earningsData = [
                ['Fixed 2nd Salary', formatCurr(record.earnings.basicPay)],
                ['Per Day Salary', formatCurr(record.earnings.perDayBasicPay)],
                ['Earned Salary', formatCurr(record.attendance?.earnedSalary || 0)],
                ...(record.earnings.allowances || []).map(a => [a.name, formatCurr(a.amount)]),
                ['Extra Days Pay', formatCurr(record.earnings.incentive)],
                ['OT Pay', formatCurr(record.earnings.otPay)],
                ['Arrears', formatCurr(record.arrearsAmount || 0)],
            ];

            autoTable(doc, {
                startY: yPos,
                head: [['EARNINGS', 'Amount']],
                body: earningsData,
                foot: [['TOTAL EARNINGS', formatCurr(record.earnings.grossSalary)]],
                theme: 'striped',
                headStyles: { fillColor: [46, 204, 113], fontSize: 10, fontStyle: 'bold' },
                footStyles: { fillColor: [39, 174, 96], fontSize: 11, fontStyle: 'bold', textColor: 255, cellPadding: 4 },
                bodyStyles: { fontSize: 9 },
                columnStyles: {
                    0: { cellWidth: 60 },
                    1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
                },
                margin: { left: 14, right: pageWidth / 2 + 5 }
            });

            // DEDUCTIONS TABLE
            const deductionsData = [
                ['Attendance Deduction', formatCurr(record.deductions.attendanceDeduction)],
                ['Permission Deduction', formatCurr(record.deductions.permissionDeduction)],
                ['Leave Deduction', formatCurr(record.deductions.leaveDeduction)],
                ...(record.deductions.otherDeductions || []).map(d => [d.name, formatCurr(d.amount)]),
                ['EMI Deduction', formatCurr(record.loanAdvance.totalEMI)],
                ['Advance Deduction', formatCurr(record.loanAdvance.advanceDeduction)],
            ];

            autoTable(doc, {
                startY: yPos,
                head: [['DEDUCTIONS', 'Amount']],
                body: deductionsData,
                foot: [['TOTAL DEDUCTIONS', formatCurr(record.deductions.totalDeductions)]],
                theme: 'striped',
                headStyles: { fillColor: [231, 76, 60], fontSize: 10, fontStyle: 'bold' },
                footStyles: { fillColor: [192, 57, 43], fontSize: 11, fontStyle: 'bold', textColor: 255, cellPadding: 4 },
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
            if (record.roundOff !== undefined && record.roundOff !== 0) {
                doc.setFontSize(10);
                doc.setFont('helvetica', 'normal');
                doc.text('Round Off:', 14, yPos);
                doc.text(`Rs. ${record.roundOff.toFixed(2)}`, pageWidth - 14, yPos, { align: 'right' });
                yPos += 8;
            }

            doc.setFillColor(41, 128, 185);
            doc.rect(10, yPos - 8, pageWidth - 20, 18, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('NET SALARY (Take Home):', 14, yPos);
            doc.text(`Rs. ${record.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, pageWidth - 14, yPos, { align: 'right' });

            doc.setTextColor(0, 0, 0);

            // ===== FOOTER =====
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text('This is a computer-generated payslip and does not require a signature.', pageWidth / 2, pageHeight - 15, { align: 'center' });
            doc.text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, pageWidth / 2, pageHeight - 10, { align: 'center' });

            // Save PDF
            doc.save(`Payslip_2ndSalary_${employee.emp_no}_${record.month}.pdf`);
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

    if (!record) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 flex items-center justify-center">
                <div className="text-center bg-white dark:bg-slate-800 p-8 rounded-xl shadow-xl max-w-md w-full mx-4">
                    <div className="text-red-500 text-6xl mb-4">⚠️</div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">Payslip Not Found</h1>
                    <p className="text-slate-600 dark:text-slate-300 mb-6">
                        {error || "The requested payslip record could not be found."}
                    </p>
                    <button
                        onClick={() => router.push('/superadmin/payslips/second-salary')}
                        className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg font-medium"
                    >
                        Back to List
                    </button>
                </div>
            </div>
        );
    }

    const employee = record.employeeId;

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50/50 via-indigo-50/50 to-blue-100/50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-2 md:p-4">
            <div className="w-full max-w-7xl mx-auto">
                {/* Top Navigation */}
                <div className="flex items-center justify-between mb-2">
                    <button
                        onClick={() => router.push('/superadmin/payslips/second-salary')}
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
                    <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-indigo-700 p-4 md:p-5 text-white text-center">
                        <div className="inline-block px-4 py-1 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-bold uppercase tracking-widest mb-2">
                            Private & Confidential
                        </div>
                        <h1 className="text-2xl md:text-3xl font-extrabold mb-1 tracking-tight">2ND SALARY SLIP</h1>
                        <div className="flex flex-col items-center gap-1">
                            <p className="text-base md:text-lg text-indigo-100 font-medium">
                                {record.monthName}
                            </p>
                            {record.startDate && record.endDate && (
                                <p className="text-[10px] text-indigo-200/80 bg-black/10 px-3 py-0.5 rounded-full">
                                    Period: {new Date(record.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {new Date(record.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="p-4 md:p-6 space-y-4">
                        <section>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <h2 className="text-base font-bold text-slate-800 dark:text-white uppercase tracking-tight">Employee Details</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
                                <DetailRow label="Employee Name" value={employee.employee_name} />
                                <DetailRow label="Employee ID" value={employee.emp_no} />
                                <DetailRow label="Department" value={typeof employee.department_id === 'object' ? (employee.department_id as any).name : (employee.department_id || 'N/A')} />
                                <DetailRow label="Designation" value={typeof employee.designation_id === 'object' ? (employee.designation_id as any).name : (employee.designation_id || 'N/A')} />
                                <DetailRow label="PF Number" value={employee.pf_number || 'N/A'} />
                                <DetailRow label="ESI Number" value={employee.esi_number || 'N/A'} />
                                <DetailRow label="UAN Number" value={employee.uan_number || 'N/A'} />
                                <DetailRow label="PAN Number" value={employee.pan_number || 'N/A'} />
                                <DetailRow label="Bank Details" value={`${employee.bank_account_no || 'N/A'} (${employee.location || 'N/A'})`} />
                            </div>
                        </section>

                        <section>
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-1.5 bg-amber-50 dark:bg-amber-900/40 rounded-xl">
                                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <h2 className="text-base font-bold text-slate-800 dark:text-white uppercase tracking-tight">Attendance Summary</h2>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-11 gap-2">
                                <StatusCard label="Month Days" value={record.attendance?.totalDaysInMonth} />
                                <StatusCard label="Present" value={record.attendance?.presentDays} color="indigo" />
                                <StatusCard label="Absents" value={record.attendance?.absentDays} color="rose" />
                                <StatusCard label="Week Offs" value={record.attendance?.weeklyOffs} />
                                <StatusCard label="Paid Leaves" value={record.attendance?.paidLeaveDays} color="emerald" />
                                <StatusCard label="Late-Ins" value={record.deductions?.attendanceDeductionBreakdown?.lateInsCount} color="amber" />
                                <StatusCard label="Permissions" value={record.deductions?.permissionDeductionBreakdown?.permissionCount} color="blue" />
                                <StatusCard label="OT Days" value={record.attendance?.otDays} color="amber" />
                                <StatusCard label="Total Paid Days" value={record.attendance?.totalPaidDays ?? record.attendance?.paidDays} />
                                <StatusCard label="Attendance Ded. Days" value={record.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? record.attendance?.attendanceDeductionDays} color="rose" />
                                <StatusCard label="Final Paid Days" value={record.attendance?.finalPaidDays ?? (typeof (record.attendance?.totalPaidDays ?? record.attendance?.paidDays) === 'number' ? Math.max(0, (record.attendance?.totalPaidDays ?? record.attendance?.paidDays ?? 0) - (record.deductions?.attendanceDeductionBreakdown?.daysDeducted ?? record.attendance?.attendanceDeductionDays ?? 0)) : undefined)} highlight />
                            </div>
                        </section>

                        {/* Salary Breakdown Section */}
                        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
                            {/* Earnings Column */}
                            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-emerald-500 rounded-full" />
                                        EARNINGS
                                    </h3>
                                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Additive</div>
                                </div>
                                <div className="space-y-1.5">
                                    <SalaryRow label="Fixed 2nd Salary" value={record.earnings.basicPay} />
                                    <SalaryRow label="Earned Salary" value={record.attendance?.earnedSalary || 0} />
                                    {record.earnings.allowances?.map((a, i) => (
                                        <SalaryRow key={i} label={a.name} value={a.amount} />
                                    ))}
                                    <SalaryRow label="Extra Days Pay" value={record.earnings.incentive} />
                                    <SalaryRow label="OT Allowance" value={record.earnings.otPay} />
                                    {record.arrearsAmount ? <SalaryRow label="Arrears" value={record.arrearsAmount} /> : null}

                                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-center text-emerald-700 dark:text-emerald-400">
                                            <span className="font-black text-[10px] uppercase tracking-wider">Gross Earnings</span>
                                            <span className="text-xl font-black">₹{record.earnings.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Deductions Column */}
                            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                                        <div className="w-2 h-6 bg-rose-500 rounded-full" />
                                        DEDUCTIONS
                                    </h3>
                                    <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Subtractive</div>
                                </div>
                                <div className="space-y-1.5">
                                    <SalaryRow label="Attendance Deduct" value={record.deductions.attendanceDeduction} isDeduction />
                                    {record.deductions.permissionDeduction > 0 && <SalaryRow label="Permission Deduct" value={record.deductions.permissionDeduction} isDeduction />}
                                    {record.deductions.leaveDeduction > 0 && <SalaryRow label="Leave Deduction" value={record.deductions.leaveDeduction} isDeduction />}
                                    {record.deductions.otherDeductions?.map((d, i) => (
                                        <SalaryRow key={i} label={d.name} value={d.amount} isDeduction />
                                    ))}
                                    {record.loanAdvance.totalEMI > 0 && <SalaryRow label="EMI (Loans)" value={record.loanAdvance.totalEMI} isDeduction />}
                                    {record.loanAdvance.advanceDeduction > 0 && <SalaryRow label="Advance Recovery" value={record.loanAdvance.advanceDeduction} isDeduction />}

                                    <div className="pt-3 mt-3 border-t border-slate-200 dark:border-slate-700">
                                        <div className="flex justify-between items-center text-rose-700 dark:text-rose-400">
                                            <span className="font-black text-[10px] uppercase tracking-wider">Total Deductions</span>
                                            <span className="text-xl font-black">₹{record.deductions.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Net Salary Highlight Footer */}
                    <div className="bg-slate-900 dark:bg-slate-950 p-4 md:p-6 text-white">
                        <div className="max-w-3xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                            <div className="text-center md:text-left">
                                <h4 className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">Net Payable Amount</h4>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl md:text-4xl font-black tracking-tighter">₹{record.netSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    <span className="text-indigo-400/60 text-xs font-medium">INR</span>
                                </div>
                                {record.roundOff !== 0 && (
                                    <p className="text-slate-400 text-[10px] mt-1 italic font-medium">
                                        Adjusted by ₹{record.roundOff?.toFixed(2)} round-off
                                    </p>
                                )}
                            </div>

                            <div className="flex flex-col items-center md:items-end gap-2">
                                <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${record.status === 'processed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                    record.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    }`}>
                                    Status: {record.status}
                                </div>
                                <div className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">
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
        blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40',
    };

    return (
        <div className={`p-2.5 rounded-2xl flex flex-col items-center justify-center transition-all ${highlight ? 'bg-indigo-600 text-white shadow-lg ring-4 ring-indigo-500/10 scale-105' : colors[color] || colors.slate
            }`}>
            <span className={`text-[9px] font-bold uppercase tracking-tighter mb-0.5 opacity-70 text-center`}>{label}</span>
            <span className="text-lg font-black">{value || 0}</span>
        </div>
    );
}

function SalaryRow({ label, value, isDeduction = false }: { label: string; value: number; isDeduction?: boolean }) {
    if (value === 0 && !['Fixed 2nd Salary', 'Earned Salary', 'Attendance Deduct'].includes(label)) return null;

    return (
        <div className="flex justify-between items-center group">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{label}</span>
            <span className={`text-sm font-bold ${isDeduction ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'}`}>
                {isDeduction ? '-' : ''}₹{value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </span>
        </div>
    );
}
