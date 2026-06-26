import { api } from '@/lib/api';

/** Division override when a single division is filtered; otherwise organization default. */
export async function resolveAttendanceProcessingModeForView(
  divisionId?: string | null
): Promise<'single_shift' | 'multi_shift' | null> {
  try {
    if (divisionId) {
      const divRes = await api.getDivision(divisionId);
      const divMode = divRes.data?.resolvedProcessingMode?.mode;
      if (divMode === 'single_shift' || divMode === 'multi_shift') {
        return divMode;
      }
    }
    const attendanceRes = await api.getAttendanceSettings();
    const orgMode = attendanceRes?.data?.processingMode?.mode;
    if (orgMode === 'single_shift' || orgMode === 'multi_shift') {
      return orgMode;
    }
  } catch {
    // keep caller default
  }
  return null;
}
