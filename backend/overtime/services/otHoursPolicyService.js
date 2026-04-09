/**
 * Applies configured OT hour rules (threshold, minimum, minute grid, whole-hour rounding).
 * All values are in decimal hours (e.g. 1.5 = 90 minutes).
 */

/**
 * Snap duration to nearest N-minute increment (e.g. 15 → nearest quarter-hour).
 * @param {number} hours
 * @param {number} nMin
 */
function snapToNearestMinuteGrid(hours, nMin) {
  const n = Number(nMin);
  if (!Number.isFinite(n) || n <= 0) return hours;
  const totalMin = hours * 60;
  const snapped = Math.round(totalMin / n) * n;
  return Math.round((snapped / 60) * 10000) / 10000;
}

function normalizeRanges(ranges) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((r) => ({
      minMinutes: Number(r?.minMinutes),
      maxMinutes: Number(r?.maxMinutes),
      creditedMinutes: Number(r?.creditedMinutes),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.minMinutes) &&
        Number.isFinite(r.maxMinutes) &&
        Number.isFinite(r.creditedMinutes) &&
        r.minMinutes >= 0 &&
        r.maxMinutes >= 0 &&
        r.creditedMinutes >= 0
    )
    .map((r) => {
      if (r.minMinutes <= r.maxMinutes) return r;
      return { ...r, minMinutes: r.maxMinutes, maxMinutes: r.minMinutes };
    })
    .sort((a, b) => a.minMinutes - b.minMinutes || a.maxMinutes - b.maxMinutes);
}

/**
 * @param {number} rawHours - Raw OT in decimal hours
 * @param {object} policy - Merged policy from otConfigResolver
 * @returns {{ eligible: boolean, finalHours: number, rawHours: number, steps: string[] }}
 */
function applyOtHoursPolicy(rawHours, policy) {
  const steps = [];
  const recognitionMode = policy.recognitionMode || 'none';
  const thresholdHours =
    policy.thresholdHours !== undefined && policy.thresholdHours !== null
      ? Number(policy.thresholdHours)
      : null;
  const minOTHours = Number(policy.minOTHours ?? policy.minimumOtHours ?? 0) || 0;
  const roundingMinutes = Number(policy.roundingMinutes);
  const roundThreshold =
    policy.roundUpIfFractionMinutesGte !== undefined &&
    policy.roundUpIfFractionMinutesGte !== null
      ? Number(policy.roundUpIfFractionMinutesGte)
      : null;
  const ranges = normalizeRanges(policy.otHourRanges);

  let h = Number(rawHours) || 0;
  if (h < 0) h = 0;
  const rawMinutes = Math.round(h * 60);
  steps.push(`raw=${h.toFixed(4)}h`);

  if (recognitionMode === 'threshold_full' && thresholdHours != null && thresholdHours > 0) {
    if (h + 1e-9 < thresholdHours) {
      steps.push(`below_threshold(${thresholdHours}h)->0`);
      return {
        eligible: false,
        finalHours: 0,
        rawHours: h,
        rawMinutes,
        creditedMinutes: 0,
        matchedRange: null,
        steps,
      };
    }
    steps.push(`threshold_ok(>=${thresholdHours}h)`);
  }

  if (minOTHours > 0 && h + 1e-9 < minOTHours) {
    steps.push(`below_minimum_ot(${minOTHours}h)->0`);
    return {
      eligible: false,
      finalHours: 0,
      rawHours: h,
      rawMinutes,
      creditedMinutes: 0,
      matchedRange: null,
      steps,
    };
  }

  if (ranges.length > 0) {
    const matched = ranges.find((r) => rawMinutes >= r.minMinutes && rawMinutes <= r.maxMinutes);
    if (!matched) {
      steps.push('range_no_match->0');
      return {
        eligible: false,
        finalHours: 0,
        rawHours: h,
        rawMinutes,
        creditedMinutes: 0,
        matchedRange: null,
        steps,
      };
    }
    h = matched.creditedMinutes / 60;
    steps.push(
      `range_match(${Math.round(rawMinutes)}m in ${matched.minMinutes}-${matched.maxMinutes}m -> ${matched.creditedMinutes}m)`
    );
  } else if (Number.isFinite(roundingMinutes) && roundingMinutes > 0) {
    const before = h;
    h = snapToNearestMinuteGrid(h, roundingMinutes);
    steps.push(`snap_nearest_${roundingMinutes}min(${before.toFixed(4)}h->${h.toFixed(4)}h)`);
  }

  if (!ranges.length && roundThreshold != null && roundThreshold > 0 && roundThreshold < 60) {
    const whole = Math.floor(h + 1e-9);
    const fractionMinutes = (h - whole) * 60;
    if (fractionMinutes + 1e-9 >= roundThreshold) {
      h = whole + 1;
      steps.push(`round_up_fracMin>=${roundThreshold}->${h}h`);
    } else {
      h = whole;
      steps.push(`floor_to_whole_hour->${h}h`);
    }
  }

  h = Math.round(h * 100) / 100;
  const eligible = h > 1e-6;
  if (!eligible) steps.push('final_zero');
  const creditedMinutes = Math.round(h * 60);
  const matchedRange = ranges.length
    ? ranges.find((r) => rawMinutes >= r.minMinutes && rawMinutes <= r.maxMinutes) || null
    : null;
  return {
    eligible,
    finalHours: h,
    rawHours: Number(rawHours) || 0,
    rawMinutes,
    creditedMinutes,
    matchedRange,
    steps,
  };
}

module.exports = {
  applyOtHoursPolicy,
  snapToNearestMinuteGrid,
};
