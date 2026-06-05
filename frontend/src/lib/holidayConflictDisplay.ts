export interface HolidayDateConflict {
  scope: string;
  groupId: string | null;
  groupName: string;
  date: string;
  existingHolidayName: string;
  existingHolidayId: string;
  existingKind: string;
}

export function formatHolidayConflictHtml(
  conflicts: HolidayDateConflict[],
  message?: string
): string {
  if (conflicts?.length) {
    const rows = conflicts
      .map(
        (c) =>
          `<li><strong>${c.groupName}</strong> — ${c.date}: &quot;${c.existingHolidayName}&quot; <span style="opacity:0.85">(${c.existingKind})</span></li>`
      )
      .join('');
    const intro =
      message && message.includes('org-wide global holiday')
        ? `<p style="text-align:left;margin-bottom:8px">${message.split('\n')[0]}</p>`
        : `<p style="text-align:left;margin-bottom:8px">These groups or scopes already have a holiday on the selected date(s):</p>`;
    const footer =
      message && message.includes('org-wide global holiday')
        ? `<p style="text-align:left;margin-top:12px;font-size:0.9em">Remove or reschedule the group holiday first, or edit the existing group event instead of creating a global duplicate.</p>`
        : `<p style="text-align:left;margin-top:12px;font-size:0.9em">Update the existing holiday or choose different date(s).</p>`;
    return `${intro}<ul style="text-align:left;padding-left:1.25rem;margin:0">${rows}</ul>${footer}`;
  }

  if (message) {
    return `<div style="text-align:left;white-space:pre-line">${message.replace(/\n/g, '<br/>')}</div>`;
  }

  return '<p style="text-align:left">A holiday already exists on the selected date(s).</p>';
}
