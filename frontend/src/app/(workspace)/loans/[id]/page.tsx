'use client';

import { useParams } from 'next/navigation';
import LoanDetailView from '@/components/loans/LoanDetailView';

export default function LoanDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  if (!id) return null;

  return <LoanDetailView loanId={id} />;
}
