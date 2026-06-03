'use client';

import {
  formatAttendanceLeaveDayPortion,
  getLeaveDetailDisplay,
  toCalendarDateStr,
  type HalfDayType,
} from '@/lib/leaveDayRange';

export type AttendanceLeaveInfo = {
  leaveId?: string;
  leaveType?: string;
  isHalfDay?: boolean;
  halfDayType?: HalfDayType | string | null;
  fromIsHalfDay?: boolean;
  fromHalfDayType?: HalfDayType | string | null;
  toIsHalfDay?: boolean;
  toHalfDayType?: HalfDayType | string | null;
  segmentDaysOnDate?: number;
  purpose?: string;
  fromDate?: string | Date;
  toDate?: string | Date;
  numberOfDays?: number;
  dayInLeave?: number | null;
  appliedAt?: string;
  approvedBy?: { name: string; email?: string } | null;
  approvedAt?: string;
};

function dayInLeaveLabel(n: number): string {
  if (n === 1) return '1st day';
  if (n === 2) return '2nd day';
  if (n === 3) return '3rd day';
  return `${n}th day`;
}

function formatIstDate(value: string | Date | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

type Props = {
  leaveInfo: AttendanceLeaveInfo;
  isConflict?: boolean;
};

export function AttendanceLeaveInfoSection({ leaveInfo, isConflict }: Props) {
  const spanDisplay = getLeaveDetailDisplay({
    fromDate: leaveInfo.fromDate ?? '',
    toDate: leaveInfo.toDate ?? leaveInfo.fromDate ?? '',
    numberOfDays: leaveInfo.numberOfDays,
    isHalfDay: leaveInfo.isHalfDay,
    halfDayType: leaveInfo.halfDayType as HalfDayType | null,
    fromIsHalfDay: leaveInfo.fromIsHalfDay,
    fromHalfDayType: leaveInfo.fromHalfDayType as HalfDayType | null,
    toIsHalfDay: leaveInfo.toIsHalfDay,
    toHalfDayType: leaveInfo.toHalfDayType as HalfDayType | null,
  });

  const fromStr = toCalendarDateStr(leaveInfo.fromDate);
  const toStr = toCalendarDateStr(leaveInfo.toDate || leaveInfo.fromDate);
  const isMultiDay = fromStr && toStr && fromStr !== toStr;
  const thisDayPortion = formatAttendanceLeaveDayPortion(leaveInfo);
  const creditOnDay =
    leaveInfo.segmentDaysOnDate != null
      ? `${leaveInfo.segmentDaysOnDate} day${leaveInfo.segmentDaysOnDate === 1 ? '' : 's'}`
      : leaveInfo.isHalfDay
        ? '0.5 day'
        : '1 day';

  return (
    <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
      <h4 className="mb-3 text-base font-semibold text-orange-900 dark:text-orange-200">Leave Information</h4>

      {leaveInfo.purpose ? (
        <div className="mb-3">
          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Purpose / Reason</label>
          <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">{leaveInfo.purpose}</div>
        </div>
      ) : null}

      <div className="mb-3 rounded-md border border-orange-200/80 bg-white/60 p-3 dark:border-orange-700/50 dark:bg-orange-950/30">
        <label className="text-xs font-medium text-orange-700 dark:text-orange-300">This calendar day</label>
        <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">{thisDayPortion}</div>
        <div className="mt-0.5 text-xs text-orange-800/80 dark:text-orange-200/70">
          Counts as {creditOnDay} toward leave balance
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Leave Type</label>
          <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
            {leaveInfo.leaveType || 'N/A'}
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Request total</label>
          <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">{spanDisplay.durationText}</div>
          {spanDisplay.durationNote ? (
            <div className="mt-0.5 text-xs text-orange-800/80 dark:text-orange-200/70">{spanDisplay.durationNote}</div>
          ) : null}
        </div>
      </div>

      {leaveInfo.fromDate && leaveInfo.toDate ? (
        <div className="mb-3">
          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Date range</label>
          <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
            {formatIstDate(leaveInfo.fromDate)} – {formatIstDate(leaveInfo.toDate)}
          </div>
          {isMultiDay ? (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-orange-200/60 bg-orange-100/40 px-2 py-1.5 dark:border-orange-800/60 dark:bg-orange-900/30">
                <span className="font-medium text-orange-800 dark:text-orange-300">From · </span>
                <span className="text-orange-900 dark:text-orange-100">{spanDisplay.fromPortion}</span>
              </div>
              <div className="rounded border border-orange-200/60 bg-orange-100/40 px-2 py-1.5 dark:border-orange-800/60 dark:bg-orange-900/30">
                <span className="font-medium text-orange-800 dark:text-orange-300">To · </span>
                <span className="text-orange-900 dark:text-orange-100">{spanDisplay.toPortion}</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        {leaveInfo.dayInLeave != null && leaveInfo.dayInLeave > 0 ? (
          <div>
            <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Day in leave span</label>
            <div className="mt-1 font-semibold text-orange-900 dark:text-orange-100">
              {dayInLeaveLabel(leaveInfo.dayInLeave)}
            </div>
          </div>
        ) : null}
      </div>

      {leaveInfo.appliedAt ? (
        <div className="mb-3">
          <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Applied on</label>
          <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
            {new Date(leaveInfo.appliedAt).toLocaleString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Kolkata',
            })}
          </div>
        </div>
      ) : null}

      {leaveInfo.approvedBy ? (
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved by</label>
            <div className="mt-1 text-sm font-semibold text-orange-900 dark:text-orange-100">
              {leaveInfo.approvedBy.name || leaveInfo.approvedBy.email || 'N/A'}
            </div>
          </div>
          {leaveInfo.approvedAt ? (
            <div>
              <label className="text-xs font-medium text-orange-700 dark:text-orange-300">Approved on</label>
              <div className="mt-1 text-sm text-orange-900 dark:text-orange-100">
                {new Date(leaveInfo.approvedAt).toLocaleString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Kolkata',
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {isConflict ? (
        <div className="mt-2 rounded border border-red-300 bg-red-50 p-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          Conflict: leave approved but attendance was also logged for this date
        </div>
      ) : null}
    </div>
  );
}
