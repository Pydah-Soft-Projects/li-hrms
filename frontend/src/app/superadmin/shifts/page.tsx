'use client';

import { useState, useEffect } from 'react';
import { api, Shift, Division, Department, Designation } from '@/lib/api';
import Spinner from '@/components/Spinner';
import { LayoutGrid, Table2 } from 'lucide-react';

const SHIFT_COLORS = [
  '#3b82f6', // blue-500
  '#ef4444', // red-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f43f5e', // rose-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
];

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scopedDivisions, setScopedDivisions] = useState<Division[]>([]);
  const [scopedDepartments, setScopedDepartments] = useState<Department[]>([]);
  const [scopedDesignations, setScopedDesignations] = useState<Designation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [allowedDurations, setAllowedDurations] = useState<number[]>([]);

  // Form state
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [duration, setDuration] = useState<number | ''>('');
  const [gracePeriod, setGracePeriod] = useState<number>(15);
  const [payableShifts, setPayableShifts] = useState<number>(1);
  const [firstHalfStartTime, setFirstHalfStartTime] = useState('');
  const [firstHalfEndTime, setFirstHalfEndTime] = useState('');
  const [firstHalfDuration, setFirstHalfDuration] = useState<number | ''>('');
  const [firstHalfMinDuration, setFirstHalfMinDuration] = useState<number | ''>('');
  const [firstHalfGracePeriod, setFirstHalfGracePeriod] = useState<number>(15);
  const [firstHalfPayableShifts, setFirstHalfPayableShifts] = useState<number>(0);
  const [breakStartTime, setBreakStartTime] = useState('');
  const [breakEndTime, setBreakEndTime] = useState('');
  const [secondHalfStartTime, setSecondHalfStartTime] = useState('');
  const [secondHalfEndTime, setSecondHalfEndTime] = useState('');
  const [secondHalfDuration, setSecondHalfDuration] = useState<number | ''>('');
  const [secondHalfMinDuration, setSecondHalfMinDuration] = useState<number | ''>('');
  const [secondHalfGracePeriod, setSecondHalfGracePeriod] = useState<number>(15);
  const [secondHalfPayableShifts, setSecondHalfPayableShifts] = useState<number>(0);
  const [suggestedPayableShifts, setSuggestedPayableShifts] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [illegalTimingWarning, setIllegalTimingWarning] = useState('');
  const [continuityError, setContinuityError] = useState('');

  const [lastChanged, setLastChanged] = useState<'start' | 'end' | 'duration' | null>(null);
  const [color, setColor] = useState('#3b82f6');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [shiftDisplayScope, setShiftDisplayScope] = useState<'all' | 'classified'>('all');

  useEffect(() => {
    loadShifts();
    loadAllowedDurations();
    loadScopedStructure();
  }, []);

  const loadShifts = async () => {
    try {
      setLoading(true);
      const response = await api.getShifts();
      if (response.success && response.data) {
        setShifts(response.data);
      }
    } catch (err) {
      console.error('Error loading shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadAllowedDurations = async () => {
    try {
      const response = await api.getAllowedDurations();
      console.log('Durations API response:', response);

      if (response.success) {
        // The API returns { success: true, data: [array of numbers], durations: [full objects] }
        // We need the array of numbers for the dropdown
        const durations = response.data || [];
        setAllowedDurations(Array.isArray(durations) ? durations : []);
        console.log('Loaded durations:', durations);
      } else {
        console.warn('Failed to load durations:', response.message);
        setAllowedDurations([]);
      }
    } catch (err) {
      console.error('Error loading durations:', err);
      setAllowedDurations([]);
    }
  };

  const loadScopedStructure = async () => {
    try {
      const response = await api.getScopedShiftData();
      if (response.success && response.data) {
        setScopedDivisions(response.data.divisions || []);
        setScopedDepartments(response.data.departments || []);
        setScopedDesignations(response.data.designations || []);
      } else {
        setScopedDivisions([]);
        setScopedDepartments([]);
        setScopedDesignations([]);
      }
    } catch (err) {
      console.error('Error loading classified shift structure:', err);
      setScopedDivisions([]);
      setScopedDepartments([]);
      setScopedDesignations([]);
    }
  };

  // Calculate duration from start and end time
  const calculateDuration = (start: string, end: string): number | null => {
    if (!start || !end) return null;

    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    let startMinutes = startHour * 60 + startMin;
    let endMinutes = endHour * 60 + endMin;

    // Handle overnight shifts
    if (endMinutes <= startMinutes) {
      endMinutes += 24 * 60;
    }

    const durationMinutes = endMinutes - startMinutes;
    const durationHours = Math.round((durationMinutes / 60) * 100) / 100;
    return durationHours;
  };

  // Calculate end time from start time and duration
  const calculateEndTime = (start: string, dur: number): string | null => {
    if (!start || !dur) return null;

    const [startHour, startMin] = start.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = startMinutes + dur * 60;
    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = endMinutes % 60;
    return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
  };

  // Check if duration is in allowed list
  const validateDuration = (dur: number | null): boolean => {
    if (dur === null) return true; // No validation if duration is not calculated yet
    // Check if duration matches any allowed duration (with small tolerance for floating point)
    return allowedDurations.some(allowed => Math.abs(allowed - dur) < 0.01);
  };

  // Handle start time change
  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    setLastChanged('start');
    setIllegalTimingWarning('');

    // If duration is set, recalculate end time
    if (duration && value) {
      const calculatedEnd = calculateEndTime(value, Number(duration));
      if (calculatedEnd) {
        setEndTime(calculatedEnd);
        setSecondHalfEndTime(calculatedEnd); // Sync with Second Half End
      }
    }
    // If end time is set, recalculate duration
    else if (endTime && value) {
      const calculatedDur = calculateDuration(value, endTime);
      if (calculatedDur !== null) {
        setDuration(calculatedDur);
        // Calculate suggested payable shifts
        const suggested = calculatedDur / 8;
        setSuggestedPayableShifts(Math.round(suggested * 100) / 100);

        if (!validateDuration(calculatedDur)) {
          setIllegalTimingWarning(`Illegal timings: Calculated duration (${calculatedDur} hours) is not in the allowed durations list.`);
        } else {
          setIllegalTimingWarning('');
        }
      }
    }

    // Always sync First Half Start with Shift Start
    if (value) {
      setFirstHalfStartTime(value);
      if (firstHalfEndTime) {
        setSegmentDuration(value, firstHalfEndTime, setFirstHalfDuration);
      }
    }
  };

  // Handle end time change
  const handleEndTimeChange = (value: string) => {
    setEndTime(value);
    setLastChanged('end');
    setIllegalTimingWarning('');

    // Calculate duration from start and end time
    if (startTime && value) {
      const calculatedDur = calculateDuration(startTime, value);
      if (calculatedDur !== null) {
        setDuration(calculatedDur);
        if (!validateDuration(calculatedDur)) {
          setIllegalTimingWarning(`Illegal timings: Calculated duration (${calculatedDur} hours) is not in the allowed durations list.`);
        } else {
          setIllegalTimingWarning('');
        }
      }
    }

    // Always sync Second Half End with Shift End
    if (value) {
      setSecondHalfEndTime(value);
      if (secondHalfStartTime) {
        setSegmentDuration(secondHalfStartTime, value, setSecondHalfDuration);
      }
    }
  };

  // Handle duration change
  const handleDurationChange = (value: number | '') => {
    setDuration(value);
    setLastChanged('duration');
    setIllegalTimingWarning('');

    // Calculate end time from start time and duration
    if (startTime && value) {
      const calculatedEnd = calculateEndTime(startTime, Number(value));
      if (calculatedEnd) {
        setEndTime(calculatedEnd);
        setSecondHalfEndTime(calculatedEnd); // Sync with Second Half End
      }
    }

    // Calculate suggested payable shifts (duration / 8)
    if (value) {
      const suggested = Number(value) / 8;
      setSuggestedPayableShifts(Math.round(suggested * 100) / 100); // Round to 2 decimal places
    } else {
      setSuggestedPayableShifts(null);
    }
  };

  const setSegmentDuration = (
    start: string,
    end: string,
    setDurationFn: React.Dispatch<React.SetStateAction<number | ''>>
  ) => {
    if (start && end) {
      const calculated = calculateDuration(start, end);
      if (calculated !== null) {
        setDurationFn(calculated);
      }
    }
  };

  const handleFirstHalfStartChange = (value: string) => {
    setFirstHalfStartTime(value);
    setSegmentDuration(value, firstHalfEndTime, setFirstHalfDuration);
  };

  const handleFirstHalfEndChange = (value: string) => {
    setFirstHalfEndTime(value);
    setBreakStartTime(value); // Continuity: Break starts at First Half End
    setSegmentDuration(firstHalfStartTime, value, setFirstHalfDuration);
  };

  const handleBreakStartTimeChange = (value: string) => {
    setBreakStartTime(value);
    setFirstHalfEndTime(value); // Continuity: First Half ends at Break Start
    setSegmentDuration(firstHalfStartTime, value, setFirstHalfDuration);
  };

  const handleBreakEndTimeChange = (value: string) => {
    setBreakEndTime(value);
    setSecondHalfStartTime(value); // Continuity: Second Half starts at Break End
    setSegmentDuration(value, secondHalfEndTime, setSecondHalfDuration);
  };

  const handleSecondHalfStartChange = (value: string) => {
    setSecondHalfStartTime(value);
    setBreakEndTime(value); // Continuity: Break ends at Second Half Start
    setSegmentDuration(value, secondHalfEndTime, setSecondHalfDuration);
  };

  const handleSecondHalfEndChange = (value: string) => {
    setSecondHalfEndTime(value);
    setSegmentDuration(secondHalfStartTime, value, setSecondHalfDuration);
  };

  // Continuity validation effect
  useEffect(() => {
    if (!showForm) {
      setContinuityError('');
      return;
    }

    const errors: string[] = [];
    if (startTime && firstHalfStartTime && startTime !== firstHalfStartTime) {
      errors.push('First Half must start at Shift Start time.');
    }
    if (firstHalfEndTime && breakStartTime && firstHalfEndTime !== breakStartTime) {
      errors.push('Break must start exactly when First Half ends.');
    }
    if (breakEndTime && secondHalfStartTime && breakEndTime !== secondHalfStartTime) {
      errors.push('Second Half must start exactly when Break ends.');
    }
    if (secondHalfEndTime && endTime && secondHalfEndTime !== endTime) {
      errors.push('Second Half must end at Shift End time.');
    }

    // Payable shifts validation
    const totalPayable = Number(payableShifts) || 0;
    const segmentsSum = (Number(firstHalfPayableShifts) || 0) + (Number(secondHalfPayableShifts) || 0);
    if (Math.abs(totalPayable - segmentsSum) > 0.001) {
      errors.push(`Total payable (${totalPayable}) does not match sum of halves (${segmentsSum}).`);
    }

    setContinuityError(errors.join(' '));
  }, [
    showForm,
    startTime, endTime, payableShifts,
    firstHalfStartTime, firstHalfEndTime, firstHalfPayableShifts,
    breakStartTime, breakEndTime,
    secondHalfStartTime, secondHalfEndTime, secondHalfPayableShifts
  ]);

  // Auto-calculate payable shifts for halves
  useEffect(() => {
    if (!showForm || !payableShifts) return;
    
    const total = Number(payableShifts);
    const first = Number(firstHalfPayableShifts);
    const second = Number(secondHalfPayableShifts);

    // If total or first changes, we suggest/set second
    const targetSecond = Math.max(0, total - first);
    if (Math.abs(second - targetSecond) > 0.001) {
      setSecondHalfPayableShifts(Math.round(targetSecond * 100) / 100);
    }
  }, [payableShifts, firstHalfPayableShifts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Final validation
    if (!startTime || !endTime || !duration) {
      setError('Start time, end time, and duration are required');
      return;
    }

    // Calculate final duration to validate
    const finalDuration = calculateDuration(startTime, endTime);
    if (finalDuration !== null && !validateDuration(finalDuration)) {
      // Just set a warning but allow proceeding
      setIllegalTimingWarning(`Note: The duration (${finalDuration} hours) is not in the standard allowed durations list.`);
    }

    try {
      const firstHalfData = firstHalfStartTime || firstHalfEndTime || firstHalfDuration !== '' || firstHalfMinDuration !== '' || firstHalfPayableShifts !== 0 || firstHalfGracePeriod !== 15
        ? {
            startTime: firstHalfStartTime || null,
            endTime: firstHalfEndTime || null,
            duration: firstHalfDuration !== '' ? Number(firstHalfDuration) : undefined,
            minDuration: firstHalfMinDuration !== '' ? Number(firstHalfMinDuration) : undefined,
            gracePeriod: Number(firstHalfGracePeriod),
            payableShifts: Number(firstHalfPayableShifts),
          }
        : undefined;

      const breakData = breakStartTime || breakEndTime
        ? {
            startTime: breakStartTime || null,
            endTime: breakEndTime || null,
          }
        : undefined;

      const secondHalfData = secondHalfStartTime || secondHalfEndTime || secondHalfDuration !== '' || secondHalfMinDuration !== '' || secondHalfPayableShifts !== 0 || secondHalfGracePeriod !== 15
        ? {
            startTime: secondHalfStartTime || null,
            endTime: secondHalfEndTime || null,
            duration: secondHalfDuration !== '' ? Number(secondHalfDuration) : undefined,
            minDuration: secondHalfMinDuration !== '' ? Number(secondHalfMinDuration) : undefined,
            gracePeriod: Number(secondHalfGracePeriod),
            payableShifts: Number(secondHalfPayableShifts),
          }
        : undefined;

      const data: any = {
        name,
        startTime,
        endTime,
        duration: Number(duration),
        gracePeriod: Number(gracePeriod),
        payableShifts: payableShifts || 1,
        color,
        firstHalf: firstHalfData,
        break: breakData,
        secondHalf: secondHalfData,
      };

      let response;
      if (editingShift) {
        response = await api.updateShift(editingShift._id, data);
      } else {
        response = await api.createShift(data);
      }

      if (response.success) {
        setShowForm(false);
        setEditingShift(null);
        resetForm();
        loadShifts();
      } else {
        setError(response.message || 'Failed to save shift');
      }
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleEdit = (shift: Shift) => {
    setEditingShift(shift);
    setName(shift.name);
    setStartTime(shift.startTime);
    setEndTime(shift.endTime);
    setDuration(shift.duration);
    setGracePeriod(shift.gracePeriod ?? 15);
    setPayableShifts(shift.payableShifts || 1);
    setFirstHalfStartTime(shift.firstHalf?.startTime || '');
    setFirstHalfEndTime(shift.firstHalf?.endTime || '');
    setFirstHalfDuration(shift.firstHalf?.duration ?? '');
    setFirstHalfMinDuration(shift.firstHalf?.minDuration ?? '');
    setFirstHalfGracePeriod(shift.firstHalf?.gracePeriod ?? 15);
    setFirstHalfPayableShifts(shift.firstHalf?.payableShifts ?? 0);
    setBreakStartTime(shift.break?.startTime || '');
    setBreakEndTime(shift.break?.endTime || '');
    setSecondHalfStartTime(shift.secondHalf?.startTime || '');
    setSecondHalfEndTime(shift.secondHalf?.endTime || '');
    setSecondHalfDuration(shift.secondHalf?.duration ?? '');
    setSecondHalfMinDuration(shift.secondHalf?.minDuration ?? '');
    setSecondHalfGracePeriod(shift.secondHalf?.gracePeriod ?? 15);
    setSecondHalfPayableShifts(shift.secondHalf?.payableShifts ?? 0);
    // Calculate suggested payable shifts for editing
    if (shift.duration) {
      const suggested = shift.duration / 8;
      setSuggestedPayableShifts(Math.round(suggested * 100) / 100);
    } else {
      setSuggestedPayableShifts(null);

    }
    setColor(shift.color || '#3b82f6');
    setLastChanged(null);
    setIllegalTimingWarning('');
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this shift?')) return;

    try {
      const response = await api.deleteShift(id);
      if (response.success) {
        loadShifts();
      } else {
        alert(response.message || 'Failed to delete shift');
      }
    } catch (err) {
      console.error('Error deleting shift:', err);
    }
  };

  const resetForm = () => {
    setName('');
    setStartTime('');
    setEndTime('');
    setDuration('');
    setGracePeriod(15);
    setPayableShifts(1);
    setFirstHalfStartTime('');
    setFirstHalfEndTime('');
    setFirstHalfDuration('');
    setFirstHalfMinDuration('');
    setFirstHalfGracePeriod(15);
    setFirstHalfPayableShifts(0);
    setBreakStartTime('');
    setBreakEndTime('');
    setSecondHalfStartTime('');
    setSecondHalfEndTime('');
    setSecondHalfDuration('');
    setSecondHalfMinDuration('');
    setSecondHalfGracePeriod(15);
    setSecondHalfPayableShifts(0);
    setSuggestedPayableShifts(null);
    setError('');
    setIllegalTimingWarning('');
    setContinuityError('');

    setColor('#3b82f6'); // Reset to default blue
    setLastChanged(null);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingShift(null);
    resetForm();
  };

  const resolveShiftReference = (shiftRef: any): Shift | null => {
    let value = shiftRef;
    if (value && typeof value === 'object' && 'shiftId' in value) {
      value = value.shiftId;
    }
    const shiftId = typeof value === 'string' ? value : value?._id;
    if (!shiftId) return null;
    if (typeof value === 'string') {
      return shifts.find((allShift) => allShift._id === shiftId) || null;
    }
    return value as Shift;
  };

  const dedupeShifts = (list: Shift[]) =>
    Array.from(new Map(list.map((shift) => [shift._id, shift])).values());

  const renderShiftCard = (shift: Shift) => (
    <div
      key={shift._id}
      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white/80 p-4 shadow-lg transition-all hover:border-blue-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900/80"
    >
      <div className="absolute top-0 left-0 h-1 w-full" style={{ backgroundColor: shift.color || '#3b82f6' }} />

      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{shift.name}</h3>
          <div className="mt-1.5 space-y-1 text-xs">
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate">{shift.startTime} - {shift.endTime}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{shift.duration} hours</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">{shift.payableShifts || 1} payable shift{(shift.payableShifts || 1) !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
        <span
          className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${shift.isActive
            ? 'bg-green-100 text-green-700 shadow-sm dark:bg-green-900/30 dark:text-green-400'
            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
        >
          {shift.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      
      {/* Shift Segments */}
      <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-orange-50/50 p-2 dark:bg-orange-900/10">
            <p className="text-[9px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">1st Half</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
              {shift.firstHalf?.startTime || '--'} - {shift.firstHalf?.endTime || '--'}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/50 p-2 dark:bg-slate-800/50">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Break</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
              {shift.break?.startTime || '--'} - {shift.break?.endTime || '--'}
            </p>
          </div>
          <div className="rounded-lg bg-purple-50/50 p-2 dark:bg-purple-900/10">
            <p className="text-[9px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">2nd Half</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300">
              {shift.secondHalf?.startTime || '--'} - {shift.secondHalf?.endTime || '--'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
        <button
          onClick={() => handleEdit(shift)}
          style={{ backgroundColor: shift.color || '#3b82f6' }}
          className="flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-all hover:opacity-90"
        >
          Edit
        </button>
        <button
          onClick={() => handleDelete(shift._id)}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-all hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-900/20"
        >
          Delete
        </button>
      </div>
    </div>
  );

  const renderShiftsDisplay = (shiftList: Shift[]) => {
    const list = dedupeShifts(shiftList);
    if (list.length === 0) return null;

    if (viewMode === 'table') {
      return (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/90 shadow-xl backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/90">
          <table className="min-w-[1000px] w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-700 dark:bg-slate-800/80">
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Color</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Time</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">1st Half</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Break</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">2nd Half</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Duration</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Payable</th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200" scope="col">Status</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200" scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((shift) => (
                <tr
                  key={shift._id}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50/80 dark:border-slate-800 dark:hover:bg-slate-800/40"
                >
                  <td className="px-4 py-3 align-middle">
                    <div
                      className="h-3 w-14 rounded-full border border-slate-200/80 dark:border-slate-600"
                      style={{ backgroundColor: shift.color || '#3b82f6' }}
                      title={shift.color || '#3b82f6'}
                    />
                  </td>
                  <td className="px-4 py-3 align-middle font-medium text-slate-900 dark:text-slate-100">
                    <span className="line-clamp-2">{shift.name}</span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400">
                    {shift.startTime} – {shift.endTime}
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className="inline-flex rounded-md bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      {shift.firstHalf?.startTime || '--'} - {shift.firstHalf?.endTime || '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                      {shift.break?.startTime || '--'} - {shift.break?.endTime || '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className="inline-flex rounded-md bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      {shift.secondHalf?.startTime || '--'} - {shift.secondHalf?.endTime || '--'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium">
                    {shift.duration} h
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-slate-600 dark:text-slate-400 font-medium">
                    {shift.payableShifts ?? 1}
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${shift.isActive
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                    >
                      {shift.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(shift)}
                        style={{ backgroundColor: shift.color || '#3b82f6' }}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity hover:opacity-90 touch-manipulation min-h-[36px]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(shift._id)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-900/20 touch-manipulation min-h-[36px]"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((shift) => renderShiftCard(shift))}
      </div>
    );
  };

  const hasClassifiedData =
    scopedDivisions.length > 0 ||
    scopedDepartments.length > 0 ||
    scopedDesignations.length > 0;

  const getClassifiedAssignedShiftIds = () => {
    const assignedIds = new Set<string>();

    const collectShiftRef = (shiftRef: any) => {
      const resolved = resolveShiftReference(shiftRef);
      if (resolved?._id) assignedIds.add(resolved._id);
    };

    scopedDivisions.forEach((division) => {
      (division.shifts || []).forEach(collectShiftRef);
    });

    scopedDepartments.forEach((department) => {
      (department.shifts || []).forEach(collectShiftRef);
      (department.divisionDefaults || []).forEach((entry) => {
        (entry.shifts || []).forEach(collectShiftRef);
      });
    });

    scopedDesignations.forEach((designation) => {
      (designation.shifts || []).forEach(collectShiftRef);
      (designation.divisionDefaults || []).forEach((entry) => {
        (entry.shifts || []).forEach(collectShiftRef);
      });
      (designation.departmentShifts || []).forEach((entry) => {
        (entry.shifts || []).forEach(collectShiftRef);
      });
    });

    return assignedIds;
  };

  return (
    <div className="relative min-h-screen">
      <div className="relative z-10 mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Shift Management</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Create and manage work shifts</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3">
            {!loading && (shifts.length > 0 || hasClassifiedData) && (
              <>
                <div
                  className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  role="group"
                  aria-label="Shift classification mode"
                >
                  <button
                    type="button"
                    onClick={() => setShiftDisplayScope('all')}
                    aria-pressed={shiftDisplayScope === 'all'}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors touch-manipulation min-h-[40px] sm:min-h-0 ${shiftDisplayScope === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                  >
                    All Shifts
                  </button>
                  <button
                    type="button"
                    onClick={() => setShiftDisplayScope('classified')}
                    aria-pressed={shiftDisplayScope === 'classified'}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors touch-manipulation min-h-[40px] sm:min-h-0 ${shiftDisplayScope === 'classified'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                  >
                    Division Classified
                  </button>
                </div>
                <div
                  className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  role="group"
                  aria-label="Shifts display mode"
                >
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    aria-pressed={viewMode === 'grid'}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors touch-manipulation min-h-[40px] sm:min-h-0 ${viewMode === 'grid'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                  >
                    <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    aria-pressed={viewMode === 'table'}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors touch-manipulation min-h-[40px] sm:min-h-0 ${viewMode === 'table'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
                      }`}
                  >
                    <Table2 className="h-4 w-4 shrink-0" aria-hidden />
                    Table
                  </button>
                </div>
              </>
            )}
            <button
              onClick={() => {
                resetForm();
                setShowForm(true);
              }}
              className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 touch-manipulation min-h-[44px] sm:min-h-0"
            >
              <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Shift
            </button>
          </div>
        </div>

        {/* Create/Edit Shift Dialog */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="w-full max-w-5xl rounded-2xl border border-slate-200 bg-white my-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
              <div className="sticky top-0 mb-5 flex items-center justify-between border-b border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 rounded-t-2xl">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingShift ? 'Edit Shift' : 'Create New Shift'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                    {editingShift ? 'Update shift information' : 'Add a new shift to the system'}
                  </p>
                </div>
                <button
                  onClick={handleCancel}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="overflow-y-auto px-6 pb-6" style={{ maxHeight: 'calc(100vh - 10rem)' }}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-4">
                  {/* COLUMN 1: Shift Configuration */}
                  <div className="space-y-6">
                    {/* Shift Identity */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-blue-500" />
                        Shift Identity
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Shift Name *
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="e.g., Morning Shift"
                          />
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Shift Color
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {SHIFT_COLORS.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setColor(c)}
                                className={`h-8 w-8 rounded-full border-2 transition-all ${color === c
                                  ? 'border-slate-600 dark:border-white scale-110 shadow-md ring-2 ring-offset-2 ring-blue-500/50 dark:ring-offset-slate-900'
                                  : 'border-transparent hover:scale-105 hover:shadow-sm'
                                  }`}
                                style={{ backgroundColor: c }}
                                title={c}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Work Schedule */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-indigo-500" />
                        Work Schedule
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Start Time *
                          </label>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => handleStartTimeChange(e.target.value)}
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            End Time *
                          </label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => handleEndTimeChange(e.target.value)}
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                          Duration (hours) *
                        </label>
                        <select
                          value={duration}
                          onChange={(e) => handleDurationChange(e.target.value ? Number(e.target.value) : '')}
                          required
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        >
                          <option value="">Select duration</option>
                          {allowedDurations.map((dur) => (
                            <option key={dur} value={dur}>
                              {dur} hours
                            </option>
                          ))}
                          {duration && !allowedDurations.some(d => Math.abs(d - Number(duration)) < 0.01) && (
                            <option key="custom" value={duration}>
                              {duration} hours (Custom)
                            </option>
                          )}
                        </select>
                        {allowedDurations.length === 0 && (
                          <p className="mt-1.5 text-xs text-orange-600 dark:text-orange-400">
                            No durations configured. Please configure in Settings.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Payroll & Grace Rules */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-emerald-500" />
                        Payroll & Grace Rules
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Payable Shifts *
                          </label>
                          {suggestedPayableShifts !== null && suggestedPayableShifts !== payableShifts && (
                            <p className="mb-1 text-[10px] text-blue-600 dark:text-blue-400">
                              Suggested: {suggestedPayableShifts}
                            </p>
                          )}
                          <input
                            type="number"
                            value={payableShifts}
                            onChange={(e) => setPayableShifts(Number(e.target.value) || 1)}
                            min="0"
                            step="0.01"
                            required
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="1"
                          />
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            Number of standard shifts (8 hours) this shift counts as
                          </p>
                        </div>

                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                            Shift Grace Period (minutes)
                          </label>
                          <input
                            type="number"
                            value={gracePeriod}
                            onChange={(e) => setGracePeriod(Number(e.target.value) || 0)}
                            min="0"
                            step="1"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="15"
                          />
                          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                            Grace period applied to the whole shift.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* COLUMN 2: Shift Segments */}
                  <div className="space-y-6">
                    {/* First Half */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-orange-500" />
                        First Half
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Start Time</label>
                          <input
                            type="time"
                            value={firstHalfStartTime}
                            onChange={(e) => handleFirstHalfStartChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">End Time</label>
                          <input
                            type="time"
                            value={firstHalfEndTime}
                            onChange={(e) => handleFirstHalfEndChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Half Duration</label>
                          <input
                            type="number"
                            value={firstHalfDuration}
                            onChange={(e) => setFirstHalfDuration(e.target.value ? Number(e.target.value) : '')}
                            min="0"
                            step="0.25"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="Auto or enter"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Min Complete Duration</label>
                          <input
                            type="number"
                            value={firstHalfMinDuration}
                            onChange={(e) => setFirstHalfMinDuration(e.target.value ? Number(e.target.value) : '')}
                            min="0"
                            step="0.25"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="e.g. 4"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Grace (minutes)</label>
                          <input
                            type="number"
                            value={firstHalfGracePeriod}
                            onChange={(e) => setFirstHalfGracePeriod(Number(e.target.value) || 0)}
                            min="0"
                            step="1"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="15"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Payable Shifts</label>
                          <input
                            type="number"
                            value={firstHalfPayableShifts}
                            onChange={(e) => setFirstHalfPayableShifts(Number(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Break */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-slate-500" />
                        Meal Break
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Break Start</label>
                          <input
                            type="time"
                            value={breakStartTime}
                            onChange={(e) => handleBreakStartTimeChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Break End</label>
                          <input
                            type="time"
                            value={breakEndTime}
                            onChange={(e) => handleBreakEndTimeChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Second Half */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/50">
                      <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="h-4 w-1 rounded-full bg-purple-500" />
                        Second Half
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Start Time</label>
                          <input
                            type="time"
                            value={secondHalfStartTime}
                            onChange={(e) => handleSecondHalfStartChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">End Time</label>
                          <input
                            type="time"
                            value={secondHalfEndTime}
                            onChange={(e) => handleSecondHalfEndChange(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Half Duration</label>
                          <input
                            type="number"
                            value={secondHalfDuration}
                            onChange={(e) => setSecondHalfDuration(e.target.value ? Number(e.target.value) : '')}
                            min="0"
                            step="0.25"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="Auto or enter"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Min Complete Duration</label>
                          <input
                            type="number"
                            value={secondHalfMinDuration}
                            onChange={(e) => setSecondHalfMinDuration(e.target.value ? Number(e.target.value) : '')}
                            min="0"
                            step="0.25"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="e.g. 4"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Grace (minutes)</label>
                          <input
                            type="number"
                            value={secondHalfGracePeriod}
                            onChange={(e) => setSecondHalfGracePeriod(Number(e.target.value) || 0)}
                            min="0"
                            step="1"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                            placeholder="15"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-[10px] font-medium text-slate-600 dark:text-slate-300">Payable Shifts</label>
                          <input
                            type="number"
                            value={secondHalfPayableShifts}
                            onChange={(e) => setSecondHalfPayableShifts(Number(e.target.value) || 0)}
                            min="0"
                            step="0.01"
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm transition-all focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-8 space-y-4">
                  {continuityError && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400 flex items-start gap-2">
                      <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="font-semibold mb-1">Continuity Validation:</p>
                        <p>{continuityError}</p>
                      </div>
                    </div>
                  )}

                  {illegalTimingWarning && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-800 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-400 flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      {illegalTimingWarning}
                    </div>
                  )}

                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="submit"
                      className="flex-1 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition-all hover:from-blue-600 hover:to-indigo-600 active:scale-[0.98]"
                    >
                      {editingShift ? 'Update' : 'Create'} Shift
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Shifts Display */}
        {loading ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm py-12 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <Spinner />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">Loading shifts...</p>
          </div>
        ) : shifts.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30">
              <svg className="h-6 w-6 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">No shifts found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create your first shift to get started</p>
          </div>
        ) : shiftDisplayScope === 'all' ? (
          renderShiftsDisplay(shifts)
        ) : !hasClassifiedData ? (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">No classified structure found</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Switch to All Shifts view or configure division/department/designation shift mappings.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {scopedDivisions.map((division) => {
              const divisionShifts = (division.shifts || [])
                .map((shiftRef) => resolveShiftReference(shiftRef))
                .filter(Boolean) as Shift[];

              if (divisionShifts.length === 0) return null;

              return (
                <div key={division._id} className="space-y-4">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-200">
                    <div className="h-6 w-1 rounded-full bg-orange-500" />
                    {division.name} <span className="text-sm font-normal text-slate-500">Division Defaults</span>
                  </h2>
                  {renderShiftsDisplay(divisionShifts)}
                </div>
              );
            })}

            {scopedDepartments.map((department) => {
              const directShifts = (department.shifts || [])
                .map((shiftRef) => resolveShiftReference(shiftRef))
                .filter(Boolean) as Shift[];

              const divisionDefaultShifts = (department.divisionDefaults || [])
                .flatMap((defaultEntry) => {
                  const divisionId = typeof defaultEntry.division === 'string'
                    ? defaultEntry.division
                    : defaultEntry.division?._id;
                  if (!scopedDivisions.some((division) => division._id === divisionId)) return [];
                  return defaultEntry.shifts || [];
                })
                .map((shiftRef) => resolveShiftReference(shiftRef))
                .filter(Boolean) as Shift[];

              const departmentShifts = [...directShifts, ...divisionDefaultShifts];

              const departmentDesignations = scopedDesignations.filter((designation) =>
                (designation.department && (
                  (typeof designation.department === 'string' ? designation.department : designation.department._id) === department._id
                )) ||
                (department.designations && department.designations.some((d) => (typeof d === 'string' ? d : d._id) === designation._id))
              );

              if (departmentShifts.length === 0 && departmentDesignations.length === 0) return null;

              return (
                <div key={department._id} className="space-y-4">
                  {departmentShifts.length > 0 && (
                    <>
                      <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-200">
                        <div className="h-6 w-1 rounded-full bg-purple-500" />
                        {department.name} <span className="text-sm font-normal text-slate-500">Department Specific</span>
                      </h2>
                      {renderShiftsDisplay(departmentShifts)}
                    </>
                  )}

                  {departmentDesignations.length > 0 && (
                    <div className="mt-6 space-y-6 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                      {departmentDesignations.map((designation) => {
                        let effectiveShifts: any[] = designation.shifts || [];
                        if (designation.departmentShifts && designation.departmentShifts.length > 0) {
                          const departmentOverride = designation.departmentShifts.find((entry) =>
                            (typeof entry.department === 'string' ? entry.department : entry.department._id) === department._id
                          );
                          if (departmentOverride?.shifts?.length) {
                            effectiveShifts = departmentOverride.shifts;
                          }
                        }

                        const resolvedDesignationShifts = effectiveShifts
                          .map((shiftRef) => resolveShiftReference(shiftRef))
                          .filter(Boolean) as Shift[];

                        if (resolvedDesignationShifts.length === 0) return null;

                        return (
                          <div key={designation._id} className="space-y-3">
                            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-700 dark:text-slate-300">
                              <div className="h-2 w-2 rounded-full bg-indigo-400" />
                              {designation.name} <span className="text-xs font-normal text-slate-400">Designation Shifts</span>
                            </h3>
                            {renderShiftsDisplay(resolvedDesignationShifts)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {(() => {
              const assignedShiftIds = getClassifiedAssignedShiftIds();
              const unassignedShifts = shifts.filter((shift) => !assignedShiftIds.has(shift._id));
              if (unassignedShifts.length === 0) return null;

              return (
                <div className="space-y-4 border-t border-slate-200 pt-8 dark:border-slate-800">
                  <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-200">
                    <div className="h-6 w-1 rounded-full bg-slate-500" />
                    Unassigned Shifts <span className="text-sm font-normal text-slate-500">Not mapped to division/department/designation</span>
                  </h2>
                  {renderShiftsDisplay(unassignedShifts)}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
