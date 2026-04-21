const OD = require('../model/OD');
const { processTrailPipelineBoth, SNAP_THRESHOLD } = require('./roadSnappingService');

const MAX_OD_TRAIL_POINTS = 4000;
const MAX_OD_TRAIL_BATCH = 40;

function isOdApplicantOwner(od, user) {
  if (!od || !user) return false;
  if (od.appliedBy && user._id && od.appliedBy.toString() === user._id.toString()) return true;
  const empId = od.employeeId?._id || od.employeeId;
  if (user.employeeRef && empId && empId.toString() === user.employeeRef.toString()) return true;
  if (empId && user._id && empId.toString() === user._id.toString()) return true;
  if (empId && user.userId && empId.toString() === user.userId.toString()) return true;
  if (user.employeeId && od.emp_no) {
    const a = String(user.employeeId).trim().toLowerCase();
    const b = String(od.emp_no).trim().toLowerCase();
    if (a && b && a === b) return true;
  }
  const userEmpNoCandidates = [user.emp_no, user.empNo, user.employeeNumber, user.employee_no, user.username, user.email]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  const odEmpNoCandidates = [od.emp_no, od.employeeId?.emp_no]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  return userEmpNoCandidates.some((val) => odEmpNoCandidates.includes(val));
}

function canViewOdTrail(od, user) {
  if (!od || !user) return false;
  if (isOdApplicantOwner(od, user)) return true;
  return ['super_admin', 'sub_admin', 'hr', 'manager', 'hod'].includes(String(user.role || ''));
}

function normalizePoints(points, source) {
  const normalized = [];
  const list = Array.isArray(points) ? points.slice(0, MAX_OD_TRAIL_BATCH) : [];
  for (const p of list) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    normalized.push({
      latitude: lat,
      longitude: lng,
      capturedAt: p.capturedAt ? new Date(p.capturedAt) : new Date(),
      address: p.address ? String(p.address).slice(0, 500) : undefined,
      accuracy: p.accuracy != null && Number.isFinite(Number(p.accuracy)) ? Number(p.accuracy) : undefined,
      heading: p.heading != null && Number.isFinite(Number(p.heading)) ? Number(p.heading) : undefined,
      speed: p.speed != null && Number.isFinite(Number(p.speed)) ? Number(p.speed) : undefined,
      source: p.source === 'web' || p.source === 'mobile' ? p.source : source,
    });
  }
  return normalized;
}

async function appendOdTrailPoints({ odId, user, points, client }) {
  const od = await OD.findById(odId);
  if (!od) return { ok: false, status: 404, error: 'OD application not found' };
  if (od.status !== 'draft') return { ok: false, status: 400, error: 'Location trail can only be updated while OD is in draft' };
  if (od.endEvidence?.submittedAt) return { ok: false, status: 400, error: 'OD OUT already submitted; trail is closed' };
  if (!isOdApplicantOwner(od, user)) return { ok: false, status: 403, error: 'Not authorized to update this OD trail' };
  if (!Array.isArray(points) || points.length === 0) return { ok: false, status: 400, error: 'points[] is required' };

  const source = client === 'web' || client === 'mobile' ? client : points[0]?.source === 'web' || points[0]?.source === 'mobile' ? points[0].source : 'unknown';
  const normalized = normalizePoints(points, source);
  if (normalized.length === 0) return { ok: false, status: 400, error: 'No valid GPS points in request' };

  if (!Array.isArray(od.locationTrail)) od.locationTrail = [];
  od.locationTrail.push(...normalized);
  if (od.locationTrail.length > MAX_OD_TRAIL_POINTS) {
    od.locationTrail = od.locationTrail.slice(-MAX_OD_TRAIL_POINTS);
  }
  od.markModified('locationTrail');
  await od.save();

  // Trigger async road snapping if enough new points have accumulated
  const lastIdx = typeof od.lastSnappedIndex === 'number' ? od.lastSnappedIndex : -1;
  const unsnappedCount = od.locationTrail.length - 1 - lastIdx;
  if (unsnappedCount >= SNAP_THRESHOLD) {
    // Fire-and-forget: don't block the response/socket ack
    snapOdTrailAsync(od._id.toString()).catch((err) => {
      console.warn('[OdTrail] Async snap failed:', err.message || err);
    });
  }

  return { ok: true, od, normalized };
}

