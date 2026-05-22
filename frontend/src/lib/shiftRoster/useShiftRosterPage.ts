'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { parseQuickAssignValue, quickAssignLabel } from '@/lib/shiftRoster/quickAssignUtils';
import { toast } from 'react-hot-toast';
import { api, Designation, Employee, Holiday, HolidayGroup, Shift } from '@/lib/api';
import { compareEmpNo } from '@/lib/employeeSort';
import {
  AssignmentSummaryItem,
  CycleDates,
  RosterCell,
  RosterListQuery,
  RosterState,
} from './types';
import {
  buildEmployeeListParams,
  buildRosterApiParams,
  checkGroupApplicability,
  formatMonthInput,
  formatSimpleDate,
  getDaysInRange,
  parseRosterEntries,
  shiftLabel,
} from './utils';
import {
  applyWeekdayPatternToDays,
  buildPreviousCycleWeekdayMap,
  buildWeekdayPatternFromRow,
  copyRowToTargets,
  DeptRosterTemplate,
  fillFromPreviousCycleForEmployees,
  getSameWeekDaysAfter,
  loadDeptTemplates,
  navigateMonthStr,
  saveDeptTemplates,
  cloneCell,
} from './rosterCopyUtils';

const ROSTER_LIMIT = 50;

export type UseShiftRosterPageOptions = {
  /** When true, holiday admin fetch failures are ignored (workspace permissions). */
  holidaysGraceful?: boolean;
};

