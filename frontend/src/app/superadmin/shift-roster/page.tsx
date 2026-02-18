'use client';

import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';

import { format, parseISO } from 'date-fns';
import { Holiday, HolidayGroup } from '@/lib/api';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Building2,
  Filter,
  Plus,
  Save,
  Users,
  CheckCircle2,
  LayoutGrid,
  Search,
  Settings2,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Helper to check if an employee belongs to a holiday group
function checkGroupApplicability(holiday: Holiday, emp: Employee, groups: HolidayGroup[]) {
  // 1. Identify Target Groups
  const targetGroups: HolidayGroup[] = [];

  if (holiday.scope === 'GROUP') {
    const gId = typeof holiday.groupId === 'object' ? (holiday.groupId as { _id: string })._id : holiday.groupId;
    const g = groups.find(grp => grp._id === gId);
    if (g) targetGroups.push(g);
  } else if (holiday.targetGroupIds && holiday.targetGroupIds.length > 0) {
    holiday.targetGroupIds.forEach(tg => {
      const gId = typeof tg === 'object' ? (tg as { _id: string })._id : tg;
      const g = groups.find(grp => grp._id === gId);
      if (g) targetGroups.push(g);
    });
  }

  // 2. Check if employee matches ANY of the target groups
  return targetGroups.some(g => {
    return g.divisionMapping.some(m => {
      const divId = typeof m.division === 'object' ? (m.division as { _id: string })._id : m.division;
      const empDivId = typeof emp.division === 'object' ? emp.division._id : emp.division;

      // Match Division
      if (divId === empDivId) {
        // Determine Department Match
        if (!m.departments || m.departments.length === 0) {
          return true; // All Departments
        }
        const empDeptId = typeof emp.department === 'object' ? emp.department._id : emp.department;
        // Check if employee dept is in mapping
        return m.departments.some(d => {
          const dId = typeof d === 'object' ? (d as { _id: string })._id : d;
          return dId === empDeptId;
        });
      }
      return false;
    });
  });
}

