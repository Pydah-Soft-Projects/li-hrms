'use client';

import type { ReactNode } from 'react';
import {
  LoanDetailSection,
  LoanDetailSectionTitle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerStatusBadgeClass, ledgerStatusBadgeLabel, type LedgerUiStatus } from '@/lib/ledgerUi';

export type LedgerTimelineStep = {
  label: string;
  status: 'approved' | 'rejected' | 'current' | 'pending';
  actionByName?: string;
  actionByRole?: string;
  timestamp?: string;
  comments?: string;
};

function mapStepStatus(status: LedgerTimelineStep['status']): LedgerUiStatus {
  if (status === 'approved' || status === 'rejected' || status === 'current') return status;
  return 'pending';
}

export function LedgerApprovalTimeline({ steps }: { steps: LedgerTimelineStep[] }) {
  if (!steps.length) return null;

  const processed = steps.filter((s) => s.status === 'approved' || s.status === 'rejected').length;
  const pct = Math.round((processed / steps.length) * 100);

  return (
    <LoanDetailSection soft>
      <LoanDetailSectionTitle>Approval timeline</LoanDetailSectionTitle>

      <div className="mb-6">
        <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-stone-500">
          <span>
            {processed} of {steps.length} processed
          </span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{ width: `${pct}%`, backgroundColor: 'var(--ps-accent)' }}
          />
        </div>
      </div>

      <div
        className="relative ml-1.5 border-l-2 pl-6"
        style={{ borderColor: 'var(--ps-accent-border)' }}
      >
        {steps.map((step, idx) => {
          const isApproved = step.status === 'approved';
          const isRejected = step.status === 'rejected';
          const isCurrent = step.status === 'current';
          const isPending = step.status === 'pending';

          let nodeClass = 'bg-stone-300 dark:bg-stone-700';
          let nodeStyle: React.CSSProperties | undefined;
          if (isApproved) nodeClass = 'bg-emerald-600';
          else if (isRejected) nodeClass = 'bg-rose-600';
          else if (isCurrent) {
            nodeClass = '';
            nodeStyle = {
              backgroundColor: 'var(--ps-accent)',
              boxShadow: '0 0 0 4px var(--ps-accent-soft)',
            };
          }

          return (
            <div key={`${step.label}-${idx}`} className="relative pb-8 last:pb-0">
              <div
                className={`absolute -left-[31px] top-0 z-10 h-4 w-4 rounded-full border-2 border-white dark:border-stone-950 ${nodeClass} ${isCurrent ? 'animate-pulse' : ''}`}
                style={nodeStyle}
              />
              <div className="ml-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm font-semibold uppercase tracking-tight ${
                      isPending && !isCurrent ? 'text-stone-400' : 'text-stone-900 dark:text-stone-100'
                    }`}
                  >
                    {step.label}
                  </span>
                  <span className={ledgerStatusBadgeClass(mapStepStatus(step.status))}>
                    {ledgerStatusBadgeLabel(mapStepStatus(isCurrent ? 'current' : step.status))}
                  </span>
                </div>

                {(isApproved || isRejected) && (
                  <div className="mt-2 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-tight text-stone-600 dark:text-stone-400">
                      {step.actionByName && (
                        <span
                          className="rounded px-1.5 py-0.5"
                          style={{ backgroundColor: 'var(--ps-accent-soft)' }}
                        >
                          {step.actionByName}
                        </span>
                      )}
                      {step.actionByRole && (
                        <span className="text-stone-400">({step.actionByRole})</span>
                      )}
                      {step.timestamp && (
                        <span className="text-[10px] font-normal normal-case text-stone-400">
                          ·{' '}
                          {new Date(step.timestamp).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    {step.comments && (
                      <p
                        className="border p-2.5 text-[11px] italic leading-relaxed text-stone-600 dark:text-stone-400"
                        style={{
                          borderColor: 'var(--ps-accent-border)',
                          backgroundColor: 'rgba(var(--ps-accent-rgb), 0.03)',
                        }}
                      >
                        &ldquo;{step.comments}&rdquo;
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </LoanDetailSection>
  );
}

export function LedgerWaitingBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="border p-4 text-sm text-stone-700 dark:text-stone-300"
      style={{ borderColor: 'var(--ps-accent-border)', backgroundColor: 'rgba(var(--ps-accent-rgb), 0.04)' }}
    >
      {children}
    </div>
  );
}
