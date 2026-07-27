'use client';

import React from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Star,
  Tag,
  Briefcase,
  UserCheck,
  ArrowRight,
  Info,
  Clock3,
  Sparkles,
} from 'lucide-react';
import dynamic from 'next/dynamic';

import type DualLocationMapComponent from '@/components/DualLocationMap';
import type LocationMapComponent from '@/components/LocationMap';

const DualLocationMap = dynamic<React.ComponentProps<typeof DualLocationMapComponent>>(() => import('@/components/DualLocationMap'), { ssr: false });
const LocationMap = dynamic<React.ComponentProps<typeof LocationMapComponent>>(() => import('@/components/LocationMap'), { ssr: false });

export interface ODDetailCardData {
  _id?: string;
  odId?: string;
  odType?: string;
  odType_extended?: 'full_day' | 'half_day' | 'hours' | string;
  fromDate?: string | Date;
  toDate?: string | Date;
  numberOfDays?: number;
  dayInOD?: number;
  durationHours?: number;
  isHalfDay?: boolean;
  halfDayType?: 'first_half' | 'second_half' | string | null;
  odStartTime?: string;
  odEndTime?: string;
  status?: string;
  placeVisited?: string;
  purpose?: string;
  reason?: string;
  remarks?: string;
  appliedAt?: string | Date;
  createdAt?: string | Date;
  approvedBy?: { name?: string; email?: string } | string | null;
  approvedAt?: string | Date;
  appliedBy?: { _id?: string; employee_name?: string; first_name?: string; last_name?: string; emp_no?: string } | string | null;
  employeeId?: { _id?: string; employee_name?: string; first_name?: string; last_name?: string; emp_no?: string } | null;
  emp_no?: string;
  designation?: { name?: string };
  department?: { name?: string };
  isCOEligible?: boolean;
  coEligibilityInfo?: {
    isCoEligible?: boolean;
    punchDetails?: {
      start?: string | null;
      end?: string | null;
      duration?: number | null;
      fromAttendance?: boolean;
    } | null;
  };
  startEvidence?: {
    photoEvidence?: { url?: string };
    geoLocation?: { latitude?: number; longitude?: number; address?: string };
    submittedAt?: string;
  } | null;
  endEvidence?: {
    photoEvidence?: { url?: string };
    geoLocation?: { latitude?: number; longitude?: number; address?: string };
    submittedAt?: string;
  } | null;
  photoEvidence?: {
    url?: string;
    exifLocation?: { latitude?: number; longitude?: number };
  } | null;
  geoLocation?: {
    latitude?: number;
    longitude?: number;
    address?: string;
  } | null;
  routePolyline?: Array<[number, number]>;
  trailPublishMode?: string;
  canRecordTrail?: boolean;
  earlyOutMinutes?: number | null;
  earlyOutDeduction?: {
    deductionApplied?: boolean;
    deductionType?: string;
    deductionDays?: number;
    deductionAmount?: number;
    reason?: string;
  } | null;
}

interface ODDetailCardProps {
  data: ODDetailCardData;
  onSubmitOutClick?: () => void;
  className?: string;
  compact?: boolean;
}