type Shift = { _id: string; name: string; code?: string; color?: string };
type Employee = {
  _id: string;
  employee_name?: string;
  emp_no: string;
  department?: { name: string; _id: string };
  division?: { name: string; _id: string };
};
type RosterCell = { shiftId?: string | null; status?: 'WO' | 'HOL'; notes?: string };
type RosterState = Map<string, Record<string, RosterCell>>;

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type DepartmentOption = { _id: string; name: string };

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDays(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const days: string[] = [];
  const end = new Date(y, m, 0).getDate();
  for (let d = 1; d <= end; d++) {
    days.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return days;
}

function shiftLabel(shift?: Shift | null) {
  if (!shift) return '';
  if (shift.code) return shift.code;
  return shift.name || '';
}
type RosterEntry = { employeeNumber?: string; date: string; status?: string; shiftId?: string };

function RosterPage() {
  const [month, setMonth] = useState(formatMonthInput(new Date()));
  const [strict, setStrict] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [divisions, setDivisions] = useState<DepartmentOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selectedDivision, setSelectedDivision] = useState<string>('');
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedShiftForAssign, setSelectedShiftForAssign] = useState<string>('');
  const [roster, setRoster] = useState<RosterState>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'assigned'>('roster');
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayGroups, setHolidayGroups] = useState<HolidayGroup[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Debounced search to prevent UI lag
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Pagination State
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const limit = 50;

  const [showWeekOff, setShowWeekOff] = useState(false);
  const [weekOffDays, setWeekOffDays] = useState<Record<string, boolean>>(
    weekdays.reduce((acc, w) => ({ ...acc, [w]: false }), {})
  );
  const [shiftAssignDays, setShiftAssignDays] = useState<Record<string, boolean>>(
    weekdays.reduce((acc, w) => ({ ...acc, [w]: false }), {})
  );

  const days = useMemo(() => getMonthDays(month), [month]);

  // Pre-calculate Holiday Map for performance
  const holidayCache = useMemo(() => {
    const cache = new Map<string, Set<string>>(); // empNo -> Set of holiday dates
    if (!employees || !holidays) return cache;

    employees.forEach(emp => {
      const empHolidays = new Set<string>();
      holidays.forEach(h => {
        const start = format(parseISO(h.date), 'yyyy-MM-dd');
        const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;

        // Simplified check (already handles scope and overrides in the main logic usually, 
        // but we need to move it into this map for performance)
        let isApplicable = false;
        if (h.scope === 'GLOBAL') {
          if (h.applicableTo === 'ALL') {
            const override = holidays.find(o =>
              o.overridesMasterId === h._id &&
              o.scope === 'GROUP' &&
              checkGroupApplicability(o, emp, holidayGroups)
            );
            isApplicable = !override;
          } else if (h.applicableTo === 'SPECIFIC_GROUPS') {
            isApplicable = checkGroupApplicability(h, emp, holidayGroups);
          } else {
            isApplicable = true;
          }
        } else if (h.scope === 'GROUP') {
          isApplicable = checkGroupApplicability(h, emp, holidayGroups);
        }

        if (isApplicable) {
          // Add all dates in range to set
          days.forEach(d => {
            if (d >= start && d <= end) empHolidays.add(d);
          });
        }
      });
      cache.set(emp.emp_no, empHolidays);
    });
    return cache;
  }, [employees, holidays, holidayGroups, days]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const filters: Record<string, string | number> = { page, limit };
      if (selectedDept) filters.department_id = selectedDept;
      if (selectedDivision) filters.division_id = selectedDivision;

      const [shiftRes, empRes, rosterRes, divRes, deptRes, holidayRes] = await Promise.all([
        api.getShifts() as Promise<{ data: Shift[] }>,
        api.getEmployees(filters) as Promise<{ data: Employee[]; pagination?: { totalPages: number; total: number } }>,
        api.getRoster(month, { departmentId: selectedDept || undefined, divisionId: selectedDivision || undefined }) as Promise<{ data: { entries: RosterEntry[]; strict: boolean } }>,
        api.getDivisions() as Promise<{ data: Array<{ _id: string; name: string }> }>,
        api.getDepartments() as Promise<{ data: Array<{ _id: string; name: string; divisions?: Array<string | { _id: string }> }> }>,
        api.getAllHolidaysAdmin(Number(month.split('-')[0])) as Promise<{ data: { holidays: Holiday[]; groups: HolidayGroup[] } | Holiday[] }>
      ]);

      if (holidayRes && holidayRes.data) {
        if (Array.isArray(holidayRes.data)) {
          // Fallback if data structure is array
          setHolidays(holidayRes.data);
          setHolidayGroups([]);
        } else {
          // Correct structure: { holidays: [], groups: [] }
          setHolidays(holidayRes.data.holidays || []);
          setHolidayGroups(holidayRes.data.groups || []);
        }
      } else {
        setHolidays([]);
        setHolidayGroups([]);
      }

      // Ensure arrays
      const shiftList = Array.isArray(shiftRes?.data) ? shiftRes.data : (Array.isArray(shiftRes) ? shiftRes : []);
      setShifts(shiftList);

      const empList = (empRes as { data: Employee[] }).data || [];
      setEmployees(empList);

      const pagination = empRes.pagination;
      if (pagination) {
        setTotalPages(pagination.totalPages || 1);
        setTotalEmployees(pagination.total || 0);
      } else {
        setTotalPages(1);
        setTotalEmployees(empList.length);
      }

      // Build division options
      const divList = Array.isArray(divRes?.data) ? (divRes as { data: Array<{ _id: string; name: string }> }).data : (Array.isArray(divRes) ? divRes as Array<{ _id: string; name: string }> : []);
      setDivisions(divList.map((d: { _id: string; name: string }) => ({ _id: d._id, name: d.name })));

      // Build department options (filter by division if selected)
      let deptList = Array.isArray(deptRes?.data)
        ? (deptRes as { data: Array<{ _id: string; name: string; divisions?: Array<string | { _id: string }> }> }).data
        : (Array.isArray(deptRes) ? deptRes as Array<{ _id: string; name: string; divisions?: Array<string | { _id: string }> }> : []);
      if (selectedDivision) {
        deptList = deptList.filter((d: { divisions?: Array<string | { _id: string }> }) =>
          d.divisions?.some((div: string | { _id: string }) => (typeof div === 'string' ? div : div._id) === selectedDivision)
        );
      }
      setDepartments(deptList.map((d: { _id: string; name: string }) => ({ _id: d._id, name: d.name })));

      const map: RosterState = new Map();
      const entries = rosterRes?.data?.entries || [];
      setStrict(Boolean(rosterRes?.data?.strict));

      entries.forEach((e: RosterEntry) => {
        const emp = e.employeeNumber;
        if (!emp) return;
        if (!map.has(emp)) map.set(emp, {});
        const row = map.get(emp)!;
        // Backend now explicitly returns status: 'WO' for week offs
        // Also handle legacy data where shiftId is null (fallback)
        const isWeekOff = e.status === 'WO';
        const isHoliday = e.status === 'HOL';
        row[e.date] = {
          shiftId: e.shiftId || null,
          status: isWeekOff ? 'WO' : (isHoliday ? 'HOL' : undefined)
        };
      });

      // NEW: Pre-fill holidays into the map for gaps
      // Use local fetchedHolidays and fetchedGroups which we need to capture from above
      let localHolidays: Holiday[] = [];
      let localGroups: HolidayGroup[] = [];

      if (holidayRes && holidayRes.data) {
        if (Array.isArray(holidayRes.data)) {
          localHolidays = holidayRes.data;
        } else {
          localHolidays = holidayRes.data.holidays || [];
          localGroups = holidayRes.data.groups || [];
        }
      }

      const daysInMonth = getMonthDays(month);

      empList.forEach((emp: Employee) => {
        if (!map.has(emp.emp_no)) map.set(emp.emp_no, {});
        const row = map.get(emp.emp_no)!;

        daysInMonth.forEach(d => {
          // If we already have an entry (SHIFT, WO, or Saved HOL), skip
          if (row[d]) return;

          // Check if this day is a holiday for this employee
          const isHoliday = localHolidays.some(h => {
            const start = format(parseISO(h.date), 'yyyy-MM-dd');
            const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;

            if (d < start || d > end) return false;

            if (h.scope === 'GLOBAL') {
              if (h.applicableTo === 'ALL') {
                // Check for overrides
                const override = localHolidays.find(o =>
                  o.overridesMasterId === h._id &&
                  o.scope === 'GROUP' &&
                  checkGroupApplicability(o, emp, localGroups)
                );
                return !override;
              }
              if (h.applicableTo === 'SPECIFIC_GROUPS') {
                return checkGroupApplicability(h, emp, localGroups);
              }
              return true;
            } else if (h.scope === 'GROUP') {
              return checkGroupApplicability(h, emp, localGroups);
            }
            return false;
          });

          if (isHoliday) {
            row[d] = { shiftId: null, status: 'HOL' };
          }
        });
      });

      setRoster(map);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load roster';
      console.error('Error loading roster data:', err);
      toast.error(errorMsg);
      // Ensure arrays are set even on error
      setShifts([]);
      setEmployees([]);
      setDepartments([]);
      setRoster(new Map());
    } finally {
      setLoading(false);
    }
  }, [month, selectedDept, selectedDivision, page]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [month, selectedDept, selectedDivision]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateCell = useCallback((empNo: string, date: string, value: RosterCell) => {
    setRoster((prev) => {
      const map = new Map(prev);
      const row = { ...(map.get(empNo) || {}) };
      row[date] = value;
      map.set(empNo, row);
      return map;
    });
  }, []);

  const applyAllEmployees = useCallback((shiftId: string | null, status?: 'WO', activeDays?: string[]) => {
    if (!Array.isArray(employees) || employees.length === 0) {
      toast.error('No employees available');
      return;
    }
    setRoster((prev) => {
      const map = new Map(prev);
      employees.forEach((emp) => {
        const row: Record<string, RosterCell> = { ...(map.get(emp.emp_no) || {}) };
        days.forEach((d) => {
          // Protect existing Holidays and Week Offs during bulk assign
          if (row[d]?.status === 'HOL' || row[d]?.status === 'WO') return;

          if (activeDays && activeDays.length > 0) {
            const dow = weekdays[new Date(d).getDay()];
            if (activeDays.includes(dow)) {
              row[d] = { shiftId, status };
            }
          } else {
            row[d] = { shiftId, status };
          }
        });
        map.set(emp.emp_no, row);
      });
      return map;
    });
  }, [employees, days]);

  const applyEmployeeAllDays = useCallback((empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => {
    setRoster((prev) => {
      const map = new Map(prev);
      const row: Record<string, RosterCell> = { ...(map.get(empNo) || {}) };
      days.forEach((d) => {
        row[d] = { shiftId, status };
      });
      map.set(empNo, row);
      return map;
    });
  }, [days]);

  const saveRoster = useCallback(async () => {
    try {
      setSaving(true);
      setSavingProgress(10);
      const entries: Array<{ employeeNumber: string; date: string; shiftId?: string | null; status?: string }> = [];
      roster.forEach((row, empNo) => {
        Object.entries(row).forEach(([date, cell]) => {
          // Skip empty cells
          if (!cell) return;

          // Skip if neither shiftId nor status is set
          if (!cell.shiftId && cell.status !== 'WO' && cell.status !== 'HOL') return;

          const entry: { employeeNumber: string; date: string; shiftId?: string | null; status?: string } = {
            employeeNumber: empNo,
            date,
          };

          // Handle week off or holiday
          if (cell.status === 'WO') {
            entry.shiftId = null;
            entry.status = 'WO';
          } else if (cell.status === 'HOL') {
            entry.shiftId = null;
            entry.status = 'HOL';
          } else {
            // Regular shift - must have shiftId
            if (!cell.shiftId) {
              console.warn(`Skipping entry without shiftId for ${empNo} on ${date}`);
              return;
            }
            entry.shiftId = cell.shiftId;
            // Don't include status for regular shifts
          }

          entries.push(entry);
        });
      });

      console.log(`[Frontend] Prepared ${entries.length} entries to save:`, entries.slice(0, 5));

      if (entries.length === 0) {
        toast.error('No entries to save');
        setSaving(false);
        setSavingProgress(null);
        return;
      }

      setSavingProgress(30);
      const resp = await api.saveRoster({ month, strict, entries });
      setSavingProgress(90);

      if (resp?.success) {
        toast.success(`Roster saved successfully! (${entries.length} entries)`);
        // Reload data to reflect saved changes
        await loadData();
      } else {
        const errorMsg = resp?.message || resp?.error || 'Failed to save roster';
        toast.error(errorMsg);
        console.error('Save roster error:', resp);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save roster';
      console.error('Save roster exception:', err);
      toast.error(errorMsg);
    } finally {
      setSaving(false);
      setSavingProgress(null);
    }
  }, [month, strict, roster, loadData]);

  const applyWeekOffs = useCallback(() => {
    const activeDays = Object.entries(weekOffDays)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (activeDays.length === 0) {
      toast.error('Select at least one weekday');
      return;
    }
    if (!Array.isArray(employees) || employees.length === 0) {
      toast.error('No employees available');
      return;
    }
    setRoster((prev) => {
      const map = new Map(prev);
      employees.forEach((emp) => {
        const row: Record<string, RosterCell> = { ...(map.get(emp.emp_no) || {}) };
        days.forEach((d) => {
          // Protect existing Holidays during week-off assign
          if (row[d]?.status === 'HOL') return;

          const dow = weekdays[new Date(d).getDay()];
          if (activeDays.includes(dow)) {
            row[d] = { shiftId: null, status: 'WO' };
          }
        });
        map.set(emp.emp_no, row);
      });
      return map;
    });
    setShowWeekOff(false);
    toast.success('Weekly offs applied');
  }, [employees, days, weekOffDays]);

  const handleAssignAll = useCallback(() => {
    if (!selectedShiftForAssign) {
      toast.error('Please select a shift first');
      return;
    }
    const activeDays = Object.entries(shiftAssignDays)
      .filter(([, v]) => v)
      .map(([k]) => k);

    applyAllEmployees(selectedShiftForAssign, undefined, activeDays);
    const shift = shifts.find((s) => s._id === selectedShiftForAssign);
    toast.success(`Assigned ${shiftLabel(shift)} to all employees${activeDays.length > 0 ? ' on selected weekdays' : ''}`);
  }, [selectedShiftForAssign, shiftAssignDays, applyAllEmployees, shifts]);

  // Calculate assigned shifts summary
  const assignedShiftsSummary = useMemo(() => {
    const summary: Array<{
      employee: Employee;
      shifts: Array<{ shiftId: string | null; shiftLabel: string; days: number; dates: string[] }>;
      totalDays: number;
      weekOffs: number;
      holidays: number;
    }> = [];

    // Ensure employees is an array
    if (!Array.isArray(employees)) {
      return [];
    }

    employees.forEach((emp) => {
      const row = roster.get(emp.emp_no) || {};
      const shiftMap = new Map<string | null, { label: string; dates: string[] }>();

      Object.entries(row).forEach(([date, cell]) => {
        // Check for week off: either status is 'WO' or shiftId is null with status 'WO'
        const isWeekOff = cell?.status === 'WO';
        const isHoliday = cell?.status === 'HOL';
        const shiftId = isWeekOff ? 'WO' : (isHoliday ? 'HOL' : (cell?.shiftId || null));
        const label = isWeekOff ? 'Week Off' : (isHoliday ? 'Holiday' : (shiftId ? shiftLabel(shifts.find((s) => s._id === shiftId)) : 'Unassigned'));

        // Use a consistent key for week offs and holidays
        const mapKey = isWeekOff ? 'WO' : (isHoliday ? 'HOL' : shiftId);

        if (!shiftMap.has(mapKey)) {
          shiftMap.set(mapKey, { label, dates: [] });
        }
        shiftMap.get(mapKey)!.dates.push(date);
      });

      // Include employees even if they only have week offs
      if (shiftMap.size > 0) {
        const shiftsList = Array.from(shiftMap.entries())
          .map(([shiftId, data]) => ({
            shiftId,
            shiftLabel: data.label,
            days: data.dates.length,
            dates: data.dates.sort(),
          }))
          // Sort to show week offs first, then holidays, then other shifts
          .sort((a, b) => {
            if (a.shiftId === 'WO') return -1;
            if (b.shiftId === 'WO') return 1;
            if (a.shiftId === 'HOL') return -1;
            if (b.shiftId === 'HOL') return 1;
            return 0;
          });

        const totalDays = shiftsList.reduce((sum, s) => sum + s.days, 0);
        const weekOffs = shiftsList.find((s) => s.shiftId === 'WO')?.days || 0;
        const holidaysCount = shiftsList.find((s) => s.shiftId === 'HOL')?.days || 0;
        summary.push({ employee: emp, shifts: shiftsList, totalDays, weekOffs, holidays: holidaysCount });
      }
    });

    return summary.sort((a, b) => (a.employee.employee_name || a.employee.emp_no).localeCompare(b.employee.employee_name || b.employee.emp_no));
  }, [employees, roster, shifts]);

  const handleExportExcel = useCallback(async () => {
    const exportToast = toast.loading('Preparing full roster export...');
    try {
      const divisionName = selectedDivision ? (divisions.find(d => d._id === selectedDivision)?.name || 'Selected Division') : 'All Divisions';
      const deptName = selectedDept ? (departments.find(d => d._id === selectedDept)?.name || 'Selected Department') : 'All Departments';
      const monthDisplay = format(parseISO(`${month}-01`), 'MMMM yyyy');

      const title = `Shift Roster of ${divisionName} and ${deptName} for ${monthDisplay}`;

      // Fetch ALL employees and ALL roster entries matching the filters (ignore UI pagination)
      const empFilters: { limit: number; department_id?: string; division_id?: string } = { limit: 10000 };
      if (selectedDept) empFilters.department_id = selectedDept;
      if (selectedDivision) empFilters.division_id = selectedDivision;

      const [allEmpsRes, allRosterRes] = await Promise.all([
        api.getEmployees(empFilters) as Promise<{ data: Employee[] }>,
        api.getRoster(month, { departmentId: selectedDept || undefined, divisionId: selectedDivision || undefined }) as Promise<{ data: { entries: RosterEntry[] } }>
      ]);

      const allEmployees = allEmpsRes.data || [];
      const allRosterEntries = allRosterRes.data?.entries || [];

      // Build a full roster map for these employees
      const fullRosterMap = new Map<string, Record<string, RosterCell>>();
      allRosterEntries.forEach(e => {
        const emp = e.employeeNumber;
        if (!emp) return;
        if (!fullRosterMap.has(emp)) fullRosterMap.set(emp, {});
        const row = fullRosterMap.get(emp)!;
        row[e.date] = {
          shiftId: e.shiftId || null,
          status: e.status === 'WO' ? 'WO' : (e.status === 'HOL' ? 'HOL' : undefined)
        };
      });

      // Prepare data for Excel
      const data: string[][] = [
        [title],
        [], // spacing
        ['Emp No', 'Employee Name', 'Division', 'Department', ...days.map(d => format(parseISO(d), 'dd-MMM'))]
      ];

      allEmployees.forEach(emp => {
        const rowData: string[] = [
          emp.emp_no,
          emp.employee_name || '-',
          emp.division?.name || '-',
          emp.department?.name || '-',
        ];

        days.forEach(d => {
          let cell = (fullRosterMap.get(emp.emp_no) || {})[d];

          // If no specific status is found, check if it's an inherited holiday
          if (!cell) {
            const isHoliday = holidays.some(h => {
              const start = format(parseISO(h.date), 'yyyy-MM-dd');
              const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;
              if (d < start || d > end) return false;

              if (h.scope === 'GLOBAL') {
                if (h.applicableTo === 'ALL') {
                  const override = holidays.find(o => o.overridesMasterId === h._id && o.scope === 'GROUP' && checkGroupApplicability(o, emp, holidayGroups));
                  return !override;
                }
                return checkGroupApplicability(h, emp, holidayGroups);
              } else if (h.scope === 'GROUP') {
                return checkGroupApplicability(h, emp, holidayGroups);
              }
              return false;
            });
            if (isHoliday) {
              cell = { shiftId: null, status: 'HOL' };
            }
          }

          if (cell?.status === 'WO') {
            rowData.push('Week Off');
          } else if (cell?.status === 'HOL') {
            rowData.push('Holiday');
          } else if (cell?.shiftId) {
            const shift = shifts.find(s => s._id === cell.shiftId);
            if (shift) {
              const timing = `(${shift.startTime} - ${shift.endTime})`;
              rowData.push(`${shiftLabel(shift)} ${timing}`);
            } else {
              rowData.push('Unassigned');
            }
          } else {
            rowData.push('-');
          }
        });

        data.push(rowData);
      });

      // Create Worksheet
      const ws = XLSX.utils.aoa_to_sheet(data);

      // Auto-size columns (rough estimate)
      const colWidths = data[2].map((_, i) => ({
        wch: Math.max(...data.slice(2).map(row => (row[i] ? row[i].toString().length : 5))) + 2
      }));
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Shift Roster');

      const fileName = `Shift_Roster_${divisionName}_${deptName}_${month}.xlsx`.replace(/\s+/g, '_');
      XLSX.writeFile(wb, fileName);
      toast.success('Roster exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export roster');
    } finally {
      toast.dismiss(exportToast);
    }
  }, [shifts, days, month, selectedDivision, selectedDept, divisions, departments, holidays, holidayGroups]);

  // Filtered employees for list - uses debounced search
  const filteredEmployees = useMemo(() => {
    if (!debouncedSearch) return employees;
    const term = debouncedSearch.toLowerCase();
    return employees.filter(emp =>
      (emp.employee_name || '').toLowerCase().includes(term) ||
      (emp.emp_no || '').toLowerCase().includes(term)
    );
  }, [employees, debouncedSearch]);

  const isInitialLoad = loading && employees.length === 0;

  if (isInitialLoad) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
        <p className="text-slate-600 dark:text-slate-300 font-medium">Loading roster data...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#f8fafc] dark:bg-[#020617]">
      {/* Background Pattern */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/20 via-indigo-50/20 to-transparent dark:from-slate-900/40 dark:via-slate-900/40 dark:to-slate-900/60" />

      <div className="relative z-10 w-full px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Header Section */}
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 rounded-[1.5rem] border border-slate-200/60 bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80 sm:p-6 transition-all">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <LayoutGrid size={18} />
            </div>
            <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl uppercase">
              Shift Roster
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4 lg:justify-end">
            {/* Legend Section Integrated in Header */}
            <div className="flex flex-wrap items-center gap-y-2 gap-x-4">
              {/* Static Legends */}
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40">
                <span className="h-2 w-2 rounded-full bg-orange-400"></span>
                <span className="text-[9px] font-black uppercase tracking-widest text-orange-700 dark:text-orange-400">Week Off</span>
              </div>
              <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40">
                <span className="h-2 w-2 rounded-full bg-red-400"></span>
                <span className="text-[9px] font-black uppercase tracking-widest text-red-700 dark:text-red-400">Holiday</span>
              </div>

              {/* Dynamic Shift Legends */}
              {shifts.slice(0, 6).map((s) => (
                <div key={s._id} className="flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/60">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#3b82f6' }}></span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">{shiftLabel(s)}</span>
                </div>
              ))}
              {shifts.length > 6 && (
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">+{shifts.length - 6} more</div>
              )}
            </div>

            <div className="hidden lg:block h-6 w-[1px] bg-slate-200 dark:bg-slate-800"></div>

            <div className="flex -space-x-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-6 w-6 rounded-lg border border-white dark:border-slate-950 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-sm">
                  <span className="text-[8px] font-black text-slate-500">U{i}</span>
                </div>
              ))}
              <div className="h-6 w-6 rounded-lg border border-white dark:border-slate-950 bg-blue-500 flex items-center justify-center text-white text-[8px] font-black shadow-sm">
                +{totalEmployees > 3 ? totalEmployees - 3 : 0}
              </div>
            </div>
          </div>
        </div>

        {/* Control Bar: Filters & Quick Assign */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <RosterFilters
            selectedDivision={selectedDivision}
            setSelectedDivision={setSelectedDivision}
            divisions={divisions}
            selectedDept={selectedDept}
            setSelectedDept={setSelectedDept}
            departments={departments}
            month={month}
            setMonth={setMonth}
          />

          <div className="lg:col-span-12">
            <QuickAssignSection
              weekdays={weekdays}
              shiftAssignDays={shiftAssignDays}
              setShiftAssignDays={setShiftAssignDays}
              selectedShiftForAssign={selectedShiftForAssign}
              setSelectedShiftForAssign={setSelectedShiftForAssign}
              shifts={shifts}
              handleAssignAll={handleAssignAll}
            />
          </div>

          <div className="lg:col-span-12 flex items-center justify-between gap-4 mt-2">
            <div className="flex items-center gap-3">
              {/* Strict Toggle Restored */}
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                <div className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={strict}
                    onChange={(e) => setStrict(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-tight text-slate-500 dark:text-slate-400">Strict mode</span>
              </label>

              {/* Search Input */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all focus-within:ring-2 focus-within:ring-blue-500/10 group/search">
                <Search size={14} className="text-slate-400 group-focus-within/search:text-blue-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none w-[120px]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 border border-green-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-green-700 transition-all active:scale-[0.98] shadow-md"
              >
                <Download size={14} />
                Export Roster
              </button>
              <button
                onClick={() => setShowWeekOff(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-[0.98] shadow-md dark:bg-slate-800/80 dark:hover:bg-slate-800"
              >
                <Settings2 size={14} />
                Assign Offs
              </button>
              <button
                onClick={saveRoster}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                <Save size={16} className="text-blue-100" />
                {saving ? `...${savingProgress}%` : 'Save Roster'}
              </button>
            </div>
          </div>
        </div>


        {/* Tabs */}
        < div className="flex gap-1.5 p-1 rounded-[1.2rem] bg-indigo-50/30 border border-slate-200/60 w-fit backdrop-blur-sm dark:bg-slate-950/50 dark:border-slate-800/60" >
          <button
            onClick={() => setActiveTab('roster')}
            className={`flex items-center gap-2 px-6 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'roster'
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-blue-400 border border-slate-100 dark:border-slate-800'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
            <LayoutGrid size={12} />
            Schedule Grid
          </button>
          <button
            onClick={() => setActiveTab('assigned')}
            className={`flex items-center gap-2 px-6 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'assigned'
              ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-900 dark:text-blue-400 border border-slate-100 dark:border-slate-800'
              : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
          >
            <CheckCircle2 size={12} />
            Assignments
          </button>
        </div >


        {/* Roster View */}
        {
          activeTab === 'roster' && (
            <RosterGrid
              loading={loading}
              filteredEmployees={filteredEmployees}
              totalEmployees={totalEmployees}
              page={page}
              setPage={setPage}
              totalPages={totalPages}
              days={days}
              holidays={holidays}
              weekdays={weekdays}
              roster={roster}
              holidayCache={holidayCache}
              shifts={shifts}
              updateCell={updateCell}
              applyEmployeeAllDays={applyEmployeeAllDays}
            />
          )
        }

        {/* Assigned Shifts View */}
        {
          activeTab === 'assigned' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12">
              {assignedShiftsSummary.filter(item =>
                (item.employee.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (item.employee.emp_no || '').toLowerCase().includes(searchTerm.toLowerCase())
              ).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white/40 dark:bg-slate-900/40 rounded-[2rem] border border-dashed border-slate-300 dark:border-slate-700">
                  <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
                    <Search size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">No matching assignments</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs text-center">Try adjusting your search or filters to see assignment summaries.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {assignedShiftsSummary
                    .filter(item =>
                      (item.employee.employee_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (item.employee.emp_no || '').toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map((item) => (
                      <div
                        key={item.employee._id}
                        className="group relative flex flex-col rounded-[2rem] border border-slate-200/60 bg-white/80 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] backdrop-blur-md dark:border-slate-800/60 dark:bg-slate-950/80 hover:shadow-[0_12px_40px_rgb(0,0,0,0.06)] transition-all duration-300 overflow-hidden"
                      >
                        {/* Decorative Element */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/5 to-transparent rounded-bl-[100px] pointer-events-none"></div>

                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 relative z-10">
                          <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-blue-500/20">
                              {(item.employee.employee_name || 'U')[0].toUpperCase()}
                            </div>
                            <div>
                              <h3 className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-tight leading-tight">
                                {item.employee.employee_name || item.employee.emp_no}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{item.employee.emp_no}</span>
                                <div className="h-0.5 w-0.5 rounded-full bg-slate-300 dark:bg-slate-700"></div>
                                <span className="text-[8px] font-black text-blue-500/80 dark:text-blue-400/80 uppercase tracking-wider truncate max-w-[120px]">
                                  {item.employee.department?.name || 'No Dept'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <div className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-center">
                              <div className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Offs</div>
                              <div className={`text-sm font-black ${item.weekOffs > 0 ? 'text-orange-500' : 'text-slate-300 dark:text-slate-700'}`}>
                                {item.weekOffs}
                              </div>
                            </div>
                            <div className="px-3 py-1.5 rounded-xl bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100/50 dark:border-blue-800/50 text-center">
                              <div className="text-[8px] font-black text-blue-400/80 dark:text-blue-500/80 uppercase tracking-widest mb-0.5">Days</div>
                              <div className="text-sm font-black text-blue-600 dark:text-blue-400">
                                {item.totalDays}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
                          {item.shifts.map((shift, idx) => {
                            const originalShift = shifts.find(s => s._id === shift.shiftId);
                            const shiftColor = originalShift?.color || '#3b82f6';

                            return (
                              <div
                                key={idx}
                                className={`p-3.5 rounded-2xl border transition-all ${shift.shiftId === 'WO'
                                  ? 'bg-orange-500/5 border-orange-200/50 dark:bg-orange-500/10 dark:border-orange-900/50'
                                  : shift.shiftId === 'HOL'
                                    ? 'bg-red-500/5 border-red-200/50 dark:bg-red-500/10 dark:border-red-900/50'
                                    : 'bg-white border-slate-200/60 dark:bg-slate-900/40 dark:border-slate-800/60'
                                  }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    {shift.shiftId !== 'WO' && shift.shiftId !== 'HOL' && (
                                      <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: shiftColor }}></div>
                                    )}
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${shift.shiftId === 'WO' ? 'text-orange-600 dark:text-orange-400' :
                                      shift.shiftId === 'HOL' ? 'text-red-500' :
                                        'text-slate-700 dark:text-slate-300'
                                      }`}>
                                      {shift.shiftLabel}
                                    </span>
                                  </div>
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-lg bg-white/80 dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700">
                                    {shift.days}d
                                  </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 ml-0.5">
                                  {shift.dates.slice(0, 8).map((d) => (
                                    <div key={d} className="w-5 h-5 flex items-center justify-center rounded-md bg-white dark:bg-slate-800 text-[9px] font-bold text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700/50 hover:border-blue-500/30 transition-colors cursor-default">
                                      {new Date(d).getDate()}
                                    </div>
                                  ))}
                                  {shift.dates.length > 8 && (
                                    <div className="h-5 flex items-center px-1.5 rounded-md bg-slate-50 dark:bg-slate-800/50 text-[8px] font-black text-slate-400 uppercase tracking-tighter border border-slate-100 dark:border-slate-800">
                                      +{shift.dates.length - 8} More
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )
        }

        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Employees: {employees.length} | Days: {days.length}
          </div>
          <button
            onClick={saveRoster}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save roster'}
          </button>
        </div>
        {
          saving && (
            <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${savingProgress ?? 50}%` }}
              />
            </div>
          )
        }

        {
          showWeekOff && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
              <div className="bg-white dark:bg-slate-800 rounded-xl p-4 w-full max-w-md space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Assign Weekly Offs</h3>
                <div className="grid grid-cols-2 gap-2">
                  {weekdays.map((w) => (
                    <label key={w} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={weekOffDays[w]}
                        onChange={(e) => setWeekOffDays((prev) => ({ ...prev, [w]: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      {w}
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowWeekOff(false)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm">
                    Cancel
                  </button>
                  <button onClick={applyWeekOffs} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold">
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}

// Memoized Cell Component for extreme performance
const RosterCellComponent = memo(({
  empNo,
  date,
  cell,
  isHoliday,
  isWeekend,
  shifts,
  onUpdate
}: {
  empNo: string;
  date: string;
  cell: RosterCell;
  isHoliday: boolean;
  isWeekend: boolean;
  shifts: Shift[];
  onUpdate: (empNo: string, date: string, value: RosterCell) => void;
}) => {
  const current = cell?.status === 'WO' ? 'WO' : (cell?.status === 'HOL' ? 'HOL' : cell?.shiftId || '');
  const shiftColor = shifts.find(s => s._id === current)?.color || '#3b82f6';

  return (
    <td
      className={`p-1 text-center relative h-[60px] border-r border-slate-200/40 dark:border-slate-800/40 last:border-r-0 ${isWeekend ? 'bg-slate-50/30 dark:bg-slate-800/10' : ''} ${isHoliday ? 'bg-red-50/30 dark:bg-red-900/5' : ''}`}
    >
      <div className="relative w-full h-full flex flex-col items-center justify-center group/cell">
        <select
          value={current}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'WO') {
              onUpdate(empNo, date, { shiftId: null, status: 'WO' });
            } else if (val === 'HOL') {
              onUpdate(empNo, date, { shiftId: null, status: 'HOL' });
            } else {
              onUpdate(empNo, date, { shiftId: val || null, status: undefined });
            }
          }}
          className={`z-10 w-full h-7 text-[9px] font-black uppercase tracking-widest rounded-lg bg-transparent px-1 py-1 focus:ring-2 focus:ring-blue-500/20 focus:outline-none appearance-none text-center cursor-pointer transition-all ${current === 'WO' ? 'text-orange-600 bg-orange-100/50 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400' :
            current === 'HOL' ? 'text-red-600 bg-red-100/50 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400' :
              current ? 'text-white shadow-sm' : 'text-slate-400 opacity-0 group-hover/cell:opacity-100'
            }`}
          style={current && current !== 'WO' && current !== 'HOL' ? { backgroundColor: shiftColor } : {}}
        >
          <option value="">-</option>
          <option value="WO" className="bg-white text-orange-600 dark:bg-slate-900">WO</option>
          <option value="HOL" className="bg-white text-red-600 dark:bg-slate-900">HOL</option>
          {shifts.map((s) => (
            <option key={s._id} value={s._id} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
              {shiftLabel(s)}
            </option>
          ))}
        </select>

        {!current && isHoliday && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[9px] font-black text-red-500/30 tracking-tighter uppercase">Hol</span>
          </div>
        )}

        {!current && !isHoliday && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover/cell:opacity-20 transition-opacity">
            <Plus size={12} className="text-slate-400" />
          </div>
        )}
      </div>
    </td>
  );
});

RosterCellComponent.displayName = 'RosterCellComponent';

// Memoized Row Component
const RosterRow = memo(({
  emp,
  days,
  row,
  empHolidays,
  shifts,
  onUpdate,
  onBulkUpdate
}: {
  emp: Employee;
  days: string[];
  row: Record<string, RosterCell>;
  empHolidays: Set<string>;
  shifts: Shift[];
  onUpdate: (empNo: string, date: string, value: RosterCell) => void;
  onBulkUpdate: (empNo: string, shiftId: string | null, status?: 'WO' | 'HOL') => void;
}) => {
  return (
    <tr className="group border-b border-slate-200/40 dark:border-slate-800/40 hover:bg-blue-50/20 dark:hover:bg-blue-400/5 transition-colors">
      <td className="px-5 py-4 sticky left-0 z-10 bg-white dark:bg-slate-950 group-hover:bg-blue-50/30 dark:group-hover:bg-blue-900/10 shadow-[10px_0_15px_-10px_rgba(0,0,0,0.1)] border-r border-slate-200/60 dark:border-slate-800/60">
        <div className="flex flex-col gap-2">
          <div>
            <div className="font-black text-slate-900 dark:text-slate-100 text-[11px] mb-0.5 leading-tight uppercase tracking-tight">{emp.employee_name || emp.emp_no}</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded shadow-sm">{emp.emp_no}</span>
              {emp.department && (
                <span className="text-[8px] font-black text-blue-600/70 dark:text-blue-400/70 uppercase tracking-widest truncate max-w-[80px]">{emp.department.name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <select
              className="w-full text-[9px] font-black uppercase tracking-widest rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 cursor-pointer shadow-sm hover:border-blue-500 dark:hover:border-blue-400 transition-all outline-none"
              onChange={(e) => onBulkUpdate(emp.emp_no, e.target.value || null, e.target.value === 'WO' ? 'WO' : (e.target.value === 'HOL' ? 'HOL' : undefined))}
              defaultValue=""
            >
              <option value="">Bulk Assign...</option>
              <option value="WO">Set Week Off</option>
              <option value="HOL">Set Holiday</option>
              {shifts.map((s) => (
                <option key={s._id} value={s._id}>
                  Set {shiftLabel(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </td>
      {days.map((d) => (
        <RosterCellComponent
          key={d}
          empNo={emp.emp_no}
          date={d}
          cell={row[d]}
          isHoliday={empHolidays.has(d)}
          isWeekend={new Date(d).getDay() === 0 || new Date(d).getDay() === 6}
          shifts={shifts}
          onUpdate={onUpdate}
        />
      ))}
    </tr>
  );
});

RosterRow.displayName = 'RosterRow';

const RosterFilters = memo(({
  selectedDivision,
  setSelectedDivision,
  divisions,
  selectedDept,
  setSelectedDept,
  departments,
  month,
  setMonth
}: {
  selectedDivision: string;
  setSelectedDivision: (val: string) => void;
  divisions: Array<{ _id: string; name: string }>;
  selectedDept: string;
  setSelectedDept: (val: string) => void;
  departments: Array<{ _id: string; name: string }>;
  month: string;
  setMonth: (val: string) => void;
}) => {
  return (
    <div className="lg:col-span-9 flex flex-wrap items-center gap-3">
      {/* Division Filter */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
        <Building2 size={14} className="text-slate-400" />
        <select
          value={selectedDivision}
          onChange={(e) => {
            setSelectedDivision(e.target.value);
            setSelectedDept('');
          }}
          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none min-w-[110px]"
        >
          <option value="">All Divisions</option>
          {divisions.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Department Filter */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
        <Filter size={14} className="text-slate-400" />
        <select
          value={selectedDept}
          onChange={(e) => setSelectedDept(e.target.value)}
          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none min-w-[120px]"
        >
          <option value="">All Depts</option>
          {departments.map((d) => (
            <option key={d._id} value={d._id}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Month Filter */}
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-blue-500/30">
        <Calendar size={14} className="text-slate-400" />
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 focus:outline-none"
        />
      </div>
    </div>
  );
});
RosterFilters.displayName = 'RosterFilters';

const QuickAssignSection = memo(({
  weekdays,
  shiftAssignDays,
  setShiftAssignDays,
  selectedShiftForAssign,
  setSelectedShiftForAssign,
  shifts,
  handleAssignAll
}: {
  weekdays: string[];
  shiftAssignDays: Record<string, boolean>;
  setShiftAssignDays: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  selectedShiftForAssign: string;
  setSelectedShiftForAssign: (val: string) => void;
  shifts: Shift[];
  handleAssignAll: () => void;
}) => {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-indigo-50/50 dark:bg-indigo-900/10 px-4 py-2.5 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/30 shadow-sm transition-all hover:bg-white dark:hover:bg-slate-900">
      <div className="flex items-center gap-2">
        <Plus size={16} className="text-indigo-600 dark:text-indigo-400" />
        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Quick Assign</span>
      </div>

      {/* Weekday Selector for Shifts */}
      <div className="flex items-center gap-1 bg-white/50 dark:bg-slate-900/50 p-1 rounded-lg border border-indigo-100/50 dark:border-indigo-900/30">
        {weekdays.map((w) => (
          <button
            key={w}
            onClick={() => setShiftAssignDays(prev => ({ ...prev, [w]: !prev[w] }))}
            className={`w-6 h-6 rounded-md text-[9px] font-black transition-all flex items-center justify-center uppercase ${shiftAssignDays[w]
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
          >
            {w[0]}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <select
          value={selectedShiftForAssign}
          onChange={(e) => setSelectedShiftForAssign(e.target.value)}
          className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/50 rounded-lg text-[10px] font-black uppercase tracking-widest text-indigo-700 dark:text-indigo-300 focus:outline-none px-2.5 py-2 min-w-[120px] shadow-sm"
        >
          <option value="">Select Shift</option>
          {shifts.map((s) => (
            <option key={s._id} value={s._id}>{shiftLabel(s)}</option>
          ))}
        </select>
        <button
          onClick={handleAssignAll}
          disabled={!selectedShiftForAssign}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md active:scale-95"
        >
          Apply to All
        </button>
      </div>

      <div className="hidden sm:block h-6 w-[1px] bg-indigo-200 dark:bg-indigo-800 mx-1" />

      <div className="flex flex-wrap gap-1.5">
        {shifts.slice(0, 4).map(shift => (
          <button
            key={shift._id}
            onClick={() => setSelectedShiftForAssign(shift._id)}
            className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-tight transition-all ${selectedShiftForAssign === shift._id
              ? 'border-indigo-500 bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'border-slate-200 bg-white text-slate-500 dark:border-slate-800 dark:bg-slate-900 hover:border-indigo-300'
              }`}
          >
            {shiftLabel(shift)}
          </button>
        ))}
      </div>
    </div>
  );
});
QuickAssignSection.displayName = 'QuickAssignSection';

const RosterGrid = memo(({
  loading,
  filteredEmployees,
  totalEmployees,
  page,
  setPage,
  totalPages,
  days,
  holidays,
  weekdays,
  roster,
  holidayCache,
  shifts,
  updateCell,
  applyEmployeeAllDays
}: {
  loading: boolean;
  filteredEmployees: Employee[];
  totalEmployees: number;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  days: string[];
  holidays: Holiday[];
  weekdays: string[];
  roster: Map<string, Record<string, RosterCell>>;
  holidayCache: Map<string, Set<string>>;
  shifts: Shift[];
  updateCell: (empNo: string, date: string, value: RosterCell) => void;
  applyEmployeeAllDays: (empNo: string, shiftId: string | null, status?: "WO" | "HOL") => void;
}) => {
  return (
    <div className={`relative border border-slate-200/60 dark:border-slate-800/60 rounded-[1.5rem] overflow-hidden bg-white/40 dark:bg-slate-950/40 shadow-[0_4px_20px_rgba(0,0,0,0.03)] backdrop-blur-md transition-opacity duration-300 ${loading ? 'opacity-70' : 'opacity-100'}`}>
      {loading && (
        <div className="absolute inset-0 z-40 bg-white/10 dark:bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white/80 dark:bg-slate-800/80 px-6 py-3 rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 flex items-center gap-3 animate-in fade-in zoom-in duration-300">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent" />
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Updating...</span>
          </div>
        </div>
      )}

      {/* Pagination Controls Moved to Top */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-800/60 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <Users size={14} />
          </div>
          <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Showing <span className="text-slate-900 dark:text-slate-100 mx-0.5">{filteredEmployees.length}</span> / <span className="text-slate-900 dark:text-slate-100 mx-0.5">{totalEmployees}</span> Staff
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 shadow-sm"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>

          <div className="flex items-center gap-1.5 px-3 h-7 rounded-lg border border-slate-200/60 bg-white/50 dark:border-slate-800/60 dark:bg-slate-900/50 backdrop-blur-sm shadow-inner">
            <span className="text-[11px] font-black text-blue-600 dark:text-blue-400">{page}</span>
            <span className="text-[8px] font-bold text-slate-400 mx-0.5">/</span>
            <span className="text-[11px] font-black text-slate-400 dark:text-slate-600">{totalPages}</span>
          </div>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 shadow-sm"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        <table className="w-full text-sm border-collapse min-w-[1200px]">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200/60 dark:border-slate-800/60">
              <th className="px-4 py-3 text-left w-[200px] sticky left-0 z-30 bg-white dark:bg-slate-950 font-black text-slate-900 dark:text-slate-50 shadow-[10px_0_15px_-10px_rgba(0,0,0,0.1)] border-r border-slate-200/60 dark:border-slate-800/60">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-blue-500" />
                  <span className="uppercase tracking-widest text-[9px]">Staff Details</span>
                </div>
              </th>
              {days.map((d) => {
                const date = new Date(d);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isHoliday = holidays.some(h => {
                  const start = format(parseISO(h.date), 'yyyy-MM-dd');
                  const end = h.endDate ? format(parseISO(h.endDate), 'yyyy-MM-dd') : start;
                  return d >= start && d <= end;
                });
                return (
                  <th
                    key={d}
                    className={`min-w-[45px] px-1 py-4 text-center border-r border-slate-200/40 dark:border-slate-800/40 ${isWeekend ? 'bg-slate-100/30 dark:bg-slate-800/20' : ''} ${isHoliday ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}
                  >
                    <div className={`text-[11px] font-black ${isWeekend ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}>
                      {date.getDate()}
                    </div>
                    <div className={`text-[8px] font-black uppercase tracking-widest ${isWeekend ? 'text-slate-300 dark:text-slate-600' : 'text-slate-400 dark:text-slate-500'}`}>
                      {weekdays[date.getDay()].slice(0, 3)}
                    </div>
                    {isHoliday && (
                      <div className="mt-1 flex justify-center">
                        <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse"></span>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => (
              <RosterRow
                key={emp._id}
                emp={emp}
                days={days}
                row={roster.get(emp.emp_no) || {}}
                empHolidays={holidayCache.get(emp.emp_no) || new Set()}
                shifts={shifts}
                onUpdate={updateCell}
                onBulkUpdate={applyEmployeeAllDays}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
RosterGrid.displayName = 'RosterGrid';

export default RosterPage;

