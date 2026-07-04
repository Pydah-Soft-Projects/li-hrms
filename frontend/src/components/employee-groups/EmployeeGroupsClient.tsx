'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, EmployeeGroup } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Layers, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  LoansPageShell,
  LoansPageHeader,
  LoansStatGrid,
  LoansContentPanel,
  LoansSectionTitle,
  loansPrimaryButtonClass,
  loansPrimaryButtonStyle,
  loansTableHeadClass,
  loansTableHeadStyle,
} from '@/components/loans/LoansPageShell';
import {
  LoanDetailDialog,
  LoanDetailDialogHeader,
  LoanDetailDialogBody,
  LoanDialogFooter,
  LoanFormLabel,
  LoanFormPanel,
  loansFormInputClass,
  loansFormInputStyle,
} from '@/components/loans/LoanDetailDialogShell';
import { ledgerActionButtonClass, ledgerStatusBadgeClass, ledgerTableActionsCellClass, ledgerTableActionsGroupClass, ledgerTableActionsHeaderClass } from '@/lib/ledgerUi';
import {
  confirmDeleteWithAssignedEmployees,
  showDeleteError,
  showDeleteSuccess,
} from '@/lib/assignedEmployeesDeleteSwal';

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

function GroupRowActions({
  group,
  onEdit,
  onDelete,
}: {
  group: EmployeeGroup;
  onEdit: (g: EmployeeGroup) => void;
  onDelete: (g: EmployeeGroup) => void;
}) {
  return (
    <div className={ledgerTableActionsGroupClass('right')}>
      <button
        type="button"
        onClick={() => onEdit(group)}
        className={ledgerActionButtonClass('sky')}
        aria-label="Edit"
      >
        <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => void onDelete(group)}
        className={ledgerActionButtonClass('rose')}
        aria-label="Delete"
      >
        <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
    </div>
  );
}

function GroupStatusToggle({
  group,
  onToggle,
}: {
  group: EmployeeGroup;
  onToggle: (g: EmployeeGroup) => void;
}) {
  const active = group.isActive !== false;
  return (
    <button
      type="button"
      onClick={() => void onToggle(group)}
      className={ledgerStatusBadgeClass(active ? 'approved' : 'neutral')}
    >
      {active ? 'Active' : 'Inactive'}
    </button>
  );
}

