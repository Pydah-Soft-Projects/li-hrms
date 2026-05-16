'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  type CompanyProfile,
  DEFAULT_COMPANY_PROFILE,
  fetchCompanyProfile,
  invalidateCompanyProfileCache,
} from '@/lib/companyProfile';

export function useCompanyProfile() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    invalidateCompanyProfileCache();
    setLoading(true);
    try {
      const data = await fetchCompanyProfile();
      setProfile(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchCompanyProfile();
        if (!cancelled) setProfile(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { profile, loading, refresh };
}
