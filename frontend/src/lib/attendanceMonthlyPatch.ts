/** Merge a single-day detail response into monthly grid state (avoids full list refetch). */

export type MonthlyDayPatch = Record<string, unknown>;

function normalizeDayForGrid(detail: MonthlyDayPatch, prev?: MonthlyDayPatch | null): MonthlyDayPatch {
  const shifts = Array.isArray(detail.shifts) ? detail.shifts : prev?.shifts;
  const shiftId =
    detail.shiftId ??
    (Array.isArray(shifts) && shifts[0] && typeof shifts[0] === 'object'
      ? (shifts[0] as MonthlyDayPatch).shiftId
      : prev?.shiftId);
  const totalHours =
    detail.totalHours ??
    detail.totalWorkingHours ??
    prev?.totalHours ??
    null;

  return {
    ...detail,
    shifts,
    shiftId,
    totalHours,
    lateInMinutes:
      detail.lateInMinutes ?? detail.totalLateInMinutes ?? prev?.lateInMinutes ?? 0,
    earlyOutMinutes:
      detail.earlyOutMinutes ?? detail.totalEarlyOutMinutes ?? prev?.earlyOutMinutes ?? 0,
    isLateIn:
      Number(detail.lateInMinutes ?? detail.totalLateInMinutes ?? 0) > 0 ||
      Boolean(prev?.isLateIn),
    isEarlyOut:
      Number(detail.earlyOutMinutes ?? detail.totalEarlyOutMinutes ?? 0) > 0 ||
      Boolean(prev?.isEarlyOut),
  };
}

export function patchMonthlyDayFromDetail<T extends { employee: { emp_no?: string }; dailyAttendance: Record<string, MonthlyDayPatch | null> }>(
  rows: T[],
  empNo: string,
  date: string,
  detail: MonthlyDayPatch,
  preserve?: Partial<MonthlyDayPatch>
): T[] {
  return rows.map((row) => {
    if (String(row.employee.emp_no || '') !== String(empNo)) return row;
    const prev = row.dailyAttendance[date];
    const normalized = normalizeDayForGrid(detail, prev);
    const merged: MonthlyDayPatch = {
      ...(prev || {}),
      ...normalized,
      date,
      hasLeave: preserve?.hasLeave ?? prev?.hasLeave ?? normalized.hasLeave,
      leaveInfo: preserve?.leaveInfo ?? prev?.leaveInfo ?? normalized.leaveInfo,
      hasOD: preserve?.hasOD ?? prev?.hasOD ?? normalized.hasOD,
      odInfo: preserve?.odInfo ?? prev?.odInfo ?? normalized.odInfo,
      isConflict: preserve?.isConflict ?? prev?.isConflict ?? normalized.isConflict,
      isEdited: preserve?.isEdited ?? prev?.isEdited ?? normalized.isEdited ?? true,
      editHistory: normalized.editHistory ?? prev?.editHistory,
      source: normalized.source ?? prev?.source,
    };
    return {
      ...row,
      dailyAttendance: {
        ...row.dailyAttendance,
        [date]: merged,
      },
    };
  });
}
