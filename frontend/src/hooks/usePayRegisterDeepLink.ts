"use client";

import { useEffect, useRef } from "react";

type Options = {
  setCurrentDate: (date: Date) => void;
  setFilterDepartments: (ids: string[]) => void;
  setFilterDivisions: (ids: string[]) => void;
};

/** Apply ?month=YYYY-MM&departmentId=&divisionId= from payments approval warning links. */
export function usePayRegisterDeepLink({
  setCurrentDate,
  setFilterDepartments,
  setFilterDivisions,
}: Options) {
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get("month");
    const dept = params.get("departmentId");
    const div = params.get("divisionId");
    if (!monthParam && !dept && !div) return;

    applied.current = true;

    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split("-").map(Number);
      if (y && m >= 1 && m <= 12) {
        setCurrentDate(new Date(y, m - 1, 1));
      }
    }
    if (dept) setFilterDepartments([dept]);
    if (div) setFilterDivisions([div]);
  }, [setCurrentDate, setFilterDepartments, setFilterDivisions]);
}
