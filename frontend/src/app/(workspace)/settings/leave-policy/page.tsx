'use client';

import LeavePolicySettings from '@/components/settings/LeavePolicySettings';
import { SettingsPanel } from '@/components/settings/SettingsPageShell';

export default function LeavePolicyPage() {
  return (
    <SettingsPanel>
      <LeavePolicySettings />
    </SettingsPanel>
  );
}
