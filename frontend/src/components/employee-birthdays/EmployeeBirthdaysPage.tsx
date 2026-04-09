'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Employee } from '@/lib/api';
import TodayBirthdayTicker from '@/components/employee-birthdays/TodayBirthdayTicker';
import {
  Cake,
  CalendarClock,
  CalendarDays,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X,
  Clock3,
  Search,
  Users,
  Building2,
  Building,
  RefreshCw,
} from 'lucide-react';

type BirthdaySection = 'today' | 'upcoming' | 'past';

type EmployeeBirthday = {
  id: string;
  empNo: string;
  name: string;
  dob: string;
  divisionName: string;
  departmentName: string;
  designationName: string;
  birthdayThisYear: Date;
  birthdayNext: Date;
  ageNow: number;
  turningAge: number;
  daysFromToday: number;
  section: BirthdaySection;
};

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday-first order

const toDateInputValue = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMonthLabel = (date: Date) =>
  date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const formatBirthday = (dob: string) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
};

const getMonthDay = (dob: string) => {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getMonth(), day: d.getDate(), year: d.getFullYear() };
};

const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

const buildBirthdayDate = (year: number, month: number, day: number) => {
  const safeDay = Math.min(day, getDaysInMonth(year, month));
  return new Date(year, month, safeDay, 0, 0, 0, 0);
};

const getDivisionName = (emp: Employee) => {
  if (!emp.division_id) return '—';
  if (typeof emp.division_id === 'object' && emp.division_id?.name) return emp.division_id.name;
  if (typeof emp.division === 'object' && emp.division?.name) return emp.division.name;
  return '—';
};

const getDepartmentName = (emp: Employee) => {
  if (!emp.department_id) return '—';
  if (typeof emp.department_id === 'object' && emp.department_id?.name) return emp.department_id.name;
  if (typeof emp.department === 'object' && emp.department?.name) return emp.department.name;
  return '—';
};

const getDesignationName = (emp: Employee) => {
  if (!emp.designation_id) return '—';
  if (typeof emp.designation_id === 'object' && emp.designation_id?.name) return emp.designation_id.name;
  if (typeof emp.designation === 'object' && emp.designation?.name) return emp.designation.name;
  return '—';
};

const toStartOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

const getDaysDiff = (from: Date, to: Date) => {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / msPerDay);
};