export function useShiftRosterPage(options: UseShiftRosterPageOptions = {}) {
  const { holidaysGraceful = false } = options;
  const staticLoadedRef = useRef(false);

  const [month, setMonth] = useState(formatMonthInput(new Date()));
  const [strict] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [employeeGroups, setEmployeeGroups] = useState<any[]>([]);
  const [filterScopedGroups, setFilterScopedGroups] = useState<any[] | null>(null);
  const [selectedShiftForAssign, setSelectedShiftForAssign] = useState('');
  const [roster, setRoster] = useState<RosterState>(new Map());
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<number | null>(null);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'roster' | 'assigned'>('roster');
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayGroups, setHolidayGroups] = useState<HolidayGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(ROSTER_LIMIT);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [fillPreviousLoading, setFillPreviousLoading] = useState(false);
  const [templates, setTemplates] = useState<DeptRosterTemplate[]>([]);
  const [duplicateSourceEmp, setDuplicateSourceEmp] = useState<string | null>(null);
  const weekdays = useMemo(
    () => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    []
  );
  const [shiftAssignDays, setShiftAssignDays] = useState<Record<string, boolean>>(
    weekdays.reduce((acc, w) => ({ ...acc, [w]: false }), {})
  );
  const [selectedEmpNos, setSelectedEmpNos] = useState<Set<string>>(() => new Set());
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [cycleDates, setCycleDates] = useState<CycleDates | null>(null);
  const [alignedToCycle, setAlignedToCycle] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const listQuery: RosterListQuery = useMemo(
    () => ({
      page,
      limit,
      selectedDept,
      selectedDivision,
      selectedDesignation,
      selectedGroup,
      searchQuery,
      cycleDates,
    }),
    [page, limit, selectedDept, selectedDivision, selectedDesignation, selectedGroup, searchQuery, cycleDates]
  );

  useEffect(() => {
    api.getSetting('payroll_cycle_start_day')
      .then((res) => {
        if (res.success && res.data) setCycleStartDay(Number(res.data.value) || 1);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (alignedToCycle || !cycleStartDay) return;
    const today = new Date();
    let y = today.getFullYear();
    let m = today.getMonth() + 1;
    if (cycleStartDay > 1 && today.getDate() >= cycleStartDay) {
      if (m === 12) {
        m = 1;
        y += 1;
      } else {
        m += 1;
      }
    }
    setMonth(formatMonthInput(new Date(y, m - 1, 1)));
    setAlignedToCycle(true);
  }, [cycleStartDay, alignedToCycle]);

  useEffect(() => {
    if (!month) return;
    const [y, m] = month.split('-').map(Number);
    if (cycleStartDay === 1) {
      setCycleDates({
        startDate: formatSimpleDate(new Date(y, m - 1, 1)),
        endDate: formatSimpleDate(new Date(y, m, 0)),
        label: new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
      });
    } else {
      const start = new Date(y, m - 2, cycleStartDay);
      const end = new Date(y, m - 1, cycleStartDay - 1);
      setCycleDates({
        startDate: formatSimpleDate(start),
        endDate: formatSimpleDate(end),
        label: `${start.getDate()} ${start.toLocaleString('default', { month: 'short' })} - ${end.getDate()} ${end.toLocaleString('default', { month: 'short', year: 'numeric' })}`,
      });
    }
  }, [month, cycleStartDay]);

  const days = useMemo(() => {
    if (!cycleDates) return [];
    return getDaysInRange(new Date(cycleDates.startDate), new Date(cycleDates.endDate));
  }, [cycleDates]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadStaticData = useCallback(async () => {
    const [shiftRes, divRes, deptRes, desigRes, groupRes] = await Promise.all([
      api.getShifts(),
      api.getDivisions(),
      api.getDepartments(),
      api.getAllDesignations(true),
      api.getEmployeeGroups(true),
    ]);
    setShifts(shiftRes.data || []);
    setDivisions(divRes.data || []);
    setDepartments(deptRes.data || []);
    setDesignations(desigRes.data || []);
    setEmployeeGroups(groupRes.data || []);

    try {
      const holidayRes = await api.getAllHolidaysAdmin(parseInt(month.split('-')[0], 10));
      if (holidayRes?.data) {
        if (Array.isArray(holidayRes.data)) setHolidays(holidayRes.data);
        else {
          setHolidays(holidayRes.data.holidays || []);
          setHolidayGroups(holidayRes.data.groups || []);
        }
      }
    } catch (hErr) {
      if (!holidaysGraceful) throw hErr;
      console.warn('Holiday fetch failed, roster will load without holiday markers:', hErr);
    }
  }, [month, holidaysGraceful]);

  const loadRosterPage = useCallback(async () => {
    if (!cycleDates) return;
    setLoading(true);
    try {
      const empParams = buildEmployeeListParams(listQuery);
      const rosterParams = buildRosterApiParams(listQuery);

      const [empRes, rosterRes] = await Promise.all([
        api.getEmployees(empParams) as Promise<{
          data: Employee[];
          pagination?: { totalPages: number; total: number };
        }>,
        api.getRoster(month, rosterParams),
      ]);

      const empList = empRes.data || [];
      setEmployees(empList);
      setTotalPages(empRes.pagination?.totalPages || 1);
      setTotalEmployees(empRes.pagination?.total || empList.length);

      const rosterData = rosterRes.data as {
        entries: { employeeNumber: string; date: string; shiftId?: string; status?: string }[];
      } | null;
      setRoster(parseRosterEntries(rosterData?.entries || []));
      setDirtyKeys(new Set());
    } catch (err) {
      console.error('Error loading roster data:', err);
      toast.error('Failed to load roster');
    } finally {
      setLoading(false);
    }
  }, [cycleDates, listQuery, month]);

  useEffect(() => {
    if (!cycleDates) return;
    let cancelled = false;
    (async () => {
      try {
        if (!staticLoadedRef.current) {
          await loadStaticData();
          if (cancelled) return;
          staticLoadedRef.current = true;
        }
        await loadRosterPage();
      } catch {
        if (!cancelled) toast.error('Failed to load roster');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cycleDates, loadStaticData, loadRosterPage]);

  useEffect(() => {
    if (!staticLoadedRef.current) return;
    const year = parseInt(month.split('-')[0], 10);
    let cancelled = false;
    (async () => {
      try {
        const holidayRes = await api.getAllHolidaysAdmin(year);
        if (cancelled || !holidayRes?.data) return;
        if (Array.isArray(holidayRes.data)) setHolidays(holidayRes.data);
        else {
          setHolidays(holidayRes.data.holidays || []);
          setHolidayGroups(holidayRes.data.groups || []);
        }
      } catch (hErr) {
        if (!holidaysGraceful) console.warn('Holiday refresh failed:', hErr);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, holidaysGraceful]);

  useEffect(() => {
    if (!selectedDivision && !selectedDept && !selectedDesignation) {
      setFilterScopedGroups(null);
      return;
    }
    let cancelled = false;
    api
      .getEmployeeGroupsForRosterFilters({
        division_id: selectedDivision || undefined,
        department_id: selectedDept || undefined,
        designation_id: selectedDesignation || undefined,
        startDate: cycleDates?.startDate,
        endDate: cycleDates?.endDate,
      })
      .then((res) => {
        if (!cancelled) setFilterScopedGroups(res.data || []);
      })
      .catch(() => {
        if (!cancelled) setFilterScopedGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDivision, selectedDept, selectedDesignation, cycleDates?.startDate, cycleDates?.endDate]);

  const globalHolidayDates = useMemo(() => {
    const dates = new Set<string>();
    holidays.forEach((h) => {
      const start = h.date ? format(parseISO(h.date), 'yyyy-MM-dd') : '';
      const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;
      if (!start) return;
      days.forEach((d) => {
        if (d >= start && d <= end) dates.add(d);
      });
    });
    return dates;
  }, [holidays, days]);

  const holidayCache = useMemo(() => {
    const cache = new Map<string, Set<string>>();
    if (!employees.length || !holidays.length || !days.length) return cache;
    const monthStart = days[0];
    const monthEnd = days[days.length - 1];
    const monthHolidays = holidays.filter((h) => {
      const start = h.date ? format(parseISO(h.date), 'yyyy-MM-dd') : '';
      const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;
      return start && start <= monthEnd && end && end >= monthStart;
    });
    if (!monthHolidays.length) return cache;
    employees.forEach((emp) => {
      const empHolidays = new Set<string>();
      monthHolidays.forEach((h) => {
        const start = h.date ? format(parseISO(h.date), 'yyyy-MM-dd') : '';
        const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;
        let isApplicable = false;
        if (h.scope === 'GLOBAL') {
          if (h.applicableTo === 'ALL') {
            const override = monthHolidays.find(
              (o) =>
                o.overridesMasterId === h._id &&
                o.scope === 'GROUP' &&
                checkGroupApplicability(o, emp, holidayGroups)
            );
            isApplicable = !override;
          } else if (h.applicableTo === 'SPECIFIC_GROUPS') {
            isApplicable = checkGroupApplicability(h, emp, holidayGroups);
          } else isApplicable = true;
        } else if (h.scope === 'GROUP') {
          isApplicable = checkGroupApplicability(h, emp, holidayGroups);
        }
        if (isApplicable) {
          days.forEach((d) => {
            if (d >= start && d <= end) empHolidays.add(d);
          });
        }
      });
      cache.set(emp.emp_no, empHolidays);
    });
    return cache;
  }, [employees, holidays, holidayGroups, days]);

  const getDojStr = useCallback(
    (empNo: string) => {
      const emp = employees.find((e) => e.emp_no === empNo);
      return emp?.doj ? format(parseISO(emp.doj), 'yyyy-MM-dd') : null;
    },
    [employees]
  );

  const applyBulkUpdates = useCallback(
    (updates: { empNo: string; date: string; cell: RosterCell }[]) => {
      if (!updates.length) return;
      setRoster((prev) => {
        const next = new Map(prev);
        updates.forEach(({ empNo, date, cell }) => {
          const row = { ...(next.get(empNo) || {}) };
          row[date] = cell;
          next.set(empNo, row);
        });
        return next;
      });
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        updates.forEach(({ empNo, date }) => next.add(`${empNo}|${date}`));
        return next;
      });
    },
    []
  );

  const updateCell = useCallback(
    (empNo: string, date: string, value: RosterCell) => {
      const dojStr = getDojStr(empNo);
      if (dojStr && date < dojStr) {
        const emp = employees.find((e) => e.emp_no === empNo);
        toast.error(`Cannot assign shift before joining date (${dojStr}) for ${emp?.employee_name || empNo}`);
        return;
      }
      applyBulkUpdates([{ empNo, date, cell: value }]);
    },
    [employees, getDojStr, applyBulkUpdates]
  );

  const applyDayToRestOfWeek = useCallback(
    (empNo: string, sourceDate: string) => {
      const sourceCell = roster.get(empNo)?.[sourceDate];
      if (!sourceCell?.shiftId && !sourceCell?.status) {
        toast.error('Select a shift or off type first');
        return;
      }
      const dojStr = getDojStr(empNo);
      const targetDays = getSameWeekDaysAfter(sourceDate, days).filter((d) => d !== sourceDate);
      const updates = targetDays
        .filter((d) => !dojStr || d >= dojStr)
        .map((d) => ({ empNo, date: d, cell: cloneCell(sourceCell) }));
      applyBulkUpdates(updates);
      toast.success(`Applied to ${updates.length} day(s) this week`);
    },
    [roster, days, getDojStr, applyBulkUpdates]
  );

  const handleCopyFromEmployee = useCallback(
    (sourceEmpNo: string, targetEmpNos: string[]) => {
      const updates = copyRowToTargets(roster, sourceEmpNo, targetEmpNos, days, getDojStr);
      applyBulkUpdates(updates);
      toast.success(`Copied roster to ${targetEmpNos.length} employee(s) — ${updates.length} cells`);
    },
    [roster, days, getDojStr, applyBulkUpdates]
  );

  const handleFillFromPreviousCycle = useCallback(async () => {
    setFillPreviousLoading(true);
    try {
      const prevMonth = navigateMonthStr(month, 'prev');
      const res = await api.getRoster(prevMonth, buildRosterApiParams(listQuery, { paginate: false }));
      const entries =
        (res.data as { entries?: { employeeNumber: string; date: string; shiftId?: string | null; status?: string }[] })
          ?.entries || [];
      const prevMap = buildPreviousCycleWeekdayMap(entries);
      const updates = fillFromPreviousCycleForEmployees(
        employees,
        days,
        prevMap,
        (doj) => (doj ? format(parseISO(doj), 'yyyy-MM-dd') : null)
      );
      applyBulkUpdates(updates);
      toast.success(`Filled ${updates.length} cells from previous cycle (unsaved until Save)`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load previous cycle');
    } finally {
      setFillPreviousLoading(false);
    }
  }, [month, listQuery, employees, days, applyBulkUpdates]);

  const refreshTemplates = useCallback(() => {
    setTemplates(loadDeptTemplates());
  }, []);

  const handleSaveTemplate = useCallback(
    (name: string, departmentId?: string) => {
      const ref = employees[0];
      if (!ref) {
        toast.error('No employees on this page to build template from');
        return;
      }
      const row = roster.get(ref.emp_no) || {};
      const pattern = buildWeekdayPatternFromRow(row, days);
      if (Object.keys(pattern).length === 0) {
        toast.error('Reference row has no assignments to save');
        return;
      }
      const dept = departments.find((d: { _id: string }) => d._id === departmentId);
      const template: DeptRosterTemplate = {
        id: typeof crypto !== 'undefined' ? crypto.randomUUID() : String(Date.now()),
        name,
        departmentId,
        departmentName: dept?.name,
        pattern,
        createdAt: new Date().toISOString(),
      };
      const all = [...templates, template];
      setTemplates(all);
      saveDeptTemplates(all);
      toast.success(`Template "${name}" saved`);
    },
    [employees, roster, days, departments, templates]
  );

  const handleApplyTemplate = useCallback(
    (template: DeptRosterTemplate, targetEmpNos: string[]) => {
      const updates: { empNo: string; date: string; cell: RosterCell }[] = [];
      targetEmpNos.forEach((empNo) => {
        const dojStr = getDojStr(empNo);
        const rowUpdates = applyWeekdayPatternToDays(template.pattern, days, dojStr);
        Object.entries(rowUpdates).forEach(([date, cell]) => {
          updates.push({ empNo, date, cell });
        });
      });
      applyBulkUpdates(updates);
      toast.success(`Applied template to ${targetEmpNos.length} staff — ${updates.length} cells`);
    },
    [days, getDojStr, applyBulkUpdates]
  );

  const handleDeleteTemplate = useCallback(
    (id: string) => {
      const all = templates.filter((t) => t.id !== id);
      setTemplates(all);
      saveDeptTemplates(all);
      toast.success('Template deleted');
    },
    [templates]
  );

  const openDuplicateRow = useCallback((sourceEmpNo: string) => {
    setDuplicateSourceEmp(sourceEmpNo);
    setShowCopyModal(true);
  }, []);

  const applyEmployeeAllDays = useCallback(
    (empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => {
      const emp = employees.find((e) => e.emp_no === empNo);
      const dojStr = emp?.doj ? format(parseISO(emp.doj), 'yyyy-MM-dd') : null;
      setRoster((prev) => {
        const next = new Map(prev);
        const row = { ...(next.get(empNo) || {}) };
        days.forEach((d) => {
          if (dojStr && d < dojStr) return;
          if (shiftId && (row[d]?.status === 'WO' || row[d]?.status === 'HOL')) return;
          row[d] = { shiftId, status };
        });
        next.set(empNo, row);
        return next;
      });
      setDirtyKeys((prev) => {
        const next = new Set(prev);
        days.forEach((d) => {
          if (dojStr && d < dojStr) return;
          next.add(`${empNo}|${d}`);
        });
        return next;
      });
    },
    [days, employees]
  );

  const applyWeekdayAssign = useCallback(
    (
      shiftId: string | null,
      weekdayFlags: Record<string, boolean>,
      targetEmpNos: string[],
      status?: 'WO' | 'HOL'
    ) => {
      const activeWeekdays = Object.keys(weekdayFlags).filter((w) => weekdayFlags[w]);
      if (!activeWeekdays.length) {
        toast.error('Select at least one weekday (S–S)');
        return 0;
      }
      const targets = targetEmpNos.length
        ? employees.filter((e) => targetEmpNos.includes(e.emp_no))
        : employees;
      if (!targets.length) {
        toast.error('No employees to update');
        return 0;
      }
      const updates: { empNo: string; date: string; cell: RosterCell }[] = [];
      targets.forEach((emp) => {
        const dojStr = getDojStr(emp.emp_no);
        const row = roster.get(emp.emp_no) || {};
        days.forEach((d) => {
          if (dojStr && d < dojStr) return;
          if (!activeWeekdays.includes(weekdays[new Date(d).getDay()])) return;
          if (shiftId && !status && (row[d]?.status === 'WO' || row[d]?.status === 'HOL')) return;
          updates.push({ empNo: emp.emp_no, date: d, cell: { shiftId, status } });
        });
      });
      if (!updates.length) {
        toast.error('No cells updated (check weekdays / week off / holiday)');
        return 0;
      }
      applyBulkUpdates(updates);
      return updates.length;
    },
    [days, weekdays, employees, roster, getDojStr, applyBulkUpdates]
  );

  const handleAssignAll = useCallback(() => {
    if (!selectedShiftForAssign) return;
    const { shiftId, status } = parseQuickAssignValue(selectedShiftForAssign);
    const count = applyWeekdayAssign(
      shiftId ?? null,
      shiftAssignDays,
      employees.map((e) => e.emp_no),
      status
    );
    if (count) {
      toast.success(
        `Applied ${quickAssignLabel(selectedShiftForAssign, (id) => shiftLabel(shifts.find((s) => s._id === id) || null))} to ${count} cells (all staff)`
      );
    }
  }, [selectedShiftForAssign, shiftAssignDays, employees, applyWeekdayAssign, shifts, shiftLabel]);

  const handleAssignSelected = useCallback(() => {
    if (!selectedShiftForAssign) return;
    if (!selectedEmpNos.size) {
      toast.error('Select one or more employees in the grid');
      return;
    }
    const { shiftId, status } = parseQuickAssignValue(selectedShiftForAssign);
    const count = applyWeekdayAssign(shiftId ?? null, shiftAssignDays, Array.from(selectedEmpNos), status);
    if (count) {
      toast.success(
        `Applied ${quickAssignLabel(selectedShiftForAssign, (id) => shiftLabel(shifts.find((s) => s._id === id) || null))} to ${count} cells (${selectedEmpNos.size} selected)`
      );
    }
  }, [selectedShiftForAssign, shiftAssignDays, selectedEmpNos, applyWeekdayAssign, shifts, shiftLabel]);

  const applyEmployeeWeekdays = useCallback(
    (empNo: string, assignmentValue: string, weekdayFlags: Record<string, boolean>) => {
      const { shiftId, status } = parseQuickAssignValue(assignmentValue);
      const count = applyWeekdayAssign(shiftId ?? null, weekdayFlags, [empNo], status);
      if (count) {
        toast.success(
          `Applied ${quickAssignLabel(assignmentValue, (id) => shiftLabel(shifts.find((s) => s._id === id) || null))} to ${count} day(s)`
        );
      }
    },
    [applyWeekdayAssign, shifts, shiftLabel]
  );

  const toggleSelectEmployee = useCallback((empNo: string) => {
    setSelectedEmpNos((prev) => {
      const next = new Set(prev);
      if (next.has(empNo)) next.delete(empNo);
      else next.add(empNo);
      return next;
    });
  }, []);

  const toggleSelectAllOnPage = useCallback(() => {
    setSelectedEmpNos((prev) => {
      const onPage = employees.map((e) => e.emp_no);
      const allSelected = onPage.length > 0 && onPage.every((n) => prev.has(n));
      if (allSelected) {
        const next = new Set(prev);
        onPage.forEach((n) => next.delete(n));
        return next;
      }
      return new Set([...prev, ...onPage]);
    });
  }, [employees]);

  useEffect(() => {
    setSelectedEmpNos(new Set());
  }, [page, selectedDept, selectedDivision, selectedDesignation, selectedGroup, searchQuery, month]);

  const saveRoster = async () => {
    setSaving(true);
    setSavingProgress(0);
    try {
      const entries: { employeeNumber: string; date: string; shiftId: string | null; status: string }[] = [];
      dirtyKeys.forEach((key) => {
        const [empNo, date] = key.split('|');
        const row = roster.get(empNo);
        if (!row) return;
        const cell = row[date];
        if (cell?.shiftId || cell?.status) {
          entries.push({
            employeeNumber: empNo,
            date,
            shiftId: cell.shiftId || null,
            status: cell.status || 'SHIFT',
          });
        }
      });
      if (!entries.length) {
        toast.success(dirtyKeys.size === 0 ? 'No changes to save' : 'No valid entries to save');
        return;
      }
      const batchSize = 100;
      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);
        await api.saveRoster({
          month,
          entries: batch,
          strict,
          startDate: cycleDates?.startDate,
          endDate: cycleDates?.endDate,
        });
        setSavingProgress(Math.min(100, Math.round(((i + batchSize) / entries.length) * 100)));
      }
      setDirtyKeys(new Set());
      toast.success(`Roster saved: ${entries.length} entries updated`);
    } catch (err) {
      console.error('Error saving roster:', err);
      toast.error('Failed to save roster');
    } finally {
      setSaving(false);
      setSavingProgress(null);
    }
  };

  const assignedShiftsSummary = useMemo(() => {
    if (activeTab !== 'assigned') return [];
    const summary: AssignmentSummaryItem[] = [];
    employees.forEach((emp) => {
      const row = roster.get(emp.emp_no) || {};
      const shiftMap = new Map<string | null, { label: string; dates: string[] }>();
      Object.entries(row).forEach(([date, cell]) => {
        const isWO = cell?.status === 'WO';
        const isHOL = cell?.status === 'HOL';
        const shiftId = isWO ? 'WO' : isHOL ? 'HOL' : cell?.shiftId || null;
        const label = isWO
          ? 'Week Off'
          : isHOL
            ? 'Holiday'
            : shiftId
              ? shiftLabel(shifts.find((s) => s._id === shiftId))
              : 'Unassigned';
        const key = isWO ? 'WO' : isHOL ? 'HOL' : shiftId;
        if (!shiftMap.has(key)) shiftMap.set(key, { label, dates: [] });
        shiftMap.get(key)!.dates.push(date);
      });
      if (shiftMap.size > 0) {
        const shiftsList = Array.from(shiftMap.entries())
          .map(([sid, data]) => ({
            shiftId: sid,
            shiftLabel: data.label,
            days: data.dates.length,
            dates: data.dates.sort(),
          }))
          .sort((a, b) =>
            a.shiftId === 'WO' ? -1 : b.shiftId === 'WO' ? 1 : a.shiftId === 'HOL' ? -1 : b.shiftId === 'HOL' ? 1 : 0
          );
        summary.push({
          employee: emp,
          shifts: shiftsList,
          totalDays: shiftsList.reduce((s, x) => s + x.days, 0),
          weekOffs: shiftsList.find((s) => s.shiftId === 'WO')?.days || 0,
          holidays: shiftsList.find((s) => s.shiftId === 'HOL')?.days || 0,
        });
      }
    });
    return summary.sort((a, b) => compareEmpNo(a.employee.emp_no, b.employee.emp_no));
  }, [employees, roster, shifts, activeTab]);

  const filteredAssignedSummary = useMemo(() => {
    if (activeTab !== 'assigned' || !assignedShiftsSummary.length) return [];
    if (!debouncedSearch) return assignedShiftsSummary;
    const term = debouncedSearch.toLowerCase();
    return assignedShiftsSummary.filter(
      (it) =>
        (it.employee.employee_name || '').toLowerCase().includes(term) ||
        (it.employee.emp_no || '').toLowerCase().includes(term)
    );
  }, [assignedShiftsSummary, debouncedSearch, activeTab]);

  const handleExportExcel = async () => {
    const exportToast = toast.loading('Preparing export...');
    try {
      const divisionName = selectedDivision
        ? divisions.find((d) => d._id === selectedDivision)?.name || 'Division'
        : 'All';
      const deptName = selectedDept ? departments.find((d) => d._id === selectedDept)?.name || 'Dept' : 'All';
      const exportQuery: RosterListQuery = { ...listQuery, page: 1, limit: 10000 };
      const [allEmpsRes, allRosterRes, xlsxMod] = await Promise.all([
        api.getEmployees(buildEmployeeListParams(exportQuery)),
        api.getRoster(month, buildRosterApiParams(exportQuery, { paginate: false })),
        import('xlsx'),
      ]);
      const XLSX: typeof import('xlsx') = (xlsxMod as { default?: typeof import('xlsx') }).default ?? xlsxMod;
      const allEmps = (allEmpsRes.data || []) as {
        emp_no: string;
        employee_name?: string;
        division?: { name: string };
        department?: { name: string };
      }[];
      const allRosterData = allRosterRes.data as {
        entries: { employeeNumber: string; date: string; shiftId?: string; status?: string }[];
      } | null;
      const fullMap = parseRosterEntries(allRosterData?.entries || []);
      const data: unknown[][] = [
        [`Shift Roster - ${divisionName} / ${deptName} - ${month}`],
        [],
        ['Emp No', 'Name', 'Division', 'Dept', ...days.map((d) => format(parseISO(d), 'dd-MMM'))],
      ];
      allEmps.forEach((emp) => {
        const row: unknown[] = [
          emp.emp_no,
          emp.employee_name || '-',
          emp.division?.name || '-',
          emp.department?.name || '-',
        ];
        days.forEach((d) => {
          const cell = (fullMap.get(emp.emp_no) || {})[d];
          if (cell?.status === 'WO') row.push('WO');
          else if (cell?.status === 'HOL') row.push('HOL');
          else if (cell?.shiftId) row.push(shiftLabel(shifts.find((s) => s._id === cell.shiftId)));
          else row.push('-');
        });
        data.push(row);
      });
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Roster');
      XLSX.writeFile(wb, `Shift_Roster_${month}.xlsx`);
      toast.success('Roster exported');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Export failed');
    } finally {
      toast.dismiss(exportToast);
    }
  };

  const filteredEmployees = useMemo(() => {
    if (!debouncedSearch) return employees;
    const term = debouncedSearch.toLowerCase();
    return employees.filter(
      (emp) =>
        (emp.employee_name || '').toLowerCase().includes(term) ||
        (emp.emp_no || '').toLowerCase().includes(term)
    );
  }, [employees, debouncedSearch]);

  const pageEmpNos = useMemo(() => employees.map((e) => e.emp_no), [employees]);
  const allOnPageSelected =
    pageEmpNos.length > 0 && pageEmpNos.every((empNo) => selectedEmpNos.has(empNo));
  const someOnPageSelected = pageEmpNos.some((empNo) => selectedEmpNos.has(empNo));

  const applyColumnDay = useCallback(
    (date: string, value: RosterCell) => {
      const updates: { empNo: string; date: string; cell: RosterCell }[] = [];
      filteredEmployees.forEach((emp) => {
        const dojStr = getDojStr(emp.emp_no);
        if (dojStr && date < dojStr) return;
        const row = roster.get(emp.emp_no) || {};
        if (value.shiftId && !value.status && (row[date]?.status === 'WO' || row[date]?.status === 'HOL')) {
          return;
        }
        updates.push({ empNo: emp.emp_no, date, cell: value });
      });
      if (!updates.length) {
        toast.error('No employees updated for this day');
        return;
      }
      applyBulkUpdates(updates);
      toast.success(`Assigned ${updates.length} staff for ${format(parseISO(date), 'dd MMM yyyy')}`);
    },
    [filteredEmployees, roster, getDojStr, applyBulkUpdates]
  );

  const filteredDepartments = useMemo(() => {
    if (!selectedDivision) return departments;
    const selectedDivisionData = divisions.find((div: { _id: string }) => div?._id === selectedDivision);
    const linkedDepartmentIds = new Set(
      (selectedDivisionData?.departments || [])
        .map((dept: { _id?: string } | string) => (typeof dept === 'string' ? dept : dept?._id))
        .filter(Boolean)
    );
    return departments.filter((dept: { _id: string; divisions?: unknown[] }) => {
      const deptDivisionIds = Array.isArray(dept?.divisions)
        ? dept.divisions
            .map((div) => {
              const d = div as { _id?: string } | string;
              return typeof d === 'string' ? d : d?._id;
            })
            .filter(Boolean)
        : [];
      return deptDivisionIds.includes(selectedDivision) || linkedDepartmentIds.has(dept?._id);
    });
  }, [departments, divisions, selectedDivision]);

  useEffect(() => {
    if (!selectedDept) return;
    if (!filteredDepartments.some((dept: { _id: string }) => dept._id === selectedDept)) setSelectedDept('');
  }, [filteredDepartments, selectedDept]);

  const filteredDesignations = useMemo(() => {
    const selectedDeptIds = selectedDept
      ? new Set([String(selectedDept)])
      : new Set(filteredDepartments.map((dept: { _id: string }) => String(dept._id)));
    const linkedDesignationIds = new Set<string>();
    filteredDepartments.forEach((dept: { _id: string; designations?: unknown[] }) => {
      if (!selectedDeptIds.has(String(dept?._id))) return;
      (Array.isArray(dept?.designations) ? dept.designations : []).forEach((designationRef) => {
        const id =
          typeof designationRef === 'string'
            ? designationRef
            : (designationRef as { _id?: string })?._id;
        if (id) linkedDesignationIds.add(String(id));
      });
    });
    return designations.filter((designation) => {
      if (linkedDesignationIds.has(String(designation._id))) return true;
      const departmentValue = (designation as { department?: string | { _id?: string } }).department;
      const designationDepartmentId =
        typeof departmentValue === 'string' ? departmentValue : departmentValue?._id;
      if (!designationDepartmentId) return false;
      return selectedDeptIds.has(String(designationDepartmentId));
    });
  }, [designations, filteredDepartments, selectedDept]);

  useEffect(() => {
    if (!selectedDesignation) return;
    if (!filteredDesignations.some((d) => d._id === selectedDesignation)) setSelectedDesignation('');
  }, [filteredDesignations, selectedDesignation]);

  const groupsForDropdown = useMemo(() => {
    if (!filterScopedGroups) return employeeGroups;
    const allowed = new Set(filterScopedGroups.map((g: { _id: string }) => String(g._id)));
    return employeeGroups.filter(
      (g: { _id: string }) => allowed.has(String(g._id)) || (selectedGroup && String(g._id) === selectedGroup)
    );
  }, [employeeGroups, filterScopedGroups, selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    if (!groupsForDropdown.some((g: { _id: string }) => g._id === selectedGroup)) setSelectedGroup('');
  }, [groupsForDropdown, selectedGroup]);

  const handleSearchSubmit = useCallback(() => {
    setSearchQuery(searchTerm.trim());
    setPage(1);
  }, [searchTerm]);

  const handleAutoFillNextCycle = useCallback(async () => {
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const nextLabel = new Date(`${nextMonth}-01`).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
    if (
      !confirm(
        `This will fill the next pay cycle (${nextLabel}) from the previous cycle by weekday. Holidays in the target period will be set to HOL. Continue?`
      )
    )
      return;
    setAutoFillLoading(true);
    try {
      const res = await api.autoFillNextCycleRoster({
        targetMonth: nextMonth,
        departmentId: selectedDept || undefined,
        divisionId: selectedDivision || undefined,
      });
      const data = res?.data;
      if (res?.success && data) {
        toast.success(`${data.filled} entries filled; ${data.holidaysRespected} days as holiday.`);
        setMonth(nextMonth);
        setPage(1);
        staticLoadedRef.current = false;
      } else {
        toast.error((res as { message?: string })?.message || 'Auto-fill failed');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Auto-fill failed');
    } finally {
      setAutoFillLoading(false);
    }
  }, [month, selectedDept, selectedDivision]);

  return {
    month,
    setMonth,
    shifts,
    divisions,
    departments,
    designations,
    selectedDivision,
    setSelectedDivision,
    selectedDept,
    setSelectedDept,
    selectedDesignation,
    setSelectedDesignation,
    selectedGroup,
    setSelectedGroup,
    groupsForDropdown,
    selectedShiftForAssign,
    setSelectedShiftForAssign,
    roster,
    loading,
    saving,
    savingProgress,
    autoFillLoading,
    activeTab,
    setActiveTab,
    searchTerm,
    setSearchTerm,
    page,
    setPage,
    limit,
    setLimit,
    totalPages,
    totalEmployees,
    weekdays,
    shiftAssignDays,
    setShiftAssignDays,
    cycleDates,
    days,
    globalHolidayDates,
    holidayCache,
    updateCell,
    applyEmployeeAllDays,
    applyEmployeeWeekdays,
    handleAssignAll,
    handleAssignSelected,
    selectedEmpNos,
    selectedCount: selectedEmpNos.size,
    toggleSelectEmployee,
    toggleSelectAllOnPage,
    allOnPageSelected,
    someOnPageSelected,
    saveRoster,
    handleExportExcel,
    filteredEmployees,
    filteredDepartments,
    filteredDesignations,
    filteredAssignedSummary,
    handleSearchSubmit,
    handleAutoFillNextCycle,
    shiftLabel,
    dirtyKeys,
    dirtyCount: dirtyKeys.size,
    showCopyModal,
    setShowCopyModal,
    duplicateSourceEmp,
    setDuplicateSourceEmp,
    fillPreviousLoading,
    templates,
    refreshTemplates,
    handleCopyFromEmployee,
    handleFillFromPreviousCycle,
    applyDayToRestOfWeek,
    applyColumnDay,
    handleSaveTemplate,
    handleApplyTemplate,
    handleDeleteTemplate,
    openDuplicateRow,
    employees,
  };
}
