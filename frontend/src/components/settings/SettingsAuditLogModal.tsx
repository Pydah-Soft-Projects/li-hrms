'use client';

import React from 'react';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
} from '@/components/loans/LoanDetailDialogShell';
import SettingsAuditLogView from './SettingsAuditLogView';

interface SettingsAuditLogModalProps {
  open: boolean;
  onClose: () => void;
  settingKey?: string;
  category?: string;
}

export default function SettingsAuditLogModal({
  open,
  onClose,
  settingKey,
  category,
}: SettingsAuditLogModalProps) {
  if (!open) return null;

  return (
    <LoanDetailDialog open={open} onClose={onClose} maxWidth="max-w-6xl">
      <LoanDetailDialogHeader
        title={settingKey ? `Audit Log: ${settingKey}` : 'Settings Audit Log'}
        badge={category || 'Governance'}
        onClose={onClose}
      />
      <LoanDetailDialogBody>
        <div className="max-h-[80vh] overflow-y-auto p-4">
          <SettingsAuditLogView initialSettingKey={settingKey} initialCategory={category} />
        </div>
      </LoanDetailDialogBody>
    </LoanDetailDialog>
  );
}
