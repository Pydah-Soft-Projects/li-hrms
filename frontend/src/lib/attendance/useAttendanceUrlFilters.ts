'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AttendanceUrlFilters,
  buildAttendanceSearchParams,
  parseAttendanceUrlFilters,
} from './urlFilters';

/** Read URL filters once on mount (before state init). */
export function useAttendanceUrlHydration(): AttendanceUrlFilters {
  const searchParams = useSearchParams();
  const initialRef = useRef<AttendanceUrlFilters | null>(null);
  if (initialRef.current === null) {
    initialRef.current = parseAttendanceUrlFilters(searchParams);
  }
  return initialRef.current;
}

/** Keep attendance filters in the URL so refresh / share restores the view. */
export function useSyncAttendanceUrlFilters(filters: AttendanceUrlFilters, enabled = true) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const next = buildAttendanceSearchParams(filters).toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, enabled, pathname, router, searchParams]);
}
