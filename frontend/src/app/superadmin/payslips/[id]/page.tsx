'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, PayslipLoans, PayslipSections } from '@/lib/api';
import { resolvePayslipLoans } from '@/lib/payslipLoans';
import { toast } from 'react-toastify';
import jsPDF from 'jspdf';
import { fetchCompanyProfile } from '@/lib/companyProfile';
import { resolvePayslipSections } from '@/components/payslip/DynamicPayslipSections';
import { ModernPayslipView } from '@/components/payslip/ModernPayslipView';
import { drawDynamicPayslipPdf } from '@/lib/payslipPdfDynamic';

interface PayrollRecord {
  _id: string;
  employeeId: {
    emp_no: string;
    employee_name: string;
    department_id: { name: string } | string;
    designation_id: { name: string } | string;
    bank_account_no?: string;
    pf_number?: string;
    esi_number?: string;
  };
  emp_no: string;
  month: string;
  monthName: string;
  year: number;
  status: string;
  startDate?: string;
  endDate?: string;
  payslipSections?: PayslipSections;
  payslipLoans?: PayslipLoans;
  loanAdvance?: { emiBreakdown?: Array<{ loanId?: string; emiAmount?: number }> };
}

export default function PayslipDetailPage() {
  const params = useParams();
  const payrollId = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [payroll, setPayroll] = useState<PayrollRecord | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payrollId) fetchPayrollDetail();
  }, [payrollId]);

  const fetchPayrollDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getPayrollById(payrollId);
      if (response.success && response.data) {
        setPayroll(response.data as PayrollRecord);
      } else {
        setError(response.message || 'Payslip not found');
        toast.error(response.message || 'Failed to fetch payslip');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const generateDetailedPDF = async () => {
    if (!payroll) return;
    const sections = resolvePayslipSections(payroll);
    const loans = resolvePayslipLoans(payroll);
    if (!sections.hasConfiguredSections) {
      toast.error('Configure payslip sections in Payroll Configuration first');
      return;
    }

    setGeneratingPDF(true);
    try {
      const doc = new jsPDF();
      const profile = await fetchCompanyProfile();
      await drawDynamicPayslipPdf(doc, {
        payroll,
        employee: payroll.employeeId,
        sections,
        loans,
        profile,
      });
      doc.save(`Payslip_${payroll.employeeId.emp_no}_${payroll.month}.pdf`);
      toast.success('Payslip PDF downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate PDF');
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (!payroll) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Payslip not found</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
          <Link href="/superadmin/payslips" className="mt-6 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const sections = resolvePayslipSections(payroll);
  const loans = resolvePayslipLoans(payroll);

  return (
    <ModernPayslipView
      payroll={payroll}
      employee={payroll.employeeId}
      sections={sections}
      loans={loans}
      backHref="/superadmin/payslips"
      onDownload={generateDetailedPDF}
      downloading={generatingPDF}
    />
  );
}
