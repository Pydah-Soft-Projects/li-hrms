'use client';

import { Settings } from 'lucide-react';
import {
  FEATURE_SUFFIX,
  featurePerm,
  toggleFeaturePermission,
  type GranularModuleDef,
  SECOND_SALARY_TOGGLE_TITLE,
  VERIFY_EMPLOYEES_TOGGLE_TITLE,
  PROFILE_APPROVAL_TOGGLE_TITLE,
} from '@/lib/userFeaturePermissions';

type Props = {
  module: GranularModuleDef;
  featureControl: string[] | undefined;
  onChange: (next: string[]) => void;
  /** When false, hides the 2nd Salary toggle (org payroll setting off). */
  secondSalaryOrgEnabled?: boolean;
  /** Callback to open profile approval fields configuration modal. */
  onConfigureProfileApproval?: () => void;
  /** Current profile approval configuration */
  profileApprovalConfig?: {
    allFields?: boolean;
    allowedFields?: string[];
  };
};

function ToggleButton({
  active,
  onClick,
  title,
  label,
  activeClass,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  label: string;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
        active ? `${activeClass} text-white shadow-sm` : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
      }`}
    >
      {label}
    </button>
  );
}

/** Extra permission toggles beyond Read/Write (Verify, Bank, 2nd Salary, File, Edit). */
export default function ModuleGranularPermissionToggles({
  module,
  featureControl,
  onChange,
  secondSalaryOrgEnabled = true,
  onConfigureProfileApproval,
  profileApprovalConfig,
}: Props) {
  const fc = featureControl || [];
  const code = module.code;
  const toggle = (suffix: string) => onChange(toggleFeaturePermission(fc, featurePerm(code, suffix)));

  const verifyTitle =
    code === 'EMPLOYEES'
      ? VERIFY_EMPLOYEES_TOGGLE_TITLE
      : 'Verify: grants module verify actions. Independent of Read/Write.';

  const extraButtons = [
    module.verifiable ? (
      <ToggleButton
        key="verify"
        active={fc.includes(featurePerm(code, FEATURE_SUFFIX.verify))}
        onClick={() => toggle(FEATURE_SUFFIX.verify)}
        title={verifyTitle}
        label="Verify"
        activeClass="bg-violet-500"
      />
    ) : null,
    module.bankable ? (
      <ToggleButton
        key="bank"
        active={fc.includes(featurePerm(code, FEATURE_SUFFIX.bank))}
        onClick={() => toggle(FEATURE_SUFFIX.bank)}
        title="Bank: grants access to update bank details. Independent of Read/Write."
        label="Bank"
        activeClass="bg-amber-500"
      />
    ) : null,
    secondSalaryOrgEnabled && module.secondSalaryEditable ? (
      <ToggleButton
        key="secondSalary"
        active={fc.includes(featurePerm(code, FEATURE_SUFFIX.secondSalary))}
        onClick={() => toggle(FEATURE_SUFFIX.secondSalary)}
        title={SECOND_SALARY_TOGGLE_TITLE}
        label="2nd Salary"
        activeClass="bg-lime-600"
      />
    ) : null,
    module.fileUploadable ? (
      <ToggleButton
        key="file"
        active={fc.includes(featurePerm(code, FEATURE_SUFFIX.file))}
        onClick={() => toggle(FEATURE_SUFFIX.file)}
        title="File: allows OD evidence from device gallery or file picker (camera still available without this)."
        label="File"
        activeClass="bg-sky-500"
      />
    ) : null,
    module.editable ? (
      <ToggleButton
        key="edit"
        active={fc.includes(featurePerm(code, FEATURE_SUFFIX.edit))}
        onClick={() => toggle(FEATURE_SUFFIX.edit)}
        title="Edit: profile update requests from this user are auto-approved without Super Admin review."
        label="Edit"
        activeClass="bg-rose-500"
      />
    ) : null,
    module.profileApprover ? (
      <div key="profileApproval" className="flex items-center gap-1">
        <ToggleButton
          active={fc.includes(featurePerm(code, FEATURE_SUFFIX.profileApproval))}
          onClick={() => toggle(FEATURE_SUFFIX.profileApproval)}
          title={PROFILE_APPROVAL_TOGGLE_TITLE}
          label="Profile Appr"
          activeClass="bg-purple-600"
        />
        {fc.includes(featurePerm(code, FEATURE_SUFFIX.profileApproval)) && onConfigureProfileApproval && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onConfigureProfileApproval();
            }}
            title={
              profileApprovalConfig?.allFields === false
                ? `Configured fields (${profileApprovalConfig.allowedFields?.length || 0} allowed). Click to edit.`
                : 'All fields allowed. Click to configure specific fields.'
            }
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:hover:bg-purple-900/80 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="flex max-w-[22rem] flex-wrap gap-2">
      {extraButtons.map((button) => (
        <div key={String(button?.key ?? Math.random())} className="flex-[0_0_calc(33.333%-0.5rem)] min-w-[5.5rem]">
          {button}
        </div>
      ))}
    </div>
  );
}
