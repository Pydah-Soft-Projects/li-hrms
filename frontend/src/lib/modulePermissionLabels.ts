/** Payslips use Self / Scoped / Release instead of Read / Write in the UI. */

export type PermissionLevel = 'disabled' | 'read' | 'write';

export function usesScopedPermissionLabels(moduleCode: string): boolean {
  return moduleCode === 'PAYSLIPS';
}

export function getAccessLevelLabel(moduleCode: string, level: PermissionLevel): string {
  if (usesScopedPermissionLabels(moduleCode)) {
    if (level === 'read') return 'Self';
    if (level === 'write') return 'Scoped';
    return 'Off';
  }
  if (level === 'read') return 'Read';
  if (level === 'write') return 'Write';
  return 'Off';
}

export function getReadButtonLabel(moduleCode: string): string {
  return usesScopedPermissionLabels(moduleCode) ? 'Self' : 'Read';
}

export function getWriteButtonLabel(moduleCode: string): string {
  return usesScopedPermissionLabels(moduleCode) ? 'Scoped' : 'Write';
}

export function getReadButtonTitle(moduleCode: string): string {
  if (usesScopedPermissionLabels(moduleCode)) {
    return 'Self: view own released payslips only.';
  }
  return 'Read: view access.';
}

export function getWriteButtonTitle(moduleCode: string): string {
  if (usesScopedPermissionLabels(moduleCode)) {
    return 'Scoped: view payslips for employees within data scope.';
  }
  return 'Write: manage access.';
}

export function getReleaseButtonTitle(moduleCode: string): string {
  if (usesScopedPermissionLabels(moduleCode)) {
    return 'Release: release payslips for scoped employees (matches current filters).';
  }
  return 'Release';
}