export default function EmployeeGroupsClient() {
  const [groups, setGroups] = useState<EmployeeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editingId;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getEmployeeGroups();
      if (res.success && Array.isArray(res.data)) {
        setGroups(res.data);
      } else {
        setGroups([]);
      }
    } catch {
      toast.error('Failed to load employee groups');
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getSetting('custom_employee_grouping_enabled');
        setEnabled(!!res?.data?.value);
      } catch {
        setEnabled(false);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!checking) {
      void load();
    }
  }, [checking, load]);

  const stats = useMemo(() => {
    const active = groups.filter((g) => g.isActive !== false).length;
    return {
      total: groups.length,
      active,
      inactive: groups.length - active,
    };
  }, [groups]);

  const resetForm = () => {
    setName('');
    setCode('');
    setDescription('');
    setEditingId(null);
  };

  const closeFormDialog = () => {
    setFormOpen(false);
    resetForm();
  };

  const openCreateDialog = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditDialog = (g: EmployeeGroup) => {
    setEditingId(g._id);
    setName(g.name);
    setCode(g.code || '');
    setDescription(g.description || '');
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const res = await api.updateEmployeeGroup(editingId, {
          name: name.trim(),
          code: code.trim(),
          description: description.trim(),
        });
        if (res.success) {
          toast.success('Group updated');
          closeFormDialog();
          await load();
        } else {
          toast.error(res.message || 'Update failed');
        }
      } else {
        const res = await api.createEmployeeGroup({
          name: name.trim(),
          code: code.trim(),
          description: description.trim(),
        });
        if (res.success) {
          toast.success('Group created');
          closeFormDialog();
          await load();
        } else {
          toast.error(res.message || 'Create failed');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (g: EmployeeGroup) => {
    const res = await api.updateEmployeeGroup(g._id, { isActive: !g.isActive });
    if (res.success) {
      toast.success(g.isActive ? 'Group deactivated' : 'Group activated');
      await load();
    } else {
      toast.error(res.message || 'Update failed');
    }
  };

  const handleDelete = async (g: EmployeeGroup) => {
    try {
      const employeesResponse = await api.getEmployeeGroupEmployees(g._id);
      const employees: Array<{
        emp_no?: string;
        employee_name?: string;
        is_active?: boolean;
        department_id?: { name?: string };
        division_id?: { name?: string };
      }> = Array.isArray(employeesResponse?.data) ? employeesResponse.data : [];

      const confirmed = await confirmDeleteWithAssignedEmployees(g.name, employees, {
        entityLabel: 'Employee group',
        deleteConfirmButton: 'Delete group',
      });
      if (!confirmed) return;

      const res = await api.deleteEmployeeGroup(g._id);
      if (res.success) {
        if (editingId === g._id) closeFormDialog();
        await load();
        await showDeleteSuccess('Employee group');
      } else {
        await showDeleteError(res.message || 'Failed to delete employee group');
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'An error occurred while deleting employee group';
      await showDeleteError(message);
    }
  };

  if (checking) {
    return (
      <LoansPageShell>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Spinner />
        </div>
      </LoansPageShell>
    );
  }

  if (!enabled) {
    return (
      <LoansPageShell>
        <LoansPageHeader
          badge="Workforce"
          title="Employee groups"
          subtitle="Custom cohorts for employees and applications"
        />
        <LoanFormPanel soft className="mx-auto max-w-2xl text-center !py-10">
          <Layers className="mx-auto mb-4 h-10 w-10" style={{ color: 'var(--ps-accent)' }} />
          <h2 className="font-serif text-xl font-light text-stone-900 dark:text-stone-50">
            Custom employee grouping is off
          </h2>
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
            Turn on <strong>Enable custom employee grouping</strong> in General Settings, then return here to manage groups.
          </p>
        </LoanFormPanel>
      </LoansPageShell>
    );
  }

  return (
    <LoansPageShell>
      <LoansPageHeader
        badge="Workforce"
        title="Employee groups"
        subtitle="Cross-cutting cohorts (teams, batches) assigned to employees and applications"
        action={
          <button
            type="button"
            onClick={openCreateDialog}
            className={`inline-flex shrink-0 items-center gap-1 ${loansPrimaryButtonClass()}`}
            style={loansPrimaryButtonStyle()}
          >
            <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            <span className="sm:hidden">New</span>
            <span className="hidden sm:inline">New group</span>
          </button>
        }
      />

      <LoansStatGrid
        columns={3}
        stats={[
          { label: 'Total groups', value: stats.total, accent: true },
          { label: 'Active', value: stats.active, highlight: true },
          { label: 'Inactive', value: stats.inactive, muted: true },
        ]}
      />

      <LoansContentPanel>
        <div className="border-b px-3 py-2 sm:px-4 sm:py-2.5" style={ledgerBorder}>
          <LoansSectionTitle>All groups</LoansSectionTitle>
        </div>
        {loading ? (
          <div className="flex justify-center py-10 sm:py-16">
            <Spinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-10 text-center sm:py-16">
            <Layers className="mb-2 h-8 w-8 text-stone-300 sm:mb-3 sm:h-10 sm:w-10" />
            <p className="font-serif text-base font-light text-stone-800 dark:text-stone-100 sm:text-lg">
              No groups yet
            </p>
            <p className="mt-1 text-xs text-stone-500 sm:text-sm">Use New group in the header to create one.</p>
          </div>
        ) : (
          <>
            {/* Desktop / tablet: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className={loansTableHeadClass()} style={loansTableHeadStyle()}>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className={`px-3 py-2 ${ledgerTableActionsHeaderClass('right')}`}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-stone-800" style={ledgerBorder}>
                  {groups.map((g) => (
                    <tr key={g._id} className="transition-colors hover:bg-[var(--ps-accent-soft)]/30">
                      <td className="px-3 py-2 font-medium text-stone-900 dark:text-stone-100">{g.name}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-stone-600 dark:text-stone-400">
                        {g.code || '—'}
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-stone-600 dark:text-stone-400">
                        {g.description || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <GroupStatusToggle group={g} onToggle={toggleActive} />
                      </td>
                      <td className={`px-3 py-2 ${ledgerTableActionsCellClass('right')}`}>
                        <GroupRowActions group={g} onEdit={openEditDialog} onDelete={handleDelete} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: compact cards */}
            <div className="md:hidden divide-y" style={ledgerBorder}>
              {groups.map((g) => (
                <article
                  key={g._id}
                  className="flex items-start gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--ps-accent-soft)]/25"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <h3 className="truncate text-xs font-medium text-stone-900 dark:text-stone-100">
                        {g.name}
                      </h3>
                      {g.code ? (
                        <span className="shrink-0 font-mono text-[10px] text-stone-500 dark:text-stone-400">
                          {g.code}
                        </span>
                      ) : null}
                    </div>
                    {g.description ? (
                      <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-stone-500 dark:text-stone-400">
                        {g.description}
                      </p>
                    ) : null}
                    <div className="mt-1.5">
                      <GroupStatusToggle group={g} onToggle={toggleActive} />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                    <GroupRowActions group={g} onEdit={openEditDialog} onDelete={handleDelete} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </LoansContentPanel>

      <LoanDetailDialog open={formOpen} onClose={closeFormDialog} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <LoanDetailDialogHeader
            badge="Employee group"
            title={isEditing ? 'Edit group' : 'New group'}
            subtitle={
              isEditing
                ? 'Update name, code, or description'
                : 'Create a cohort for employees and applications'
            }
            onClose={closeFormDialog}
          />
          <LoanDetailDialogBody>
            <div className="space-y-4">
              <div>
                <LoanFormLabel>Name *</LoanFormLabel>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                  placeholder="e.g. Night shift batch A"
                  autoFocus
                />
              </div>
              <div>
                <LoanFormLabel>Code</LoanFormLabel>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                  placeholder="Optional short code"
                />
              </div>
              <div>
                <LoanFormLabel>Description</LoanFormLabel>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={loansFormInputClass()}
                  style={loansFormInputStyle()}
                  placeholder="Optional notes"
                />
              </div>
            </div>
          </LoanDetailDialogBody>
          <LoanDialogFooter
            onCancel={closeFormDialog}
            submitLabel={isEditing ? 'Save changes' : 'Create group'}
            submitDisabled={saving || !name.trim()}
            loading={saving}
          />
        </form>
      </LoanDetailDialog>
    </LoansPageShell>
  );
}