export function ODDetailCard({ data, onSubmitOutClick, className = '', compact = false }: ODDetailCardProps) {
  // Format date helper
  const formatDate = (d?: string | Date | null) => {
    if (!d) return '—';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return '—';
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  // Format 12-hour time
  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const d = new Date();
    d.setHours(h, m, 0);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // Format hours and mins
  const formatHoursMins = (hoursNum?: number | null) => {
    if (hoursNum == null || hoursNum <= 0) return null;
    const h = Math.floor(hoursNum);
    const m = Math.round((hoursNum % 1) * 60);
    if (h === 0) return `${m} mins`;
    if (m === 0) return `${h} hrs`;
    return `${h} hrs ${m} mins`;
  };

  // Status helper
  const getStatusBadge = (statusStr?: string) => {
    const s = (statusStr || 'pending').toLowerCase();
    if (['approved', 'hod_approved', 'manager_approved', 'hr_approved'].includes(s)) {
      return {
        label: s === 'approved' ? 'Approved' : s.replace('_', ' ').toUpperCase(),
        bg: 'bg-emerald-600 text-white border-emerald-700',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-white" />,
      };
    }
    if (['rejected'].includes(s)) {
      return {
        label: 'Rejected',
        bg: 'bg-rose-600 text-white border-rose-700',
        icon: <XCircle className="w-3.5 h-3.5 text-white" />,
      };
    }
    if (['draft'].includes(s)) {
      return {
        label: 'Draft',
        bg: 'bg-purple-600 text-white border-purple-700',
        icon: <Sparkles className="w-3.5 h-3.5 text-white" />,
      };
    }
    if (['cancelled'].includes(s)) {
      return {
        label: 'Cancelled',
        bg: 'bg-slate-600 text-white border-slate-700',
        icon: <Info className="w-3.5 h-3.5 text-white" />,
      };
    }
    // Pending default
    return {
      label: s === 'pending' ? 'Pending Approval' : s.replace('_', ' ').toUpperCase(),
      bg: 'bg-amber-500 text-white border-amber-600',
      icon: <Clock className="w-3.5 h-3.5 text-white" />,
    };
  };

  const statusInfo = getStatusBadge(data.status);
  const odTypeLabel = (data.odType || 'ON DUTY').replace(/_/g, ' ').toUpperCase();
  const odExtendedType = data.odType_extended || (data.isHalfDay ? 'half_day' : 'full_day');

  // Employee details formatting
  const empName =
    data.employeeId?.employee_name ||
    `${(data.employeeId as any)?.first_name || ''} ${(data.employeeId as any)?.last_name || ''}`.trim() ||
    (data.appliedBy as any)?.employee_name ||
    data.emp_no ||
    'Employee';

  const empNo = data.employeeId?.emp_no || data.emp_no || '';
  const desigName = data.designation?.name || '';
  const empNoDesig = [empNo, desigName].filter(Boolean).join(' · ') || empName;

  // Purpose text
  const purposeText = data.purpose || data.reason || data.remarks || 'No details specified';
  const placeText = data.placeVisited || data.geoLocation?.address || data.startEvidence?.geoLocation?.address || 'Not specified';

  // Evidence markers for DualLocationMap
  const mapMarkers = [];
  const inGeo = data.startEvidence?.geoLocation || data.geoLocation;
  const outGeo = data.endEvidence?.geoLocation || null;
  const inPhoto = data.startEvidence?.photoEvidence?.url || data.photoEvidence?.url || null;
  const outPhoto = data.endEvidence?.photoEvidence?.url || null;
  const inTime = data.startEvidence?.submittedAt || data.createdAt || data.appliedAt;
  const outTime = data.endEvidence?.submittedAt || null;
  const fromStr = formatDate(data.fromDate);
  const toStr = formatDate(data.toDate);
  const odDatesStr = fromStr === toStr ? fromStr : `${fromStr} - ${toStr}`;

  if (inGeo?.latitude != null && inGeo?.longitude != null) {
    mapMarkers.push({
      latitude: inGeo.latitude,
      longitude: inGeo.longitude,
      label: 'OD IN',
      address: inGeo.address || null,
      photoUrl: inPhoto,
      timestamp: inTime ? String(inTime) : null,
      odDateRange: odDatesStr,
    });
  }
  if (outGeo?.latitude != null && outGeo?.longitude != null) {
    mapMarkers.push({
      latitude: outGeo.latitude,
      longitude: outGeo.longitude,
      label: 'OD OUT',
      address: outGeo.address || null,
      photoUrl: outPhoto,
      timestamp: outTime ? String(outTime) : null,
      odDateRange: odDatesStr,
    });
  }

  // Single location fallback
  const singleLat = inGeo?.latitude ?? data.photoEvidence?.exifLocation?.latitude;
  const singleLng = inGeo?.longitude ?? data.photoEvidence?.exifLocation?.longitude;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      <div className="p-5 sm:p-6 space-y-6">
        {/* Early-Out Info Notice */}
        {data.earlyOutMinutes != null && data.earlyOutMinutes > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-600 text-white font-semibold">
                  <Clock3 className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 tracking-wide uppercase">
                    Early-Out Notice
                  </p>
                  <p className="text-sm font-bold text-amber-950 dark:text-amber-100">
                    {data.earlyOutMinutes} Minutes Early Departure
                  </p>
                </div>
              </div>
              {data.earlyOutDeduction?.deductionApplied && (
                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200">
                    Deduction: {data.earlyOutDeduction.deductionType?.replace('_', ' ') || 'Applied'}
                  </span>
                  {data.earlyOutDeduction.deductionDays && (
                    <p className="text-xs font-normal text-amber-900 dark:text-amber-300 mt-0.5">
                      {data.earlyOutDeduction.deductionDays} day(s) deducted
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comp-Off Premium Reward Indicator */}
        {data.isCOEligible && (
          <div className="rounded-xl border border-indigo-200 bg-slate-50 p-4 dark:border-indigo-800 dark:bg-slate-800/60">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-md shrink-0">
                <Star className="w-5 h-5 fill-current text-amber-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                  Compensatory Off Eligible
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 font-normal leading-relaxed">
                  This OD was served on a weekend or public holiday and generates credit towards compensatory leaves.
                </p>
                {data.coEligibilityInfo?.punchDetails && (
                  <div className="mt-2.5 inline-flex items-center gap-2 rounded-lg bg-white dark:bg-slate-900 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400 text-[11px]">
                      Punches:
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {data.coEligibilityInfo.punchDetails.start && data.coEligibilityInfo.punchDetails.end
                        ? `${data.coEligibilityInfo.punchDetails.start} – ${data.coEligibilityInfo.punchDetails.end}`
                        : 'Captured from Attendance Log'}
                    </span>
                    {data.coEligibilityInfo.punchDetails.duration != null && (
                      <span className="rounded-md bg-emerald-600 text-white px-2 py-0.5 text-[10px] font-bold">
                        {formatHoursMins(data.coEligibilityInfo.punchDetails.duration)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 3 Metric Columns: Single OD Date (with duration type), Place of Visit, and Purpose / Reason */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          {/* Item 1: OD Date & Duration Type */}
          <div className="p-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
              <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-semibold">OD Date</span>
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {odDatesStr}
            </p>
            <span className="mt-1 inline-block text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {odExtendedType === 'hours'
                ? `Hours OD (${formatHoursMins(data.durationHours) || 'Hour-based'})`
                : data.isHalfDay
                ? `0.5 Day (${data.halfDayType === 'second_half' ? 'Second Half' : 'First Half'})`
                : `${data.numberOfDays || 1} Day${(data.numberOfDays || 1) > 1 ? 's' : ''} (Full Day)`}
            </span>
          </div>

          {/* Item 2: Place of Visit */}
          <div className="p-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
              <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-xs font-semibold">Place of Visit</span>
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white truncate" title={placeText}>
              {placeText}
            </p>
            <span className="mt-1 inline-block text-xs font-medium text-sky-600 dark:text-sky-400">
              Destination
            </span>
          </div>

          {/* Item 3: Purpose / Reason */}
          <div className="p-1">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 mb-1">
              <FileText className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              <span className="text-xs font-semibold">Purpose / Reason</span>
            </div>
            <p className="text-base font-bold text-slate-900 dark:text-white truncate" title={purposeText}>
              {purposeText}
            </p>
            <span className="mt-1 inline-block text-xs font-medium text-violet-600 dark:text-violet-400">
              Details
            </span>
          </div>
        </div>

        {/* Work Timing Banner (Solid background) */}
        {(data.odStartTime || data.odEndTime || data.durationHours != null) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white font-semibold">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Work In</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {formatTime(data.odStartTime) || 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="hidden sm:block text-slate-300 dark:text-slate-600">
                  <ArrowRight className="w-4 h-4" />
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white font-semibold">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Work Out</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {formatTime(data.odEndTime) || 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {data.durationHours != null && data.durationHours > 0 && (
                <div className="flex items-center gap-2 rounded-xl bg-indigo-600 text-white px-3.5 py-2 font-semibold text-xs shadow-sm">
                  <Sparkles className="w-4 h-4" />
                  <span>Duration Credit: {formatHoursMins(data.durationHours)}</span>
                </div>
              )}
            </div>
          </div>
        )}



        {/* Draft Action Banner */}
        {data.status === 'draft' && !data.endEvidence?.submittedAt && onSubmitOutClick && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/40 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-purple-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-purple-950 dark:text-purple-200">
                  OD OUT Evidence Pending
                </p>
                <p className="text-xs text-purple-700 dark:text-purple-300">
                  Please submit your completion evidence to finalize your draft request.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSubmitOutClick}
              className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
            >
              Submit OD OUT
            </button>
          </div>
        )}

        {/* Bigger Map Location Trail (380px) */}
        {(mapMarkers.length > 0 || singleLat != null) && (
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-md">
            {mapMarkers.length > 0 ? (
              <DualLocationMap
                markers={mapMarkers as any}
                routePolyline={
                  data.routePolyline && data.routePolyline.length >= 2
                    ? data.routePolyline.map((pt) => (Array.isArray(pt) ? { latitude: pt[0], longitude: pt[1] } : pt))
                    : undefined
                }
                height="380px"
              />
            ) : singleLat != null && singleLng != null ? (
              <LocationMap
                latitude={singleLat}
                longitude={singleLng}
                address={inGeo?.address || null}
                height="380px"
              />
            ) : null}
          </div>
        )}



        {/* Footer Metadata (Applied On & Approved By/On) */}
        {(data.appliedAt || data.createdAt || data.approvedBy) && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
            {(data.appliedAt || data.createdAt) && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Applied On:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {formatDate(data.appliedAt || data.createdAt)}
                </span>
              </div>
            )}

            {data.approvedBy && (
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Approved By:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {typeof data.approvedBy === 'string'
                    ? data.approvedBy
                    : data.approvedBy.name || data.approvedBy.email || 'Approver'}
                </span>
                {data.approvedAt && (
                  <span className="text-slate-400">
                    ({formatDate(data.approvedAt)})
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ODDetailCard;
