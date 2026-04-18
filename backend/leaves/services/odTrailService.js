const OD = require('../model/OD');

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

  return { ok: true, od, normalized };
}

module.exports = {
  appendOdTrailPoints,
  canViewOdTrail,
};

