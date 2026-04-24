'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

/**
 * Reflects Settings key `enable_second_salary` (Payroll). Defaults to true when missing (same as backend).
 */
export function useSecondSalaryFeatureEnabled() {
  const [secondSalaryEnabled, setSecondSalaryEnabled] = useState(true);
  const [secondSalarySettingReady, setSecondSalarySettingReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.getSetting('enable_second_salary');
        if (cancelled) return;
        if (res?.success && res?.data && typeof res.data.value === 'boolean') {
          setSecondSalaryEnabled(!!res.data.value);
        } else {
          setSecondSalaryEnabled(true);
        }
      } catch {
        if (!cancelled) setSecondSalaryEnabled(true);
      } finally {
        if (!cancelled) setSecondSalarySettingReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { secondSalaryEnabled, secondSalarySettingReady };
}
