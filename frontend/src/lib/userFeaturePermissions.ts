/** Granular feature-control suffixes (independent of read/write). */
export const FEATURE_SUFFIX = {
  verify: 'verify',
  bank: 'bank',
  edit: 'edit',
  secondSalary: 'second_salary',
  file: 'file',
  terminate: 'terminate',
  release: 'release',
} as const;

export type GranularModuleDef = {
  code: string;
  label?: string;
  verifiable?: boolean;
  bankable?: boolean;
  editable?: boolean;
  secondSalaryEditable?: boolean;
  fileUploadable?: boolean;
  terminable?: boolean;
  releasable?: boolean;
};

export function featurePerm(moduleCode: string, suffix: string): string {
  return `${moduleCode}:${suffix}`;
}

export function toggleFeaturePermission(current: string[] | undefined, perm: string): string[] {
  const list = current || [];
  return list.includes(perm) ? list.filter((f) => f !== perm) : [...list, perm];
}

export function hasFeaturePerm(featureControl: string[] | undefined, perm: string): boolean {
  return !!(featureControl || []).includes(perm);
}

export type ModulePermissionFlags = {
  hasRead: boolean;
  hasWrite: boolean;
  hasVerify: boolean;
  hasBank: boolean;
  hasEdit: boolean;
  hasSecondSalary: boolean;
  hasFile: boolean;
  hasTerminate: boolean;
  hasRelease: boolean;
};

export function collectModulePermissionFlags(
  module: GranularModuleDef,
  featureControl: string[] | undefined
): ModulePermissionFlags {
  const fc = featureControl || [];
  const code = module.code;
  return {
    hasRead: fc.includes(`${code}:read`),
    hasWrite: fc.includes(`${code}:write`),
    hasVerify: module.verifiable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.verify)) : false,
    hasBank: module.bankable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.bank)) : false,
    hasEdit: module.editable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.edit)) : false,
    hasSecondSalary: module.secondSalaryEditable
      ? fc.includes(featurePerm(code, FEATURE_SUFFIX.secondSalary))
      : false,
    hasFile: module.fileUploadable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.file)) : false,
    hasTerminate: module.terminable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.terminate)) : false,
    hasRelease: module.releasable ? fc.includes(featurePerm(code, FEATURE_SUFFIX.release)) : false,
  };
}

export function moduleHasAnyGrantedPermission(flags: ModulePermissionFlags): boolean {
  return (
    flags.hasRead ||
    flags.hasWrite ||
    flags.hasVerify ||
    flags.hasBank ||
    flags.hasEdit ||
    flags.hasSecondSalary ||
    flags.hasFile ||
    flags.hasTerminate ||
    flags.hasRelease
  );
}

export const SECOND_SALARY_TOGGLE_TITLE =
  '2nd Salary: allows setting second salary on employee applications and employee records. Independent of Read/Write. Super Admin always has this.';

export const VERIFY_EMPLOYEES_TOGGLE_TITLE =
  'Verify: access Applications tab, create applications, and verify employee applications. Independent of Read/Write.';

const LEGACY_PT = 'PROMOTIONS_TRANSFERS';

/**
 * Expand legacy combined PROMOTIONS_TRANSFERS grants into separate PROMOTIONS + TRANSFERS
 * keys for the user-management UI. Removes the legacy keys so saves persist the split model.
 */
export function expandLegacyPromotionTransferPermissions(
  featureControl: string[] | undefined | null
): string[] {
  const list = Array.isArray(featureControl) ? [...featureControl] : [];
  const hasLegacyPlain = list.includes(LEGACY_PT);
  const hasLegacyRead = list.includes(`${LEGACY_PT}:read`);
  const hasLegacyWrite = list.includes(`${LEGACY_PT}:write`);

  if (!hasLegacyPlain && !hasLegacyRead && !hasLegacyWrite) {
    return list;
  }

  const next = new Set(
    list.filter(
      (p) => p !== LEGACY_PT && p !== `${LEGACY_PT}:read` && p !== `${LEGACY_PT}:write`
    )
  );

  if (hasLegacyPlain || hasLegacyWrite) {
    next.add('PROMOTIONS:read');
    next.add('PROMOTIONS:write');
    next.add('TRANSFERS:read');
    next.add('TRANSFERS:write');
  } else if (hasLegacyRead) {
    next.add('PROMOTIONS:read');
    next.add('TRANSFERS:read');
  }

  return Array.from(next);
}
