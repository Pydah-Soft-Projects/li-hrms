import { ledgerSwalFire } from '@/lib/customSwal';

type AssignedEmployee = {
  emp_no?: string;
  employee_name?: string;
  is_active?: boolean;
  department_id?: { name?: string } | string;
  division_id?: { name?: string } | string;
  designation_id?: { name?: string } | string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function orgName(ref: { name?: string } | string | undefined) {
  if (!ref) return '—';
  if (typeof ref === 'string') return ref;
  return ref.name || '—';
}

function buildEmployeeTableHtml(
  employees: AssignedEmployee[],
  fourthColumn: 'department' | 'designation' = 'department',
) {
  const fourthLabel = fourthColumn === 'designation' ? 'Designation' : 'Department';
  const preview = employees.slice(0, 12);
  const rows = preview
    .map((emp) => {
      const empNo = escapeHtml(emp.emp_no || '—');
      const name = escapeHtml(emp.employee_name || 'Unknown');
      const fourth = escapeHtml(
        orgName(
          (fourthColumn === 'designation' ? emp.designation_id : emp.department_id) as {
            name?: string;
          },
        ),
      );
      const division = escapeHtml(orgName(emp.division_id as { name?: string }));
      const status = emp.is_active ? 'Active' : 'Inactive';
      const statusClass = emp.is_active
        ? 'ledger-swal-badge ledger-swal-badge-active'
        : 'ledger-swal-badge ledger-swal-badge-neutral';
      return `
        <tr>
          <td class="ledger-swal-td ledger-swal-td-mono" data-label="Emp no">${empNo}</td>
          <td class="ledger-swal-td ledger-swal-td-name" data-label="Name">${name}</td>
          <td class="ledger-swal-td ledger-swal-col-org" data-label="Division">${division}</td>
          <td class="ledger-swal-td ledger-swal-col-org" data-label="${fourthLabel}">${fourth}</td>
          <td class="ledger-swal-td ledger-swal-td-status" data-label="Status"><span class="${statusClass}">${status}</span></td>
        </tr>
      `;
    })
    .join('');

  const moreCount = employees.length - preview.length;

  return `
    <div class="ledger-swal-table-wrap">
      <table class="ledger-swal-table">
        <thead>
          <tr>
            <th class="ledger-swal-th-mono">Emp no</th>
            <th>Name</th>
            <th class="ledger-swal-col-org">Division</th>
            <th class="ledger-swal-col-org">${fourthLabel}</th>
            <th class="ledger-swal-th-status">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${moreCount > 0 ? `<p class="ledger-swal-more">…and ${moreCount} more employee(s).</p>` : ''}
  `;
}

export type AssignedEntityDeleteLabels = {
  entityLabel: string;
  deleteConfirmButton: string;
  /** Fourth table column when listing assigned employees */
  fourthColumn?: 'department' | 'designation';
};

/**
 * Ledger-styled delete flow: list assigned employees, block when active exist,
 * allow delete when none or inactive-only.
 */
export async function confirmDeleteWithAssignedEmployees(
  entityName: string,
  employees: AssignedEmployee[],
  labels: AssignedEntityDeleteLabels,
): Promise<boolean> {
  const activeEmployees = employees.filter((emp) => emp?.is_active);
  const hasOnlyInactiveEmployees = employees.length > 0 && activeEmployees.length === 0;

  if (employees.length > 0) {
    const employeesToShow = activeEmployees.length > 0 ? activeEmployees : employees;
    const listDialogResult = await ledgerSwalFire({
      size: 'lg',
      icon: hasOnlyInactiveEmployees ? 'info' : 'warning',
      title: hasOnlyInactiveEmployees ? 'Inactive employees' : `Cannot delete`,
      html: `
        <div class="ledger-swal-prose">
          <p class="ledger-swal-lead">
            ${
              hasOnlyInactiveEmployees
                ? `This ${labels.entityLabel.toLowerCase()} is assigned to <strong>${employees.length}</strong> employee(s), and all are inactive.`
                : `This ${labels.entityLabel.toLowerCase()} is currently assigned to <strong>${activeEmployees.length}</strong> active employee(s).`
            }
          </p>
          <p class="ledger-swal-sub">
            ${
              hasOnlyInactiveEmployees
                ? 'You can proceed with deletion. Inactive employees may still reference this group until cleared manually.'
                : 'Please reassign active employees before deleting.'
            }
          </p>
          ${buildEmployeeTableHtml(employeesToShow, labels.fourthColumn ?? 'department')}
        </div>
      `,
      showCancelButton: hasOnlyInactiveEmployees,
      confirmButtonText: hasOnlyInactiveEmployees ? labels.deleteConfirmButton : 'Okay',
      cancelButtonText: 'Cancel',
      confirmVariant: hasOnlyInactiveEmployees ? 'danger' : 'primary',
    });

    if (!hasOnlyInactiveEmployees || !listDialogResult.isConfirmed) {
      return false;
    }
  }

  if (!hasOnlyInactiveEmployees) {
    const confirmResult = await ledgerSwalFire({
      size: 'sm',
      title: `Delete ${labels.entityLabel}?`,
      text: `Delete "${entityName}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      confirmVariant: 'danger',
    });

    if (!confirmResult.isConfirmed) return false;
  }

  return true;
}

export async function showDeleteSuccess(entityLabel: string) {
  await ledgerSwalFire({
    size: 'sm',
    icon: 'success',
    title: 'Deleted',
    text: `${entityLabel} removed.`,
    confirmButtonText: 'Done',
    confirmVariant: 'success',
  });
}

export async function showDeleteError(message: string) {
  await ledgerSwalFire({
    size: 'sm',
    icon: 'error',
    title: 'Error',
    text: message,
    confirmButtonText: 'Close',
    confirmVariant: 'danger',
  });
}