/**
 * Run the road-snapping pipeline on an OD's full locationTrail.
 * Called asynchronously after enough new points accumulate, and also
 * on OD OUT submission for the final clean path.
 *
 * @param {string} odId
 * @returns {Promise<{ encodedPolyline: string|null, snappedCount: number } | null>}
 */
async function snapOdTrailAsync(odId) {
  const od = await OD.findById(odId);
  if (!od) return null;
  const trail = od.locationTrail;
  if (!Array.isArray(trail) || trail.length < 2) return null;

  // Extract the coordinate subset for snapping
  const rawCoords = trail.map((p) => ({
    latitude: Number(p.latitude),
    longitude: Number(p.longitude),
    accuracy: p.accuracy != null ? Number(p.accuracy) : undefined,
  })).filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

  if (rawCoords.length < 2) return null;

  try {
    const result = await processTrailPipelineBoth(rawCoords);

    // Keep legacy fields mapped to OSRM so existing clients continue to work
    od.snappedTrail = result.osrm.snappedPoints;
    od.encodedPolyline = result.osrm.encodedPolyline;
    od.snappedTrailOSRM = result.osrm.snappedPoints;
    od.snappedTrailMapbox = result.mapbox.snappedPoints;
    od.encodedPolylineOSRM = result.osrm.encodedPolyline;
    od.encodedPolylineMapbox = result.mapbox.encodedPolyline;
    od.snappedAtOSRM = new Date();
    od.snappedAtMapbox = new Date();
    od.lastSnappedIndex = trail.length - 1;
    od.markModified('snappedTrail');
    od.markModified('encodedPolyline');
    od.markModified('snappedTrailOSRM');
    od.markModified('snappedTrailMapbox');
    od.markModified('encodedPolylineOSRM');
    od.markModified('encodedPolylineMapbox');
    od.markModified('snappedAtOSRM');
    od.markModified('snappedAtMapbox');
    await od.save();

    console.log(
      `[OdTrail] Snapped OD ${odId}: OSRM ${result.osrm.meta.rawCount}→${result.osrm.meta.snappedCount}→${result.osrm.meta.compressedCount} (${result.osrm.meta.encodedLength} chars), Mapbox ${result.mapbox.meta.rawCount}→${result.mapbox.meta.snappedCount}→${result.mapbox.meta.compressedCount} (${result.mapbox.meta.encodedLength} chars)`
    );

    // Broadcast the snapped update via socket (if socketService is available)
    try {
      const { emitOdTrailSnappedUpdate } = require('../../shared/services/socketService');
      emitOdTrailSnappedUpdate({
        odId: String(odId),
        encodedPolyline: result.osrm.encodedPolyline,
        snappedPoints: result.osrm.snappedPoints,
        providers: {
          osrm: {
            encodedPolyline: result.osrm.encodedPolyline,
            snappedPoints: result.osrm.snappedPoints,
            snappedAt: od.snappedAtOSRM,
          },
          mapbox: {
            encodedPolyline: result.mapbox.encodedPolyline,
            snappedPoints: result.mapbox.snappedPoints,
            snappedAt: od.snappedAtMapbox,
          },
        },
      });
    } catch {
      // socketService may not be initialized yet during startup
    }

    return {
      encodedPolyline: result.osrm.encodedPolyline,
      snappedCount: result.osrm.snappedPoints.length,
    };
  } catch (err) {
    console.warn('[OdTrail] snapOdTrailAsync error:', err.message || err);
    return null;
  }
}

module.exports = {
  appendOdTrailPoints,
  canViewOdTrail,
  snapOdTrailAsync,
};
