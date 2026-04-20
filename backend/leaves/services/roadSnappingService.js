/**
 * Road Snapping Service
 * ---------------------
 * Converts raw GPS trail points into road-aligned paths using:
 *  1. OSRM Map Matching API (free, public)
 *  2. Kalman filter smoothing
 *  3. Douglas-Peucker compression
 *  4. Google-format polyline encoding
 */

const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';
const OSRM_PROFILE = process.env.OSRM_PROFILE || 'driving';

// Max coordinates OSRM accepts in a single match request
const OSRM_MAX_COORDS = 100;

// How many raw points must accumulate before we trigger a snap
const SNAP_THRESHOLD = 5;

// Timeout for OSRM HTTP calls (ms)
const OSRM_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ */
/*  1. OSRM Map Matching                                              */
/* ------------------------------------------------------------------ */

/**
 * Snap an array of {latitude, longitude} points to the road network via OSRM.
 * Returns the snapped coordinates array, or the original points on failure.
 *
 * @param {{ latitude: number, longitude: number }[]} points
 * @returns {Promise<{ latitude: number, longitude: number }[]>}
 */
async function snapToRoadsOSRM(points) {
  if (!points || points.length < 2) return points;

  // OSRM expects lng,lat pairs separated by semicolons
  const coords = points
    .slice(0, OSRM_MAX_COORDS)
    .map((p) => `${p.longitude},${p.latitude}`)
    .join(';');

  // Build radiuses (meters of tolerance per point, based on accuracy if available)
  const radiuses = points
    .slice(0, OSRM_MAX_COORDS)
    .map((p) => {
      const acc = Number(p.accuracy);
      if (Number.isFinite(acc) && acc > 0) return Math.min(Math.max(acc, 10), 50);
      return 25; // default tolerance
    })
    .join(';');

  const url =
    `${OSRM_BASE}/match/v1/${OSRM_PROFILE}/${coords}` +
    `?geometries=geojson&overview=full&radiuses=${radiuses}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`[RoadSnap] OSRM returned ${response.status}`);
      return points;
    }

    const data = await response.json();

    if (data.code !== 'Ok' || !data.matchings || data.matchings.length === 0) {
      // NoMatch / NoSegment — the points are probably off-road or too sparse
      console.warn(`[RoadSnap] OSRM code=${data.code}, matchings=${data.matchings?.length || 0}`);
      return points;
    }

    // Merge all matching geometries (there may be >1 if gaps between points are large)
    const snapped = [];
    for (const matching of data.matchings) {
      const geom = matching.geometry;
      if (!geom || !Array.isArray(geom.coordinates)) continue;
      for (const [lng, lat] of geom.coordinates) {
        snapped.push({ latitude: lat, longitude: lng });
      }
    }

    return snapped.length >= 2 ? snapped : points;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('[RoadSnap] OSRM request timed out');
    } else {
      console.warn('[RoadSnap] OSRM error:', err.message || err);
    }
    return points;
  }
}

/* ------------------------------------------------------------------ */
/*  2. Kalman Filter Smoothing                                        */
/* ------------------------------------------------------------------ */

/**
 * Apply a 1-D Kalman filter independently on lat and lng to remove GPS jitter.
 *
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {number} processNoise    – how much we expect the state to change each step
 * @param {number} measurementNoise – expected GPS noise
 * @returns {{ latitude: number, longitude: number }[]}
 */
function smoothPathKalman(points, processNoise = 0.0001, measurementNoise = 5) {
  if (!points || points.length < 2) return points;

  const smoothed = [];
  let prevLat = points[0].latitude;
  let prevLng = points[0].longitude;
  let prevLatErr = 1;
  let prevLngErr = 1;

  smoothed.push({ latitude: prevLat, longitude: prevLng });

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const predLatErr = prevLatErr + processNoise;
    const predLngErr = prevLngErr + processNoise;

    const kLat = predLatErr / (predLatErr + measurementNoise);
    const kLng = predLngErr / (predLngErr + measurementNoise);

    const sLat = prevLat + kLat * (p.latitude - prevLat);
    const sLng = prevLng + kLng * (p.longitude - prevLng);

    prevLatErr = (1 - kLat) * predLatErr;
    prevLngErr = (1 - kLng) * predLngErr;
    prevLat = sLat;
    prevLng = sLng;

    smoothed.push({ latitude: sLat, longitude: sLng });
  }

  return smoothed;
}

/* ------------------------------------------------------------------ */
/*  3. Douglas-Peucker Compression                                    */
/* ------------------------------------------------------------------ */

function _perpendicularDistance(p, lineStart, lineEnd) {
  const dx = lineEnd.longitude - lineStart.longitude;
  const dy = lineEnd.latitude - lineStart.latitude;
  const denom = Math.sqrt(dx * dx + dy * dy);
  if (denom === 0) return 0;
  return Math.abs(
    dy * p.longitude - dx * p.latitude +
    lineEnd.longitude * lineStart.latitude -
    lineEnd.latitude * lineStart.longitude
  ) / denom;
}

/**
 * Reduce the number of points in a polyline while preserving shape.
 * @param {{ latitude: number, longitude: number }[]} points
 * @param {number} tolerance – in degrees (~0.00005 ≈ 5 m)
 * @returns {{ latitude: number, longitude: number }[]}
 */
function compressDouglasPeucker(points, tolerance = 0.00003) {
  if (!points || points.length < 3) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = _perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = compressDouglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = compressDouglasPeucker(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }

  return [first, last];
}

/* ------------------------------------------------------------------ */
/*  4. Google Encoded Polyline Format                                  */
/* ------------------------------------------------------------------ */

/**
 * Encode an array of {latitude, longitude} into a Google-format polyline string.
 * @param {{ latitude: number, longitude: number }[]} points
 * @returns {string}
 */
function encodePolyline(points) {
  if (!points || points.length === 0) return '';

  let encoded = '';
  let prevLat = 0;
  let prevLng = 0;

  for (const p of points) {
    const lat = Math.round(p.latitude * 1e5);
    const lng = Math.round(p.longitude * 1e5);

    const diffs = [lat - prevLat, lng - prevLng];
    for (const delta of diffs) {
      let val = delta < 0 ? ~(delta << 1) : delta << 1;
      while (val >= 0x20) {
        encoded += String.fromCharCode((val & 0x1f) | 0x20 + 63);
        val >>= 5;
      }
      encoded += String.fromCharCode(val + 63);
    }

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

/**
 * Decode a Google-format polyline string into {latitude, longitude}[].
 * @param {string} encoded
 * @returns {{ latitude: number, longitude: number }[]}
 */
function decodePolyline(encoded) {
  if (!encoded) return [];

  const points = [];
  let lat = 0;
  let lng = 0;
  let index = 0;

  while (index < encoded.length) {
    for (const coord of ['lat', 'lng']) {
      let result = 0;
      let shift = 0;
      let temp;
      do {
        temp = encoded.charCodeAt(index++) - 63;
        result |= (temp & 0x1f) << shift;
        shift += 5;
      } while (temp >= 0x20);

      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (coord === 'lat') lat += delta;
      else lng += delta;
    }

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

/* ------------------------------------------------------------------ */
/*  5. Full Pipeline                                                   */
/* ------------------------------------------------------------------ */

/**
 * Run the full snapping pipeline: OSRM → Kalman → Douglas-Peucker → Encode.
 *
 * @param {{ latitude: number, longitude: number, accuracy?: number }[]} rawPoints
 * @returns {Promise<{
 *   snappedPoints: { latitude: number, longitude: number }[],
 *   encodedPolyline: string,
 *   meta: { rawCount: number, snappedCount: number, compressedCount: number, encodedLength: number }
 * }>}
 */
async function processTrailPipeline(rawPoints) {
  if (!rawPoints || rawPoints.length < 2) {
    return {
      snappedPoints: rawPoints || [],
      encodedPolyline: encodePolyline(rawPoints || []),
      meta: {
        rawCount: rawPoints?.length || 0,
        snappedCount: rawPoints?.length || 0,
        compressedCount: rawPoints?.length || 0,
        encodedLength: 0,
      },
    };
  }

  // Step 1: Snap to roads
  const snapped = await snapToRoadsOSRM(rawPoints);

  // Step 2: Smooth
  const smoothed = smoothPathKalman(snapped);

  // Step 3: Compress
  const compressed = compressDouglasPeucker(smoothed);

  // Step 4: Encode
  const encoded = encodePolyline(compressed);

  return {
    snappedPoints: compressed,
    encodedPolyline: encoded,
    meta: {
      rawCount: rawPoints.length,
      snappedCount: snapped.length,
      compressedCount: compressed.length,
      encodedLength: encoded.length,
    },
  };
}

module.exports = {
  snapToRoadsOSRM,
  smoothPathKalman,
  compressDouglasPeucker,
  encodePolyline,
  decodePolyline,
  processTrailPipeline,
  SNAP_THRESHOLD,
};
