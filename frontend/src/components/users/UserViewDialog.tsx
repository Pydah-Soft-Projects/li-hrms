'use client';

import {
  Building,
  Clock,
  Edit,
  Eye,
  Globe,
  Info,
  Layers,
  Lock,
  RotateCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { MODULE_CATEGORIES } from '@/config/moduleCategories';
import { getReadButtonLabel, getWriteButtonLabel } from '@/lib/modulePermissionLabels';
import type { Department, Division, User, UserHistoryRow } from '@/lib/api';
import Spinner from '@/components/Spinner';
import {
  LoanDetailDialog,
  LoanDetailDialogBody,
  LoanDetailField,
  LoanDetailSection,
  LoanDetailSectionTitle,
  loansDialogOutlineButtonClass,
  loansDialogOutlineButtonStyle,
  loansDialogPrimaryButtonClass,
  loansDialogPrimaryButtonStyle,
} from '@/components/loans/LoanDetailDialogShell';
import {
  permissionChipClass,
  userActiveBadgeClass,
  userActiveLabel,
  userAvatarClass,
  userAvatarStyle,
  userRoleBadgeClass,
  userStatusDotClass,
  userTabClass,
  type UserLedgerTab,
} from '@/components/users/userLedgerUi';

const ledgerBorder = { borderColor: 'var(--ps-accent-border)' };

export function UserViewDialog({
  open,
  onClose,
  user,
  divisions,
  departments,
  getRoleLabel,
  activeTab,
  onTabChange,
  onEdit,
  showActivityTab,
  loadingUserActivity,
  userActivity,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  divisions: Division[];
  departments: Department[];
  getRoleLabel: (role: string) => string;
  activeTab: UserLedgerTab;
  onTabChange: (tab: UserLedgerTab) => void;
  onEdit: () => void;
  showActivityTab: boolean;
  loadingUserActivity: boolean;
  userActivity: UserHistoryRow[];
}) {
  const empId = user.employeeId || user.employeeRef?.emp_no || '-';
  const tabs: { id: UserLedgerTab; label: string; icon: typeof Layers }[] = [
    { id: 'overview', label: 'Overview', icon: Layers },
    { id: 'permissions', label: 'Access', icon: Lock },
    ...(showActivityTab ? [{ id: 'activity' as const, label: 'Activity', icon: Info }] : []),
  ];

  return (
    <LoanDetailDialog open={open} onClose={onClose} maxWidth="max-w-5xl">
      <div className="shrink-0 border-b" style={ledgerBorder}>
        <div
          className="px-5 py-5 sm:px-6"
          style={{
            borderColor: 'var(--ps-accent-border)',
            backgroundImage: 'linear-gradient(180deg, var(--ps-accent-soft) 0%, transparent 100%)',
          }}
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className={userAvatarClass('lg')} style={userAvatarStyle()}>
                {user.name?.[0]?.toUpperCase() || '?'}
                <span className={userStatusDotClass(!!user.isActive)} />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[10px] font-semibold uppercase tracking-[0.32em]"
                  style={{ color: 'var(--ps-accent-ink)' }}
                >
                  User profile
                </p>
                <h2 className="mt-1 font-serif text-2xl font-light tracking-tight text-stone-900 dark:text-stone-50">
                  {user.name || 'Unnamed user'}
                </h2>
                <p className="mt-1 truncate text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={userRoleBadgeClass(user.role)}>
                    <Shield className="h-3 w-3" />
                    {getRoleLabel(user.role)}
                  </span>
                  <span className={userActiveBadgeClass(!!user.isActive)}>{userActiveLabel(!!user.isActive)}</span>
                  <span className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-stone-600 dark:text-stone-300" style={ledgerBorder}>
                    <Globe className="h-3 w-3" style={{ color: 'var(--ps-accent)' }} />
                    {user.dataScope === 'all' ? 'Global scope' : 'Restricted scope'}
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onEdit}
              className={`${loansDialogPrimaryButtonClass()} shrink-0`}
              style={loansDialogPrimaryButtonStyle()}
            >
              <Edit className="h-3.5 w-3.5" />
              Edit user
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <LoanDetailField label="Employee ID">{empId}</LoanDetailField>
            <LoanDetailField label="Data scope">
              {user.dataScope === 'all' ? 'All divisions' : String(user.dataScope || '—')}
            </LoanDetailField>
            <LoanDetailField label="Phone">{user.phone_number || '—'}</LoanDetailField>
            <LoanDetailField label="Last login">
              {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
            </LoanDetailField>
          </div>
        </div>

        <div className="flex gap-1 overflow-x-auto px-5 sm:px-6" style={ledgerBorder}>
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)} className={userTabClass(activeTab === tab.id)}>
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {activeTab === tab.id ? (
                <span
                  className="absolute bottom-0 left-0 h-0.5 w-full rounded-t-full"
                  style={{ backgroundColor: 'var(--ps-accent)' }}
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <LoanDetailDialogBody>
        {activeTab === 'overview' ? (
          <div className="space-y-5">
            <LoanDetailSection>
              <LoanDetailSectionTitle>Division & department access</LoanDetailSectionTitle>
              {!user.divisionMapping || user.divisionMapping.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center border border-dashed px-6 py-10 text-center"
                  style={ledgerBorder}
                >
                  <ShieldAlert className="mb-3 h-8 w-8 text-stone-300" />
                  <p className="text-sm font-medium text-stone-500">No explicit unit mappings</p>
                  <p className="mt-1 text-[10px] uppercase tracking-widest text-stone-400">
                    Global or role defaults may apply
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {user.divisionMapping.map((mapping: any, idx: number) => {
                    const divId = typeof mapping.division === 'string' ? mapping.division : mapping.division?._id;
                    const division = divisions.find((d) => d._id === divId);
                    const divisionName = division?.name || 'Division';
                    const deptIds =
                      mapping.departments?.map((d: any) => (typeof d === 'string' ? d : d._id)) || [];

                    return (
                      <div
                        key={idx}
                        className="border bg-white p-4 dark:bg-stone-950"
                        style={ledgerBorder}
                      >
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <Building className="h-4 w-4 shrink-0" style={{ color: 'var(--ps-accent)' }} />
                            <span className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">
                              {divisionName}
                            </span>
                          </div>
                          <span className={userRoleBadgeClass('hod')}>Scoped</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {deptIds.length === 0 ? (
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">
                              All departments in division
                            </span>
                          ) : (
                            deptIds.map((deptId: string) => {
                              const dept = departments.find((d) => d._id === deptId);
                              return (
                                <span
                                  key={deptId}
                                  className="rounded border px-2 py-1 text-[10px] font-medium text-stone-600 dark:text-stone-300"
                                  style={ledgerBorder}
                                >
                                  {dept?.name || 'Department'}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </LoanDetailSection>

            <LoanDetailSection soft>
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--ps-accent)' }} />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--ps-accent-ink)' }}>
                    Access policy
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
                    Visibility follows assigned divisions and departments. Hierarchy changes propagate automatically to this user&apos;s scope.
                  </p>
                </div>
              </div>
            </LoanDetailSection>
          </div>
        ) : activeTab === 'permissions' ? (
          <div className="space-y-5">
            <LoanDetailSection>
              <LoanDetailSectionTitle>Module permissions</LoanDetailSectionTitle>
              {!user.featureControl || user.featureControl.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <ShieldCheck className="mb-4 h-12 w-12 text-emerald-500/30" />
                  <p className="text-sm font-medium text-stone-600 dark:text-stone-300">Role defaults active</p>
                  <p className="mt-1 text-xs text-stone-500">
                    Using standard permissions for {getRoleLabel(user.role)}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {MODULE_CATEGORIES.map((category) => {
                    const modulesWithPerms = category.modules
                      .map((m) => ({
                        ...m,
                        hasRead: user.featureControl?.includes(`${m.code}:read`) || false,
                        hasWrite: user.featureControl?.includes(`${m.code}:write`) || false,
                        hasVerify: (m as any).verifiable
                          ? user.featureControl?.includes(`${m.code}:verify`) || false
                          : false,
                        hasTerminate: (m as any).terminable
                          ? user.featureControl?.includes(`${m.code}:terminate`) || false
                          : false,
                        hasRelease: (m as any).releasable
                          ? user.featureControl?.includes(`${m.code}:release`) || false
                          : false,
                      }))
                      .filter((m) => m.hasRead || m.hasWrite || m.hasVerify || m.hasTerminate || m.hasRelease);

                    if (modulesWithPerms.length === 0) return null;

                    return (
                      <div key={category.code} className="border bg-white dark:bg-stone-950" style={ledgerBorder}>
                        <div
                          className="flex items-center gap-2 border-b px-4 py-3"
                          style={{ ...ledgerBorder, backgroundColor: 'rgba(var(--ps-accent-rgb), 0.04)' }}
                        >
                          <span>{category.icon}</span>
                          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-800 dark:text-stone-200">
                            {category.name}
                          </h4>
                        </div>
                        <div className="grid gap-2 p-4 sm:grid-cols-2">
                          {modulesWithPerms.map((m) => (
                            <div
                              key={m.code}
                              className="flex items-center justify-between gap-2 border px-3 py-2.5"
                              style={ledgerBorder}
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-stone-700 dark:text-stone-300">
                                {m.label}
                              </span>
                              <div className="flex flex-wrap justify-end gap-1">
                                {m.hasRead ? <span className={permissionChipClass('read')}><Eye className="h-3 w-3" />{getReadButtonLabel(m.code)}</span> : null}
                                {m.hasWrite ? <span className={permissionChipClass('write')}>{getWriteButtonLabel(m.code)}</span> : null}
                                {m.hasVerify ? <span className={permissionChipClass('verify')}>Verify</span> : null}
                                {m.hasTerminate ? <span className={permissionChipClass('terminate')}>Terminate</span> : null}
                                {m.hasRelease ? <span className={permissionChipClass('release')}>Release</span> : null}
                                {user.featureControl?.includes(`${m.code}:bank`) ? (
                                  <span className={permissionChipClass('bank')}><RotateCw className="h-3 w-3" />Bank</span>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </LoanDetailSection>
          </div>
        ) : (
          <LoanDetailSection>
            <LoanDetailSectionTitle>Activity log</LoanDetailSectionTitle>
            {loadingUserActivity ? (
              <div className="flex h-40 items-center justify-center">
                <Spinner />
              </div>
            ) : userActivity.length === 0 ? (
              <div className="border border-dashed px-6 py-10 text-center text-sm text-stone-500" style={ledgerBorder}>
                No activity recorded yet.
              </div>
            ) : (
              <div className="space-y-2">
                {userActivity.map((row) => (
                  <div key={row._id} className="border bg-white p-4 dark:bg-stone-950" style={ledgerBorder}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-widest text-stone-900 dark:text-stone-100">
                          {row.event}
                        </p>
                        <p className="mt-1 text-xs text-stone-500">{row.comments || '—'}</p>
                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                          By {row.performedByName || 'System'}
                          {row.performedByRole ? ` (${row.performedByRole})` : ''}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                        <Clock className="h-3 w-3" />
                        {row.timestamp ? new Date(row.timestamp).toLocaleString() : '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </LoanDetailSection>
        )}
      </LoanDetailDialogBody>

      <div className="shrink-0 border-t px-5 py-4 sm:px-6" style={ledgerBorder}>
        <button
          type="button"
          onClick={onClose}
          className={loansDialogOutlineButtonClass()}
          style={loansDialogOutlineButtonStyle()}
        >
          Close
        </button>
      </div>
    </LoanDetailDialog>
  );
}