const getWeekRange = (today: Date) => {
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(today.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const classifyBirthday = (emp: Employee, today: Date): EmployeeBirthday | null => {
  if (!emp.dob) return null;
  const md = getMonthDay(emp.dob);
  if (!md) return null;

  const thisYearBirthday = buildBirthdayDate(today.getFullYear(), md.month, md.day);
  const birthDate = buildBirthdayDate(md.year, md.month, md.day);
  const nextBirthday = thisYearBirthday < today
    ? buildBirthdayDate(today.getFullYear() + 1, md.month, md.day)
    : thisYearBirthday;

  let section: BirthdaySection = 'upcoming';
  if (thisYearBirthday.getTime() === today.getTime()) section = 'today';
  else if (thisYearBirthday < today) section = 'past';

  const ageNow = Math.max(0, today.getFullYear() - birthDate.getFullYear() - (today < thisYearBirthday ? 1 : 0));
  const turningAge = ageNow + (section === 'past' ? 1 : 0);

  return {
    id: emp._id,
    empNo: emp.emp_no,
    name: emp.employee_name,
    dob: emp.dob,
    divisionName: getDivisionName(emp),
    departmentName: getDepartmentName(emp),
    designationName: getDesignationName(emp),
    birthdayThisYear: thisYearBirthday,
    birthdayNext: nextBirthday,
    ageNow,
    turningAge,
    daysFromToday: getDaysDiff(today, nextBirthday),
    section,
  };
};

const BirthdayList = ({
  title,
  badgeClass,
  icon: Icon,
  employees,
  emptyText,
}: {
  title: string;
  badgeClass: string;
  icon: React.ComponentType<{ className?: string }>;
  employees: EmployeeBirthday[];
  emptyText: string;
}) => {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
          <Icon className="h-3.5 w-3.5" />
          {employees.length}
        </span>
      </div>

      {employees.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {employees.map((emp) => (
            <div
              key={emp.id}
              className="rounded-xl border border-slate-200 p-3 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{emp.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{emp.empNo}</p>
                </div>
                <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                  {formatBirthday(emp.dob)}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500">Division</span>
                  <p className="truncate font-medium">{emp.divisionName}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500">Department</span>
                  <p className="truncate font-medium">{emp.departmentName}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500">Age</span>
                  <p className="font-medium">{emp.ageNow}</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/60">
                  <span className="text-slate-400 dark:text-slate-500">Next Birthday</span>
                  <p className="font-medium">{formatDate(emp.birthdayNext)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default function EmployeeBirthdaysPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRange, setSelectedRange] = useState<'month' | 'week' | 'today' | 'tomorrow'>('month');
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(toDateInputValue(new Date()));
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const fetchEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getEmployees({ includeLeft: false, limit: 10000, page: 1 });
      if (response?.success) {
        setEmployees(Array.isArray(response.data) ? response.data : []);
      } else {
        setEmployees([]);
        setError('Unable to load employee birthdays.');
      }
    } catch (err: any) {
      setEmployees([]);
      setError(err?.message || 'Unable to load employee birthdays.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const today = useMemo(() => toStartOfDay(new Date()), []);
  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, month) => ({
        value: String(month),
        label: new Date(2024, month, 1).toLocaleDateString('en-IN', { month: 'long' }),
      })),
    []
  );

  const birthdayEmployees = useMemo(() => {
    return employees
      .map((emp) => classifyBirthday(emp, today))
      .filter((emp): emp is EmployeeBirthday => Boolean(emp));
  }, [employees, today]);

  const tomorrow = useMemo(() => {
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    return t;
  }, [today]);

  const divisions = useMemo(() => {
    return Array.from(new Set(birthdayEmployees.map((e) => e.divisionName).filter((v) => v && v !== '—'))).sort();
  }, [birthdayEmployees]);

  const departments = useMemo(() => {
    return Array.from(new Set(birthdayEmployees.map((e) => e.departmentName).filter((v) => v && v !== '—'))).sort();
  }, [birthdayEmployees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedMonthNumber = Number(selectedMonth);
    const weekRange = getWeekRange(today);
    return birthdayEmployees.filter((emp) => {
      const matchesSearch =
        !q ||
        emp.name.toLowerCase().includes(q) ||
        emp.empNo.toLowerCase().includes(q);
      const matchesMonth = emp.birthdayThisYear.getMonth() === selectedMonthNumber;
      const matchesWeek = emp.birthdayThisYear >= weekRange.start && emp.birthdayThisYear <= weekRange.end;
      const matchesToday =
        emp.birthdayThisYear.getMonth() === today.getMonth() &&
        emp.birthdayThisYear.getDate() === today.getDate();
      const matchesTomorrow =
        emp.birthdayThisYear.getMonth() === tomorrow.getMonth() &&
        emp.birthdayThisYear.getDate() === tomorrow.getDate();
      const matchesRange =
        selectedRange === 'week'
          ? matchesWeek
          : selectedRange === 'today'
            ? matchesToday
            : selectedRange === 'tomorrow'
              ? matchesTomorrow
              : matchesMonth;
      const matchesDivision = divisionFilter === 'all' || emp.divisionName === divisionFilter;
      const matchesDepartment = departmentFilter === 'all' || emp.departmentName === departmentFilter;
      return matchesSearch && matchesRange && matchesDivision && matchesDepartment;
    });
  }, [birthdayEmployees, search, selectedMonth, selectedRange, divisionFilter, departmentFilter, today, tomorrow]);

  const todayCount = useMemo(() => {
    return birthdayEmployees.filter((emp) =>
      emp.birthdayThisYear.getMonth() === today.getMonth() &&
      emp.birthdayThisYear.getDate() === today.getDate()
    ).length;
  }, [birthdayEmployees, today]);

  const todayBirthdayEmployees = useMemo(() => {
    return birthdayEmployees
      .filter((emp) =>
        emp.birthdayThisYear.getMonth() === today.getMonth() &&
        emp.birthdayThisYear.getDate() === today.getDate()
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [birthdayEmployees, today]);

  const tomorrowCount = useMemo(() => {
    return birthdayEmployees.filter((emp) =>
      emp.birthdayThisYear.getMonth() === tomorrow.getMonth() &&
      emp.birthdayThisYear.getDate() === tomorrow.getDate()
    ).length;
  }, [birthdayEmployees, tomorrow]);

  const sections = useMemo(() => {
    const weekRange = getWeekRange(today);
    const todayList = filtered
      .filter((e) => e.section === 'today')
      .sort((a, b) => a.name.localeCompare(b.name));
    const upcomingList = filtered
      .filter((e) => e.section === 'upcoming')
      .sort((a, b) => a.daysFromToday - b.daysFromToday);
    const pastList = filtered
      .filter((e) => e.section === 'past')
      .sort((a, b) => b.birthdayThisYear.getTime() - a.birthdayThisYear.getTime());
    const thisWeekList = filtered
      .filter((e) => e.birthdayThisYear >= weekRange.start && e.birthdayThisYear <= weekRange.end)
      .sort((a, b) => {
        const dayA = a.birthdayThisYear.getDay();
        const dayB = b.birthdayThisYear.getDay();
        return WEEKDAY_ORDER.indexOf(dayA) - WEEKDAY_ORDER.indexOf(dayB);
      });
    return { todayList, upcomingList, pastList, thisWeekList };
  }, [filtered, today]);

  const calendarBirthdaysByDay = useMemo(() => {
    const month = calendarMonth.getMonth();
    const map = new Map<number, EmployeeBirthday[]>();
    birthdayEmployees.forEach((emp) => {
      const birthdayMonth = emp.birthdayThisYear.getMonth();
      const day = emp.birthdayThisYear.getDate();
      if (birthdayMonth !== month) return;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(emp);
    });
    map.forEach((list, day) => {
      map.set(day, list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return map;
  }, [birthdayEmployees, calendarMonth]);

  const calendarGrid = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const firstWeekdayMonBased = firstDay === 0 ? 6 : firstDay - 1; // Monday first
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: Array<{ day: number | null; dateValue: string | null }> = [];
    for (let i = 0; i < firstWeekdayMonBased; i += 1) {
      cells.push({ day: null, dateValue: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push({ day, dateValue: toDateInputValue(new Date(year, month, day)) });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dateValue: null });
    }
    return cells;
  }, [calendarMonth]);

  const calendarBirthdays = useMemo(() => {
    const selected = new Date(selectedCalendarDate);
    if (Number.isNaN(selected.getTime())) return [];

    const selectedMonthNumber = selected.getMonth();
    const selectedDay = selected.getDate();

    return birthdayEmployees
      .filter((emp) => {
        const birthdayMonth = emp.birthdayThisYear.getMonth();
        const birthdayDay = emp.birthdayThisYear.getDate();
        return birthdayMonth === selectedMonthNumber && birthdayDay === selectedDay;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [birthdayEmployees, selectedCalendarDate]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-none space-y-6">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
                <Cake className="h-3.5 w-3.5" />
                Employee Birthdays
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Birthday Calendar</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                View birthdays month-wise with clear past, today, and future buckets.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={fetchEmployees}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() => {
                  const now = new Date();
                  setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                  setSelectedCalendarDate(toDateInputValue(now));
                  setShowCalendarModal(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
              >
                <Calendar className="h-4 w-4" />
                Calendar
              </button>
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Today: <span className="font-semibold text-slate-700 dark:text-slate-200">{formatDate(today)}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
            Selected Range:{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {selectedRange === 'week'
                ? 'This Week'
                : selectedRange === 'today'
                  ? 'Today'
                  : selectedRange === 'tomorrow'
                    ? 'Tomorrow'
                    : monthOptions.find((m) => m.value === selectedMonth)?.label}
            </span>
          </div>
        </div>

        {showCalendarModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-5">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Birthday Calendar</h3>
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const prev = new Date(calendarMonth);
                      prev.setMonth(prev.getMonth() - 1);
                      setCalendarMonth(new Date(prev.getFullYear(), prev.getMonth(), 1));
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="min-w-[160px] text-center text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {getMonthLabel(calendarMonth)}
                  </p>
                  <button
                    onClick={() => {
                      const next = new Date(calendarMonth);
                      next.setMonth(next.getMonth() + 1);
                      setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1));
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Dates with birthdays are highlighted and show employee counts.
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((weekday) => (
                    <div key={weekday} className="px-2 py-2 text-center">{weekday}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calendarGrid.map((cell, index) => {
                    const list = cell.day ? (calendarBirthdaysByDay.get(cell.day) || []) : [];
                    const isSelected = Boolean(cell.dateValue && cell.dateValue === selectedCalendarDate);
                    return (
                      <button
                        key={`cell-${index}`}
                        type="button"
                        disabled={!cell.day}
                        onClick={() => {
                          if (cell.dateValue) setSelectedCalendarDate(cell.dateValue);
                        }}
                        className={`min-h-[88px] border-b border-r border-slate-100 px-2 py-2 text-left transition-colors dark:border-slate-800 ${
                          cell.day
                            ? 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                            : 'bg-slate-50/60 dark:bg-slate-800/30'
                        } ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                      >
                        {cell.day && (
                          <>
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{cell.day}</p>
                            {list.length > 0 && (
                              <div className="mt-1">
                                <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                                  {list.length} birthday{list.length > 1 ? 's' : ''}
                                </span>
                                <p className="mt-1 line-clamp-2 text-[10px] text-slate-600 dark:text-slate-300">
                                  {list.map((e) => e.name).join(', ')}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Birthdays on {formatDate(new Date(selectedCalendarDate))}
                </p>
                {calendarBirthdays.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No birthdays found on this date.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    {calendarBirthdays.map((emp) => (
                      <div key={`calendar-${emp.id}`} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{emp.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{emp.empNo}</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                          {emp.divisionName} - {emp.departmentName}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total Birthdays (Month)</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{filtered.length}</p>
          </div>
          <div className="rounded-2xl border border-violet-200/80 bg-violet-50/60 p-4 shadow-sm dark:border-violet-900 dark:bg-violet-950/20">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              <CalendarClock className="h-3.5 w-3.5" /> This Week
            </p>
            <p className="mt-2 text-2xl font-bold text-violet-800 dark:text-violet-300">{sections.thisWeekList.length}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
              <Cake className="h-3.5 w-3.5" /> Today
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-800 dark:text-emerald-300">{todayCount}</p>
          </div>
          <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/60 p-4 shadow-sm dark:border-cyan-900 dark:bg-cyan-950/20">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">
              <Calendar className="h-3.5 w-3.5" /> Tomorrow
            </p>
            <p className="mt-2 text-2xl font-bold text-cyan-800 dark:text-cyan-300">{tomorrowCount}</p>
          </div>
          <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/60 p-4 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/20">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
              <CalendarClock className="h-3.5 w-3.5" /> Future
            </p>
            <p className="mt-2 text-2xl font-bold text-indigo-800 dark:text-indigo-300">{sections.upcomingList.length}</p>
          </div>
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
            <p className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <Clock3 className="h-3.5 w-3.5" /> Past
            </p>
            <p className="mt-2 text-2xl font-bold text-amber-800 dark:text-amber-300">{sections.pastList.length}</p>
          </div>
        </div>

        <TodayBirthdayTicker
          items={todayBirthdayEmployees.map((emp) => ({
            id: emp.id,
            name: emp.name,
            designationName: emp.designationName,
          }))}
        />

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
            <div className="relative lg:col-span-4">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or employee no"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            <div className="relative lg:col-span-2">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={selectedRange}
                onChange={(e) => setSelectedRange(e.target.value as 'month' | 'week' | 'today' | 'tomorrow')}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="month">This Month</option>
                <option value="week">This Week</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
              </select>
            </div>
            <div className="relative lg:col-span-2">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={selectedRange !== 'month'}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/60 dark:disabled:text-slate-500"
              >
                {monthOptions.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative lg:col-span-2">
              <Building2 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">All divisions</option>
                {divisions.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative lg:col-span-2">
              <Building className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="all">All departments</option>
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            Loading birthday data...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <BirthdayList
              title="Past Birthdays"
              employees={sections.pastList}
              badgeClass="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
              icon={Clock3}
              emptyText="No past birthdays."
            />
            <BirthdayList
              title="Today Birthdays"
              employees={sections.todayList}
              badgeClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              icon={Cake}
              emptyText="No birthdays today."
            />
            <BirthdayList
              title="Future Birthdays"
              employees={sections.upcomingList}
              badgeClass="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
              icon={CalendarClock}
              emptyText="No future birthdays."
            />
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
            <Users className="mx-auto h-6 w-6 text-slate-400" />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No employees found for selected filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
