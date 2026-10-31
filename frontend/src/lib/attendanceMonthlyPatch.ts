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

  const lateMins = Number(detail.lateInMinutes ?? detail.totalLateInMinutes ?? 0);
  const earlyMins = Number(detail.earlyOutMinutes ?? detail.totalEarlyOutMinutes ?? 0);

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
      detail.isLateIn !== undefined ? Boolean(detail.isLateIn) : lateMins > 0,
    isEarlyOut:
      detail.isEarlyOut !== undefined ? Boolean(detail.isEarlyOut) : earlyMins > 0,
  };
}

export function patchMonthlyDayFromDetail<
  T extends { employee: { emp_no?: string }; dailyAttendance: Record<string, unknown | null> },
>(
  rows: T[],
  empNo: string,
  date: string,
  detail: MonthlyDayPatch,
  preserve?: Partial<MonthlyDayPatch>,
): T[] {
  return rows.map((row) => {
    if (String(row.employee.emp_no || '') !== String(empNo)) return row;
    const prev = row.dailyAttendance[date] as MonthlyDayPatch | null | undefined;
    const normalized = normalizeDayForGrid(detail, prev);
    const merged: MonthlyDayPatch = {
      ...(prev || {}),
      ...normalized,
      date,
      hasLeave: preserve?.hasLeave ?? normalized.hasLeave ?? prev?.hasLeave,
      leaveInfo: preserve?.leaveInfo ?? normalized.leaveInfo ?? prev?.leaveInfo,
      hasOD: preserve?.hasOD ?? normalized.hasOD ?? prev?.hasOD,
      odInfo: preserve?.odInfo ?? normalized.odInfo ?? prev?.odInfo,
      isConflict: preserve?.isConflict ?? normalized.isConflict ?? prev?.isConflict,
      isEdited: preserve?.isEdited ?? normalized.isEdited ?? prev?.isEdited ?? false,
      editHistory: normalized.editHistory ?? prev?.editHistory,
      source: normalized.source ?? prev?.source,
    };
    return {
      ...row,
      dailyAttendance: {
        ...row.dailyAttendance,
        [date]: merged,
      },
    } as T;
  });
}
