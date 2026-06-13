export type LeaveSettingsKind = 'leave' | 'od' | 'ccl';

type LeaveSettingsCopy = {
  panelTitle: string;
  panelSubtitle: string;
  typesSectionTitle: string;
  typesTitle: string;
  typesDescription: string;
  typesEmpty: string;
  saveTypesLabel: string;
  namePlaceholder: string;
  paidLabel: string;
  unpaidLabel: string;
  backdatedTitle: string;
  backdatedDescription: string;
  futureTitle: string;
  futureDescription: string;
  policyTip: string;
};

const COPY: Record<LeaveSettingsKind, LeaveSettingsCopy> = {
  leave: {
    panelTitle: 'Leave Management',
    panelSubtitle: 'Configure leave categories, eligibility policies, and approval workflows.',
    typesSectionTitle: 'Leave Types',
    typesTitle: 'Available leave types',
    typesDescription: 'Define codes, names, and nature for supported leave categories.',
    typesEmpty: 'No leave types defined. Click "Add type" to start.',
    saveTypesLabel: 'Save Leave Types',
    namePlaceholder: 'Full Name (e.g. Sick Leave)',
    paidLabel: 'Paid Leave',
    unpaidLabel: 'Loss of Pay (LOP)',
    backdatedTitle: 'Backdated leave',
    backdatedDescription: 'Allow employees to apply for past dates.',
    futureTitle: 'Future dated leave',
    futureDescription: 'Allow employees to apply for future dates.',
    policyTip:
      'Restricting backdated applications helps in timely attendance processing. For major leaves, we recommend a max backdated period of 3–7 days.',
  },
  od: {
    panelTitle: 'On Duty (OD)',
    panelSubtitle: 'Configure OD categories, eligibility policies, and approval workflows.',
    typesSectionTitle: 'OD Types',
    typesTitle: 'Available OD types',
    typesDescription: 'Define codes, names, and nature for supported OD categories.',
    typesEmpty: 'No OD types defined. Click "Add type" to start.',
    saveTypesLabel: 'Save OD Types',
    namePlaceholder: 'Full Name (e.g. Official Visit)',
    paidLabel: 'Paid OD',
    unpaidLabel: 'Loss of Pay (LOP)',
    backdatedTitle: 'Backdated OD',
    backdatedDescription: 'Allow employees to apply OD for past dates.',
    futureTitle: 'Future dated OD',
    futureDescription: 'Allow employees to apply OD for future dates.',
    policyTip:
      'Restricting backdated OD applications helps in timely attendance processing. For extended duty, we recommend a max backdated period of 3–7 days.',
  },
  ccl: {
    panelTitle: 'Compensatory Casual Leave (CCL)',
    panelSubtitle: 'Configure CCL categories, eligibility policies, and approval workflows.',
    typesSectionTitle: 'CCL Types',
    typesTitle: 'Available CCL types',
    typesDescription: 'Define codes, names, and nature for supported CCL categories.',
    typesEmpty: 'No CCL types defined. Click "Add type" to start.',
    saveTypesLabel: 'Save CCL Types',
    namePlaceholder: 'Full Name (e.g. Compensatory Off)',
    paidLabel: 'Paid CCL',
    unpaidLabel: 'Loss of Pay (LOP)',
    backdatedTitle: 'Backdated CCL',
    backdatedDescription: 'Allow employees to apply for past dates.',
    futureTitle: 'Future dated CCL',
    futureDescription: 'Allow employees to apply for future dates.',
    policyTip:
      'Restricting backdated applications helps in timely attendance processing. For CCL claims, we recommend a max backdated period of 3–7 days.',
  },
};

export function leaveSettingsLabels(kind: LeaveSettingsKind): LeaveSettingsCopy {
  return COPY[kind];
}

export function normalizeLeaveTypeItem(raw: Record<string, unknown>, kind: LeaveSettingsKind) {
  const code = String(raw?.code ?? '').trim().toUpperCase();
  const name = String(raw?.name ?? raw?.label ?? '').trim();

  const normalized = {
    ...raw,
    code,
    name,
    color: (raw?.color as string) || '#4F46E5',
    isActive: raw?.isActive !== false,
  };

  if (kind === 'od') {
    const { isPaid, leaveNature, ...odType } = normalized;
    return odType;
  }

  return {
    ...normalized,
    isPaid: raw?.isPaid !== false,
  };
}

export function serializeLeaveTypesForSave(types: Record<string, unknown>[], kind: LeaveSettingsKind) {
  return types.map((raw) => {
    const normalized = normalizeLeaveTypeItem(raw, kind);
    if (kind === 'od') {
      const { isPaid, leaveNature, ...odType } = normalized;
      return odType;
    }
    return normalized;
  });
}
