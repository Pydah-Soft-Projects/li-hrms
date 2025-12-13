'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';

type Shift = { _id: string; name: string; code?: string };
type Employee = { _id: string; employee_name?: string; emp_no: string; department?: { name: string; _id: string } };
type RosterCell = { shiftId?: string | null; status?: 'WO' };
type RosterState = Map<string, Record<string, RosterCell>>;

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type DepartmentOption = { _id: string; name: string };

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthDays(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
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

function RosterPage() {
  const [month, setMonth] = useState(formatMonthInput(new Date()));
  const [strict, setStrict] = useState(false);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedShiftForAssign, setSelectedShiftForAssign] = useState<string>('');
  const [roster, setRoster] = useState<RosterState>(new Map());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingProgress, setSavingProgress] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'roster' | 'assigned'>('roster');

  // Weekly off modal state
  const [showWeekOff, setShowWeekOff] = useState(false);
  const [weekOffDays, setWeekOffDays] = useState<Record<string, boolean>>(
    weekdays.reduce((acc, w) => ({ ...acc, [w]: false }), {})
  );

  const days = useMemo(() => getMonthDays(month), [month]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Initialize with empty arrays to prevent errors
      setShifts([]);
      setEmployees([]);
      setDepartments([]);
      setRoster(new Map());
      
      const [shiftRes, empRes, rosterRes] = await Promise.all([
        api.getShifts().catch((err) => {
          console.error('Failed to load shifts:', err);
          return { data: [] };
        }),
        api.getEmployees({ department_id: selectedDept || undefined }).catch((err) => {
          console.error('Failed to load employees:', err);
          return { data: [] };
        }),
        api.getRoster(month, { departmentId: selectedDept || undefined }).catch((err) => {
          console.error('Failed to load roster:', err);
          return { data: { entries: [], strict: false } };
        }),
      ]);

      // Ensure arrays
      const shiftList = Array.isArray(shiftRes?.data) ? shiftRes.data : (Array.isArray(shiftRes) ? shiftRes : []);
      setShifts(shiftList);
      
      const empList = Array.isArray(empRes?.data) ? empRes.data : (Array.isArray(empRes) ? empRes : []);
      setEmployees(empList);
      
      // Build department options (load all departments for filter dropdown)
      try {
        const allEmpsRes = await api.getEmployees();
        const allEmps = Array.isArray(allEmpsRes?.data) ? allEmpsRes.data : (Array.isArray(allEmpsRes) ? allEmpsRes : []);
        const deptMap = new Map<string, string>();
        allEmps.forEach((e: any) => {
          if (e.department?._id) {
            deptMap.set(e.department._id, e.department.name || e.department._id);
          }
        });
        const deptOpts = Array.from(deptMap.entries()).map(([id, name]) => ({ _id: id, name }));
        setDepartments(deptOpts);
      } catch (deptErr) {
        console.error('Failed to load departments:', deptErr);
        setDepartments([]);
      }

      const map: RosterState = new Map();
      const entries = Array.isArray(rosterRes?.data?.entries) ? rosterRes.data.entries : [];
      setStrict(Boolean(rosterRes?.data?.strict));

      entries.forEach((e: any) => {
        const emp = e.employeeNumber;
        if (!emp) return;
        if (!map.has(emp)) map.set(emp, {});
        const row = map.get(emp)!;
        // Backend now explicitly returns status: 'WO' for week offs
        // Also handle legacy data where shiftId is null (fallback)
        const isWeekOff = e.status === 'WO' || (!e.shiftId && !e.shift);
        row[e.date] = { 
          shiftId: e.shiftId || null, 
          status: isWeekOff ? 'WO' : undefined
        };
      });

      setRoster(map);
    } catch (err: any) {
      console.error('Error loading roster data:', err);
      toast.error(err.message || 'Failed to load roster');
      // Ensure arrays are set even on error
      setShifts([]);
      setEmployees([]);
      setDepartments([]);
      setRoster(new Map());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [month, selectedDept]);

  const updateCell = (empNo: string, date: string, value: RosterCell) => {
    setRoster((prev) => {
      const map = new Map(prev);
      const row = { ...(map.get(empNo) || {}) };
      row[date] = value;
      map.set(empNo, row);
      return map;
    });
  };

  const applyAllEmployees = (shiftId: string | null, status?: 'WO') => {
    if (!Array.isArray(employees) || employees.length === 0) {
      toast.error('No employees available');
      return;
    }
    setRoster((prev) => {
      const map = new Map(prev);
      employees.forEach((emp) => {
        const row: Record<string, RosterCell> = { ...(map.get(emp.emp_no) || {}) };
        days.forEach((d) => {
          row[d] = { shiftId, status };
        });
        map.set(emp.emp_no, row);
      });
      return map;
    });
  };

  const applyEmployeeAllDays = (empNo: string, shiftId: string | null, status?: 'WO') => {
    setRoster((prev) => {
      const map = new Map(prev);
      const row: Record<string, RosterCell> = { ...(map.get(empNo) || {}) };
      days.forEach((d) => {
        row[d] = { shiftId, status };
      });
      map.set(empNo, row);
      return map;
    });
  };

  const saveRoster = async () => {
    try {
      setSaving(true);
      setSavingProgress(10);
      const entries: any[] = [];
      roster.forEach((row, empNo) => {
        Object.entries(row).forEach(([date, cell]) => {
          // Skip empty cells
          if (!cell) return;
          
          // Skip if neither shiftId nor status is set
          if (!cell.shiftId && cell.status !== 'WO') return;
          
          const entry: any = {
            employeeNumber: empNo,
            date,
          };
          
          // Handle week off
          if (cell.status === 'WO') {
            entry.shiftId = null;
            entry.status = 'WO';
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
    } catch (err: any) {
      console.error('Save roster exception:', err);
      toast.error(err.message || err.response?.data?.message || 'Failed to save roster');
    } finally {
      setSaving(false);
      setSavingProgress(null);
    }
  };

  const applyWeekOffs = () => {
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
  };

  const handleAssignAll = () => {
    if (!selectedShiftForAssign) {
      toast.error('Please select a shift first');
      return;
    }
    applyAllEmployees(selectedShiftForAssign);
    toast.success(`Assigned ${shiftLabel(shifts.find((s) => s._id === selectedShiftForAssign))} to all employees`);
  };

  // Calculate assigned shifts summary
  const assignedShiftsSummary = useMemo(() => {
    const summary: Array<{
      employee: Employee;
      shifts: Array<{ shiftId: string | null; shiftLabel: string; days: number; dates: string[] }>;
      totalDays: number;
      weekOffs: number;
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
        const shiftId = isWeekOff ? 'WO' : (cell?.shiftId || null);
        const label = isWeekOff ? 'Week Off' : (shiftId ? shiftLabel(shifts.find((s) => s._id === shiftId)) : 'Unassigned');
        
        // Use a consistent key for week offs
        const mapKey = isWeekOff ? 'WO' : shiftId;
        
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
          // Sort to show week offs first, then other shifts
          .sort((a, b) => {
            if (a.shiftId === 'WO') return -1;
            if (b.shiftId === 'WO') return 1;
            return 0;
          });

        const totalDays = shiftsList.reduce((sum, s) => sum + s.days, 0);
        const weekOffs = shiftsList.find((s) => s.shiftId === 'WO')?.days || 0;
        summary.push({ employee: emp, shifts: shiftsList, totalDays, weekOffs });
      }
    });

    return summary.sort((a, b) => (a.employee.employee_name || a.employee.emp_no).localeCompare(b.employee.employee_name || b.employee.emp_no));
  }, [employees, roster, shifts]);

  if (loading) {
    return <div className="p-6 text-slate-600 dark:text-slate-300">Loading roster...</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Shift Roster</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Assign shifts for the selected month</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Department:</label>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white min-w-[180px]"
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Month:</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={strict}
                onChange={(e) => setStrict(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Strict
            </label>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Shift:</label>
              <select
                value={selectedShiftForAssign}
                onChange={(e) => setSelectedShiftForAssign(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white min-w-[150px]"
              >
                <option value="">Select shift</option>
                {shifts.map((s) => (
                  <option key={s._id} value={s._id}>
                    {shiftLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAssignAll}
              disabled={!selectedShiftForAssign}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Assign All
            </button>
            <button
              onClick={() => setShowWeekOff(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Assign Weekly Offs
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('roster')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'roster'
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Roster View
          </button>
          <button
            onClick={() => setActiveTab('assigned')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'assigned'
                ? 'text-blue-600 border-b-2 border-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Assigned Shifts
          </button>
        </div>
      </div>

      {/* Roster View */}
      {activeTab === 'roster' && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left w-48 sticky left-0 bg-slate-50 dark:bg-slate-800">Employee</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2 text-center w-16 text-xs text-slate-500 dark:text-slate-400">
                  {new Date(d).getDate()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => {
              const row = roster.get(emp.emp_no) || {};
              return (
                <tr key={emp._id} className="border-t border-slate-100 dark:border-slate-700">
                  <td className="px-3 py-2 sticky left-0 bg-white dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">{emp.employee_name || emp.emp_no}</div>
                        <div className="text-xs text-slate-500">{emp.emp_no}</div>
                      </div>
                      <select
                        className="text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                        onChange={(e) => applyEmployeeAllDays(emp.emp_no, e.target.value || null, e.target.value === 'WO' ? 'WO' : undefined)}
                        defaultValue=""
                      >
                        <option value="">All days</option>
                        <option value="WO">Week Off</option>
                        {shifts.map((s) => (
                          <option key={s._id} value={s._id}>
                            {shiftLabel(s)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  {days.map((d) => {
                    const cell = row[d];
                    const current = cell?.status === 'WO' ? 'WO' : cell?.shiftId || '';
                    return (
                      <td key={d} className="px-1 py-1 text-center">
                        <select
                          value={current}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'WO') {
                              updateCell(emp.emp_no, d, { shiftId: null, status: 'WO' });
                            } else {
                              updateCell(emp.emp_no, d, { shiftId: val || null, status: undefined });
                            }
                          }}
                          className="w-full text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-1 py-1"
                        >
                          <option value="">-</option>
                          <option value="WO">WO</option>
                          {shifts.map((s) => (
                            <option key={s._id} value={s._id}>
                              {shiftLabel(s)}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Assigned Shifts View */}
      {activeTab === 'assigned' && (
        <div className="space-y-4">
          {assignedShiftsSummary.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p className="text-lg font-medium mb-2">No shifts assigned</p>
              <p className="text-sm">Switch to Roster View to assign shifts to employees</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {assignedShiftsSummary.map((item) => (
                <div
                  key={item.employee._id}
                  className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-800 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-lg">
                        {item.employee.employee_name || item.employee.emp_no}
                      </h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{item.employee.emp_no}</p>
                      {item.employee.department && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{item.employee.department.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Week Offs</div>
                        <div className={`text-lg font-bold ${item.weekOffs > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 dark:text-slate-500'}`}>
                          {item.weekOffs}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Days</div>
                        <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{item.totalDays}</div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {item.shifts.map((shift, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          shift.shiftId === 'WO'
                            ? 'bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800'
                            : 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`font-semibold text-sm ${
                            shift.shiftId === 'WO'
                              ? 'text-orange-700 dark:text-orange-300'
                              : 'text-blue-700 dark:text-blue-300'
                          }`}>
                            {shift.shiftLabel}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            shift.shiftId === 'WO'
                              ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                              : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                          }`}>
                            {shift.days} {shift.days === 1 ? 'day' : 'days'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          <div className="font-medium">Dates:</div>
                          <div className="flex flex-wrap gap-1">
                            {shift.dates.slice(0, 5).map((d) => (
                              <span key={d} className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-xs">
                                {new Date(d).getDate()}
                              </span>
                            ))}
                            {shift.dates.length > 5 && (
                              <span className="px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded text-xs">
                                +{shift.dates.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Employees: {employees.length} | Days: {days.length}
        </div>
        <button
          onClick={saveRoster}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save roster'}
        </button>
      </div>
      {saving && (
        <div className="h-1 w-full rounded bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${savingProgress ?? 50}%` }}
          />
        </div>
      )}

      {showWeekOff && (
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
      )}
    </div>
  );
}

export default RosterPage;

