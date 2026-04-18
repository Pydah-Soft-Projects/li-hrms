/** Earth radius in meters (WGS84). */
const R = 6371000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Whether to persist a new trail sample.
 * - Records clear movement quickly (dense polyline when travelling).
 * - Also emits heartbeat points on fixed cadence so backend receives a continuous stream.
 */
export function shouldAppendOdWebTrailPoint(
  lastLat: number | null,
  lastLng: number | null,
  lastSentAt: number,
  lat: number,
  lng: number,
  now: number
): boolean {
  if (lastLat == null || lastLng == null) return true;
  const dist = haversineMeters(lastLat, lastLng, lat, lng);
  const MIN_MOVE_M = 6;
  const HEARTBEAT_MS = 15_000;
  if (dist >= MIN_MOVE_M) return true;
  if (now - lastSentAt >= HEARTBEAT_MS) return true;
  return false;
}

/** GeolocationPositionOptions tuned for a denser, fresher trail (desktop Chrome often caches fixes). */
export const OD_WEB_TRAIL_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
};

export const OD_WEB_TRAIL_POLL_MS = 12_000;
export const OD_WEB_TRAIL_FLUSH_MS = 25_000;
export const OD_WEB_TRAIL_BATCH_FLUSH = 12;
