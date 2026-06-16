'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsField,
  SettingsToggleRow,
  SettingsSaveBar,
  SettingsOutlineButton,
} from '@/components/settings/SettingsPageShell';
import { settingsInputClass, settingsInputStyle, settingsLedgerBorder } from '@/lib/settingsUi';

type FileStorageProvider = 's3' | 'local';

type FileStorageConfig = {
  provider: FileStorageProvider;
  s3: {
    accessKeyId: string;
    secretAccessKey: string;
    hasSecretAccessKey?: boolean;
    bucketName: string;
    region: string;
    endpoint: string;
    forcePathStyle: boolean;
  };
  local: {
    basePath: string;
    publicBaseUrl: string;
    backendPublicUrl: string;
  };
};

const DEFAULT_FILE_STORAGE_CONFIG: FileStorageConfig = {
  provider: 'local',
  s3: {
    accessKeyId: '',
    secretAccessKey: '',
    bucketName: '',
    region: 'us-east-1',
    endpoint: '',
    forcePathStyle: false,
  },
  local: {
    basePath: './uploads',
    publicBaseUrl: '/api/files',
    backendPublicUrl: '',
  },
};

const GeneralSettings = () => {
  const [lateInGrace, setLateInGrace] = useState<number>(15);
  const [earlyOutGrace, setEarlyOutGrace] = useState<number>(15);
  const [allowEmployeeBulkProcess, setAllowEmployeeBulkProcess] = useState<boolean>(false);
  const [customEmployeeGroupingEnabled, setCustomEmployeeGroupingEnabled] = useState<boolean>(false);
  const [autoODCreationEnabled, setAutoODCreationEnabled] = useState<boolean>(false);
  const [leaveAttendanceReconciliationEnabled, setLeaveAttendanceReconciliationEnabled] =
    useState<boolean>(true);
  const [skipLeaveAttendanceReconciliation, setSkipLeaveAttendanceReconciliation] =
    useState<boolean>(false);
  const [fileStorageConfig, setFileStorageConfig] = useState<FileStorageConfig>(DEFAULT_FILE_STORAGE_CONFIG);
  const [testingStorage, setTestingStorage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [resLate, resEarly, resBulk, resGrouping, resAutoOD, resLeaveRecon, resSkipRecon, resFileStorage] =
        await Promise.all([
        api.getSetting('late_in_grace_time'),
        api.getSetting('early_out_grace_time'),
        api.getSetting('allow_employee_bulk_process'),
        api.getSetting('custom_employee_grouping_enabled'),
        api.getSetting('auto_od_creation_enabled'),
        api.getSetting('leave_attendance_reconciliation_enabled'),
        api.getSetting('skip_leave_attendance_reconciliation'),
        api.getSetting('file_storage_config'),
      ]);

      if (resLate.success && resLate.data) setLateInGrace(Number(resLate.data.value));
      if (resEarly.success && resEarly.data) setEarlyOutGrace(Number(resEarly.data.value));
      if (resBulk.success && resBulk.data) setAllowEmployeeBulkProcess(!!resBulk.data.value);
      if (resGrouping.success && resGrouping.data) setCustomEmployeeGroupingEnabled(!!resGrouping.data.value);
      if (resAutoOD.success && resAutoOD.data) setAutoODCreationEnabled(!!resAutoOD.data.value);
      if (resLeaveRecon.success && resLeaveRecon.data) {
        setLeaveAttendanceReconciliationEnabled(resLeaveRecon.data.value !== false);
      }
      if (resSkipRecon.success && resSkipRecon.data) {
        setSkipLeaveAttendanceReconciliation(!!resSkipRecon.data.value);
      }
      if (resFileStorage.success && resFileStorage.data?.value) {
        const value = resFileStorage.data.value as FileStorageConfig;
        setFileStorageConfig({
          provider: value.provider === 's3' ? 's3' : 'local',
          s3: {
            accessKeyId: value.s3?.accessKeyId || '',
            secretAccessKey: value.s3?.secretAccessKey || '',
            hasSecretAccessKey: !!value.s3?.hasSecretAccessKey,
            bucketName: value.s3?.bucketName || '',
            region: value.s3?.region || 'us-east-1',
            endpoint: value.s3?.endpoint || '',
            forcePathStyle: !!value.s3?.forcePathStyle,
          },
          local: {
            basePath: value.local?.basePath || './uploads',
            publicBaseUrl: value.local?.publicBaseUrl || '/api/files',
            backendPublicUrl: value.local?.backendPublicUrl || '',
          },
        });
      }
    } catch (err) {
      console.error('Failed to load general settings', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleTestFileStorage = async () => {
    try {
      setTestingStorage(true);
      const res = await api.testFileStorage(fileStorageConfig);
      if (res.success) {
        toast.success(res.message || 'File storage connection successful');
      } else {
        toast.error(res.message || 'File storage connection test failed');
      }
    } catch {
      toast.error('File storage connection test failed');
    } finally {
      setTestingStorage(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const [resLate, resEarly, resBulk, resGrouping, resAutoOD, resLeaveRecon, resSkipRecon, resFileStorage] =
        await Promise.all([
        api.upsertSetting({
          key: 'late_in_grace_time',
          value: lateInGrace,
          category: 'general',
          description: 'Global Late In Grace Period (Minutes)'
        }),
        api.upsertSetting({
          key: 'early_out_grace_time',
          value: earlyOutGrace,
          category: 'general',
          description: 'Global Early Out Grace Period (Minutes)'
        }),
        api.upsertSetting({
          key: 'allow_employee_bulk_process',
          value: allowEmployeeBulkProcess,
          category: 'employee',
          description: 'Allow bulk upload / bulk process for employees'
        }),
        api.upsertSetting({
          key: 'custom_employee_grouping_enabled',
          value: customEmployeeGroupingEnabled,
          category: 'employee',
          description: 'Enable custom employee groups (CRUD, applications, bulk upload, filters)'
        }),
        api.upsertSetting({
          key: 'auto_od_creation_enabled',
          value: autoODCreationEnabled,
          category: 'general',
          description: 'Enable automatic OD creation for eligible holiday/week-off biometric punches'
        }),
        api.upsertSetting({
          key: 'leave_attendance_reconciliation_enabled',
          value: leaveAttendanceReconciliationEnabled,
          category: 'general',
          description:
            'When ON, approved leave/OD is auto-adjusted when punches show physical presence on the same day/half.',
        }),
        api.upsertSetting({
          key: 'skip_leave_attendance_reconciliation',
          value: skipLeaveAttendanceReconciliation,
          category: 'general',
          description:
            'When ON, pauses leave–attendance reconciliation on attendance updates (same as bulk script SKIP env).',
        }),
        api.upsertSetting({
          key: 'file_storage_config',
          value: fileStorageConfig,
          category: 'general',
          description: 'File upload storage provider (Amazon S3 or local server disk)',
        }),
      ]);

      if (
        resLate.success &&
        resEarly.success &&
        resBulk.success &&
        resGrouping.success &&
        resAutoOD.success &&
        resLeaveRecon.success &&
        resSkipRecon.success &&
        resFileStorage.success
      ) {
        if (resFileStorage.data?.value) {
          const value = resFileStorage.data.value as FileStorageConfig;
          setFileStorageConfig({
            provider: value.provider === 's3' ? 's3' : 'local',
            s3: {
              accessKeyId: value.s3?.accessKeyId || '',
              secretAccessKey: value.s3?.secretAccessKey || '',
              hasSecretAccessKey: !!value.s3?.hasSecretAccessKey,
              bucketName: value.s3?.bucketName || '',
              region: value.s3?.region || 'us-east-1',
              endpoint: value.s3?.endpoint || '',
              forcePathStyle: !!value.s3?.forcePathStyle,
            },
            local: {
              basePath: value.local?.basePath || './uploads',
              publicBaseUrl: value.local?.publicBaseUrl || '/api/files',
              backendPublicUrl: value.local?.backendPublicUrl || '',
            },
          });
        }
        toast.success('General settings saved successfully');
      } else {
        toast.error('Failed to save general settings');
      }
    } catch (err) {
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <SettingsSkeleton />;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        section="General"
        title="General Details"
        subtitle="Comprehensive Overview of Core Configuration and General Settings"
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="min-w-0 space-y-4 sm:space-y-5">
      <SettingsSectionCard title="Attendance Grace Periods">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField
            label="Late In Grace Period"
            htmlFor="lateInGrace"
            help="Minutes allowed after shift start time before marked late."
            required
          >
            <div className="relative">
              <input
                type="number"
                id="lateInGrace"
                value={lateInGrace}
                onChange={(e) => setLateInGrace(Number(e.target.value))}
                className={settingsInputClass()}
                style={settingsInputStyle()}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-stone-400">Mins</span>
            </div>
          </SettingsField>

          <SettingsField
            label="Early Out Grace Period"
            htmlFor="earlyOutGrace"
            help="Minutes allowed before shift end time before marked early exit."
            required
          >
            <div className="relative">
              <input
                type="number"
                id="earlyOutGrace"
                value={earlyOutGrace}
                onChange={(e) => setEarlyOutGrace(Number(e.target.value))}
                className={settingsInputClass()}
                style={settingsInputStyle()}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase text-stone-400">Mins</span>
            </div>
          </SettingsField>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Employee Bulk Process">
        <SettingsToggleRow
          id="allowEmployeeBulkProcess"
          label="Allow bulk process for employees"
          description="When ON, the Import (bulk upload) option is shown on the Employees page. When OFF, bulk upload is hidden."
          checked={allowEmployeeBulkProcess}
          onChange={setAllowEmployeeBulkProcess}
        />
      </SettingsSectionCard>

      <SettingsSectionCard title="Employee custom groups">
        <SettingsToggleRow
          id="customEmployeeGrouping"
          label="Enable custom employee grouping"
          description="When ON, you can maintain employee groups, assign them on applications and bulk upload, and filter employees by group."
          checked={customEmployeeGroupingEnabled}
          onChange={setCustomEmployeeGroupingEnabled}
        />
      </SettingsSectionCard>

      <SettingsSectionCard title="Automatic OD Creation">
        <SettingsToggleRow
          id="autoODCreationEnabled"
          label="Enable automatic OD creation"
          description="When ON, the system auto-creates or updates OD requests for eligible holiday/week-off biometric punches. When OFF, auto-OD workflow is disabled."
          checked={autoODCreationEnabled}
          onChange={setAutoODCreationEnabled}
        />
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Leave & attendance reconciliation"
        description="Control whether the system auto-rejects or narrows approved leave/OD when punches show the employee was physically present on the same day or half."
      >
        <div className="space-y-4">
          <SettingsToggleRow
            id="leaveAttendanceReconciliationEnabled"
            label="Enable auto leave–attendance reconciliation"
            description="When ON, reconciliation runs on punch sync, leave approval, and OD approval before monthly summary is recalculated. When OFF, approved leaves are never auto-adjusted by attendance."
            checked={leaveAttendanceReconciliationEnabled}
            onChange={setLeaveAttendanceReconciliationEnabled}
          />

          <div
            className={`flex items-center justify-between gap-4 border p-4 sm:p-5 ${!leaveAttendanceReconciliationEnabled ? 'opacity-40' : ''}`}
            style={settingsLedgerBorder}
          >
            <div>
              <label
                htmlFor="skipLeaveAttendanceReconciliation"
                className="block text-sm font-medium text-stone-900 dark:text-stone-100"
              >
                Pause reconciliation (testing / bulk-safe)
              </label>
              <p className="mt-1.5 text-[10px] leading-relaxed text-stone-500 dark:text-stone-400 sm:text-xs">
                When ON, reconciliation is skipped on all attendance recalculations (same effect as{' '}
                <code className="rounded bg-stone-100 px-1 text-[10px] dark:bg-stone-800">
                  SKIP_LEAVE_ATTENDANCE_RECONCILIATION=1
                </code>{' '}
                on backend scripts). Use temporarily while testing payroll; turn OFF for normal operation.
              </p>
            </div>
            <button
              id="skipLeaveAttendanceReconciliation"
              type="button"
              role="switch"
              aria-checked={skipLeaveAttendanceReconciliation}
              onClick={() => setSkipLeaveAttendanceReconciliation((v) => !v)}
              disabled={!leaveAttendanceReconciliationEnabled}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--ps-accent)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${skipLeaveAttendanceReconciliation ? 'bg-amber-500' : 'bg-stone-200 dark:bg-stone-700'}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${skipLeaveAttendanceReconciliation ? 'translate-x-5' : 'translate-x-1'}`}
              />
            </button>
          </div>
        </div>
      </SettingsSectionCard>

        </div>

        <div className="min-w-0 space-y-4 sm:space-y-5">
      <SettingsSectionCard
        title="File storage"
        description="Choose where uploaded files (certificates, profile photos, evidence, company logo) are stored."
      >
        <div className="space-y-6">
          <SettingsField
            label="Storage provider"
            help="Use Amazon S3 for cloud storage, or local server storage when files should stay on the application server."
          >
            <div className="flex flex-wrap gap-3">
              {(['s3', 'local'] as FileStorageProvider[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      provider: option,
                    }))
                  }
                  className={`border px-4 py-2 text-sm font-medium transition-colors ${
                    fileStorageConfig.provider === option
                      ? 'border-[color:var(--ps-accent)] bg-[color:var(--ps-accent-soft)] text-stone-900 dark:text-stone-100'
                      : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
                  }`}
                  style={fileStorageConfig.provider === option ? undefined : settingsLedgerBorder}
                >
                  {option === 's3' ? 'Amazon S3' : 'Local server'}
                </button>
              ))}
            </div>
          </SettingsField>

          {fileStorageConfig.provider === 's3' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SettingsField label="Access key ID" htmlFor="s3AccessKeyId" required>
                <input
                  id="s3AccessKeyId"
                  type="text"
                  value={fileStorageConfig.s3.accessKeyId}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, accessKeyId: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                />
              </SettingsField>

              <SettingsField
                label="Secret access key"
                htmlFor="s3SecretAccessKey"
                help={
                  fileStorageConfig.s3.hasSecretAccessKey
                    ? 'Leave as ******** to keep the existing secret.'
                    : undefined
                }
                required
              >
                <input
                  id="s3SecretAccessKey"
                  type="password"
                  value={fileStorageConfig.s3.secretAccessKey}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, secretAccessKey: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  placeholder={fileStorageConfig.s3.hasSecretAccessKey ? '********' : ''}
                />
              </SettingsField>

              <SettingsField label="Bucket name" htmlFor="s3BucketName" required>
                <input
                  id="s3BucketName"
                  type="text"
                  value={fileStorageConfig.s3.bucketName}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, bucketName: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                />
              </SettingsField>

              <SettingsField label="Region" htmlFor="s3Region" required>
                <input
                  id="s3Region"
                  type="text"
                  value={fileStorageConfig.s3.region}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, region: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                />
              </SettingsField>

              <SettingsField
                label="Custom endpoint (optional)"
                htmlFor="s3Endpoint"
                help="For MinIO, DigitalOcean Spaces, or other S3-compatible storage."
              >
                <input
                  id="s3Endpoint"
                  type="text"
                  value={fileStorageConfig.s3.endpoint}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, endpoint: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  placeholder="https://s3.example.com"
                />
              </SettingsField>

              <div className="flex items-end">
                <SettingsToggleRow
                  id="s3ForcePathStyle"
                  label="Force path-style URLs"
                  description="Enable for some S3-compatible providers (e.g. MinIO)."
                  checked={fileStorageConfig.s3.forcePathStyle}
                  onChange={(checked) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      s3: { ...prev.s3, forcePathStyle: checked },
                    }))
                  }
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <SettingsField
                label="Storage directory"
                htmlFor="localBasePath"
                help="Absolute or relative path on the server where uploaded files are saved."
                required
              >
                <input
                  id="localBasePath"
                  type="text"
                  value={fileStorageConfig.local.basePath}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      local: { ...prev.local, basePath: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  placeholder="./uploads"
                />
              </SettingsField>

              <SettingsField
                label="Backend public URL"
                htmlFor="localBackendPublicUrl"
                help="Host and port where the backend is reachable (e.g. http://192.168.0.36:5000). Used in uploaded file links. Leave empty to use the URL from each upload request."
                required
              >
                <input
                  id="localBackendPublicUrl"
                  type="text"
                  value={fileStorageConfig.local.backendPublicUrl}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      local: { ...prev.local, backendPublicUrl: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  placeholder="http://192.168.0.36:5000"
                />
              </SettingsField>

              <SettingsField
                label="Public URL base"
                htmlFor="localPublicBaseUrl"
                help="Path prefix after the backend URL. Keep /api/files unless you use a custom route."
              >
                <input
                  id="localPublicBaseUrl"
                  type="text"
                  value={fileStorageConfig.local.publicBaseUrl}
                  onChange={(e) =>
                    setFileStorageConfig((prev) => ({
                      ...prev,
                      local: { ...prev.local, publicBaseUrl: e.target.value },
                    }))
                  }
                  className={settingsInputClass()}
                  style={settingsInputStyle()}
                  placeholder="/api/files"
                />
              </SettingsField>
            </div>
          )}

          <div className="flex justify-end">
            <SettingsOutlineButton onClick={handleTestFileStorage} disabled={testingStorage}>
              {testingStorage ? 'Testing…' : 'Test connection'}
            </SettingsOutlineButton>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="System Localization" className="opacity-50">
        <div className="mb-4 flex items-center justify-end">
          <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-500">COMING SOON</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 grayscale">
          <SettingsField label="Language">
            <div className="h-11 border bg-stone-50" style={settingsLedgerBorder} />
          </SettingsField>
          <SettingsField label="Timezone">
            <div className="h-11 border bg-stone-50" style={settingsLedgerBorder} />
          </SettingsField>
        </div>
      </SettingsSectionCard>
        </div>
      </div>

      <SettingsSaveBar onSave={handleSave} saving={saving} />
    </SettingsPanel>
  );
};

export default GeneralSettings;
