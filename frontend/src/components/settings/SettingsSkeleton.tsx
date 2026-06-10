import { settingsCardClass, settingsLedgerBorder } from '@/lib/settingsUi';

export const SettingsSkeleton = () => {
  return (
    <div className="settings-ledger-scope animate-pulse space-y-6 sm:space-y-8">
      <div className="border-b pb-4 sm:pb-5" style={settingsLedgerBorder}>
        <div className="mb-3 h-3 w-32 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="mb-2 h-6 w-48 rounded bg-stone-300 dark:bg-stone-700 sm:h-7" />
        <div className="h-4 w-full max-w-md rounded bg-stone-200 dark:bg-stone-800" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="space-y-6">
          <div className={`${settingsCardClass} p-6 sm:p-8`} style={settingsLedgerBorder}>
            <div className="mb-6 h-5 w-40 rounded bg-stone-300 dark:bg-stone-700" />
            <div className="space-y-4">
              <div className="h-14 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="h-14 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="h-14 rounded bg-stone-100 dark:bg-stone-900" />
            </div>
          </div>
          <div className={`${settingsCardClass} p-6 sm:p-8`} style={settingsLedgerBorder}>
            <div className="mb-6 h-5 w-32 rounded bg-stone-300 dark:bg-stone-700" />
            <div className="space-y-4">
              <div className="h-20 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="h-20 rounded bg-stone-100 dark:bg-stone-900" />
            </div>
          </div>
        </div>
        <div>
          <div className={`${settingsCardClass} p-6 sm:p-8`} style={settingsLedgerBorder}>
            <div className="mb-6 h-5 w-36 rounded bg-stone-300 dark:bg-stone-700" />
            <div className="space-y-4">
              <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
              <div className="mt-6 h-11 rounded bg-stone-200 dark:bg-stone-700" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsCardSkeleton = () => {
  return (
    <div
      className={`${settingsCardClass} animate-pulse p-6 sm:p-8`}
      style={settingsLedgerBorder}
    >
      <div className="space-y-6">
        <div className="h-5 w-40 rounded bg-stone-300 dark:bg-stone-700" />
        <div className="space-y-4">
          <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
          <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
          <div className="h-16 rounded bg-stone-100 dark:bg-stone-900" />
        </div>
      </div>
    </div>
  );
};

export const SettingsFormSkeleton = () => {
  return (
    <div className="settings-ledger-scope animate-pulse space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-11 rounded bg-stone-100 dark:bg-stone-900" />
        </div>
      ))}
      <div
        className="flex items-center justify-between border p-4"
        style={settingsLedgerBorder}
      >
        <div className="h-4 w-40 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-6 w-12 rounded-full bg-stone-300 dark:bg-stone-700" />
      </div>
      <div className="mt-6 h-11 rounded bg-stone-200 dark:bg-stone-700" />
    </div>
  );
};
