'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  LeavesUrlFilters,
  buildLeavesSearchParams,
  parseLeavesUrlFilters,
} from './urlFilters';

export function useLeavesUrlHydration(): LeavesUrlFilters {
  const searchParams = useSearchParams();
  const initialRef = useRef<LeavesUrlFilters | null>(null);
  if (initialRef.current === null) {
    initialRef.current = parseLeavesUrlFilters(searchParams);
  }
  return initialRef.current;
}

export function useSyncLeavesUrlFilters(filters: LeavesUrlFilters, enabled = true) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const next = buildLeavesSearchParams(filters).toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [filters, enabled, pathname, router, searchParams]);
}

export function useLeavesUrlDateRestoreFlag(initialUrl: LeavesUrlFilters): boolean {
  const ref = useRef(Boolean(initialUrl.from && initialUrl.to));
  return ref.current;
}
