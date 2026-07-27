'use client';

import LoanDetailView from '@/components/loans/LoanDetailView';

export default function LoanDetailPage({ params }: { params: { id: string } }) {
  return <LoanDetailView loanId={params.id} />;
}
