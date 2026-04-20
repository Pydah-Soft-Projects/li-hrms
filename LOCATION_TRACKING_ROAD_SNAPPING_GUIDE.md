# 🗺️ Location Tracking with Road Snapping - Complete Implementation Guide

## Problem You're Solving

**Current Issue:**
- Raw GPS points are drawn as **straight lines** between coordinates
- Path ignores actual road network (goes through buildings, fields, etc.)
- Visualization is unrealistic and hard to verify field movements

**Solution:**
- Snap GPS points to actual roads using **Google Roads API**, **OSRM**, or **Mapbox**
- Draw smooth polylines that follow real road geometry
- Reduce noise and compress coordinates

---

## Your Current Architecture Overview

### ✅ What You Already Have:

**Mobile (React Native/Expo):**
- `odLocationTrailBackground.ts` → Captures GPS every 3-5s
- Throttles by **35m distance OR 50s time** → Prevents spam
- Sends in 40-point batches to backend

**Backend (Node.js):**
- Socket.IO server (`socketService.js`) → Real-time broadcasting
- REST API → Stores raw points in DB
- `odTrailService.js` → Normalizes/validates GPS points

**Frontend (React + Leaflet):**
- `DualLocationMapInner.tsx` → Renders polyline from raw points
- Adds bearing-based arrows for direction
- **Current visualization = straight lines between raw points** ❌

---

## 🔥 Step-by-Step Implementation

### Phase 1: Choose Road Snapping Provider

#### **Option A: Google Roads API (Recommended)**
```javascript
// Pros: Most accurate, includes speed limits, lane info
// Cons: Costs ≈ $0.008 per point ($0.40 per 100 points)
// Free Tier: 25,000 requests/day

// Example cost: 1000 points/day = $3-4/month per active employee
```

#### **Option B: OSRM (Open-source, FREE)**
```javascript
// Pros: Free, self-hosted or public server
// Cons: Less accurate than Google, simpler
// Good for: Private deployments, cost-sensitive

// OSRM Public: https://router.project-osrm.org/match/v1/driving/polyline
```

#### **Option C: Mapbox (Balanced)**
```javascript
// Pros: Good accuracy, built-in map matching
// Cons: API credits (~$0.50 per 1000 requests)
// Good for: Integrated map solution
```

**RECOMMENDATION:** Start with **OSRM** (free), upgrade to **Google** if accuracy matters.

---

### Phase 2: Backend - Add Road Snapping Service

**New File:** `backend/shared/services/roadSnapService.js`

```javascript
const axios = require('axios');

class RoadSnapService {
  constructor() {
    // Choose your provider
    this.provider = process.env.ROAD_SNAP_PROVIDER || 'osrm'; // 'osrm', 'google', 'mapbox'
    this.googleKey = process.env.GOOGLE_ROADS_API_KEY;
    this.mapboxKey = process.env.MAPBOX_API_TOKEN;
  }

  /**
   * Snap raw GPS points to nearest roads
   * @param {Array} points - [{ latitude, longitude }]
   * @returns {Array} Snapped polyline coordinates
   */
  async snapPointsToRoads(points) {
    if (!points || points.length < 2) return points;

    try {
      if (this.provider === 'google') {
        return await this.snapWithGoogle(points);
      } else if (this.provider === 'mapbox') {
        return await this.snapWithMapbox(points);
      } else {
        return await this.snapWithOSRM(points);
      }
    } catch (error) {
      console.error('[Road Snap] Error:', error.message);
      // Fallback to raw points if snapping fails
      return points;
    }
  }

  /**
   * ============================================
   * OSRM Implementation (FREE, Self-hosted)
   * ============================================
   */
  async snapWithOSRM(points) {
    if (points.length < 2) return points;

    try {
      // Convert to OSRM format: [lng,lat;lng,lat;...]
      const coords = points
        .map((p) => `${p.longitude},${p.latitude}`)
        .join(';');

      const url = `${process.env.OSRM_SERVER || 'https://router.project-osrm.org'}/match/v1/driving/${coords}`;

      const response = await axios.get(url, {
        params: {
          geometries: 'geojson',
          overview: 'full',
          steps: false,
          annotations: 'speed,duration',
          timestamps: points.map((p) => {
            const ts = p.capturedAt 
              ? new Date(p.capturedAt).getTime() / 1000 
              : Date.now() / 1000;
            return Math.floor(ts);
          }),
        },
        timeout: 10000,
      });

      if (!response.data.matchings || response.data.matchings.length === 0) {
        return points;
      }

      // Extract snapped geometry
      const matched = response.data.matchings[0];
      const snappedCoords = matched.geometry.coordinates;

      // Convert [lng,lat] → { latitude, longitude }
      return snappedCoords.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
    } catch (error) {
      console.error('[OSRM] Snap failed, returning raw points:', error.message);
      return points;
    }
  }

  /**
   * ============================================
   * Google Roads API Implementation
   * ============================================
   */
  async snapWithGoogle(points) {
    if (!this.googleKey) {
      throw new Error('GOOGLE_ROADS_API_KEY not configured');
    }

    if (points.length < 2) return points;

    try {
      // Google Roads API accepts up to 100 points per request
      const batches = [];
      for (let i = 0; i < points.length; i += 100) {
        batches.push(points.slice(i, i + 100));
      }

      let allSnapped = [];
      for (const batch of batches) {
        const response = await axios.post(
          'https://roads.googleapis.com/v1/snapToRoads',
          {
            points: batch.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            })),
            interpolate: true, // Interpolate between snapped points for smooth path
          },
          {
            params: { key: this.googleKey },
            timeout: 10000,
          }
        );

        if (response.data.snappedPoints) {
          allSnapped = allSnapped.concat(
            response.data.snappedPoints.map((sp) => ({
              latitude: sp.location.latitude,
              longitude: sp.location.longitude,
              confidence: sp.confidence, // 0-1, higher = better match
            }))
          );
        }
      }

      return allSnapped.length > 0 ? allSnapped : points;
    } catch (error) {
      console.error('[Google Roads] Snap failed:', error.message);
      return points;
    }
  }

  /**
   * ============================================
   * Mapbox Map Matching Implementation
   * ============================================
   */
  async snapWithMapbox(points) {
    if (!this.mapboxKey) {
      throw new Error('MAPBOX_API_TOKEN not configured');
    }

    if (points.length < 2) return points;

    try {
      // Mapbox format: [lng,lat;lng,lat;...]
      const coords = points
        .map((p) => `${p.longitude},${p.latitude}`)
        .join(';');

      const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}`;

      const response = await axios.get(url, {
        params: {
          geometries: 'geojson',
          overview: 'full',
          access_token: this.mapboxKey,
        },
        timeout: 10000,
      });

      if (!response.data.matchings || response.data.matchings.length === 0) {
        return points;
      }

      const matched = response.data.matchings[0];
      const snappedCoords = matched.geometry.coordinates;

      return snappedCoords.map(([lng, lat]) => ({
        latitude: lat,
        longitude: lng,
      }));
    } catch (error) {
      console.error('[Mapbox] Snap failed:', error.message);
      return points;
    }
  }

  /**
   * ============================================
   * Post-Processing: Smooth & Compress
   * ============================================
   */

  /**
   * Reduce jitter using Kalman filter (lightweight)
   */
  smoothPathKalman(points, processNoise = 0.001, measurementNoise = 10) {
    if (points.length < 2) return points;

    const smoothed = [];
    let prevLat = points[0].latitude;
    let prevLng = points[0].longitude;
    let prevLatError = 1;
    let prevLngError = 1;

    smoothed.push({ latitude: prevLat, longitude: prevLng });

    for (let i = 1; i < points.length; i++) {
      const point = points[i];

      // Predict
      const predictedLatError = prevLatError + processNoise;
      const predictedLngError = prevLngError + processNoise;

      // Update
      const kalmanGainLat = predictedLatError / (predictedLatError + measurementNoise);
      const kalmanGainLng = predictedLngError / (predictedLngError + measurementNoise);

      const smoothedLat = prevLat + kalmanGainLat * (point.latitude - prevLat);
      const smoothedLng = prevLng + kalmanGainLng * (point.longitude - prevLng);

      prevLatError = (1 - kalmanGainLat) * predictedLatError;
      prevLngError = (1 - kalmanGainLng) * predictedLngError;
      prevLat = smoothedLat;
      prevLng = smoothedLng;

      smoothed.push({ latitude: smoothedLat, longitude: smoothedLng });
    }

    return smoothed;
  }

  /**
   * Douglas-Peucker Algorithm: Reduce points while maintaining shape
   * (reduces API quota usage + improves performance)
   */
  compressPolyline(points, tolerance = 0.00005) {
    // tolerance in degrees ≈ 5.5m at equator
    if (points.length < 3) return points;

    const dmax = (p, start, end) => {
      let max = 0;
      let index = 0;
      const dx = end.longitude - start.longitude;
      const dy = end.latitude - start.latitude;
      const denom = Math.sqrt(dx * dx + dy * dy);

      for (let i = start === points[0] ? 1 : 0; i < points.length - 1; i++) {
        let d = Math.abs(dy * p[i].longitude - dx * p[i].latitude + end.longitude * start.latitude - end.latitude * start.longitude) / denom;
        if (d > max) {
          max = d;
          index = i;
        }
      }
      return { max, index };
    };

    const rdp = (pts, tol) => {
      const { max: dmax_val, index } = dmax(pts, pts[0], pts[pts.length - 1]);
      if (dmax_val > tol) {
        const left = rdp(pts.slice(0, index + 1), tol);
        const right = rdp(pts.slice(index), tol);
        return left.slice(0, -1).concat(right);
      }
      return [pts[0], pts[pts.length - 1]];
    };

    return rdp(points, tolerance);
  }

  /**
   * Encoded Polyline Format (Google)
   * Reduces storage by ~80%
   */
  encodePolyline(points) {
    let encoded = '';
    let prevLat = 0, prevLng = 0;

    for (const point of points) {
      const lat = Math.round(point.latitude * 1e5);
      const lng = Math.round(point.longitude * 1e5);

      const dlat = lat - prevLat;
      const dlng = lng - prevLng;

      [dlat, dlng].forEach(delta => {
        let val = delta << 1;
        if (delta < 0) val = ~val;

        let chunk = '';
        do {
          let tmp = val & 0x1f;
          val >>= 5;
          if (val > 0) tmp |= 0x20;
          chunk += String.fromCharCode(tmp + 63);
        } while (val > 0);

        encoded += chunk;
      });

      prevLat = lat;
      prevLng = lng;
    }

    return encoded;
  }

  decodePolyline(encoded) {
    let points = [];
    let lat = 0, lng = 0;
    let index = 0;

    while (index < encoded.length) {
      let result = 0, shift = 0, temp;
      do {
        temp = encoded.charCodeAt(index++) - 63;
        result |= (temp & 0x1f) << shift;
        shift += 5;
      } while (temp >= 0x20);

      let dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      result = 0;
      shift = 0;
      do {
        temp = encoded.charCodeAt(index++) - 63;
        result |= (temp & 0x1f) << shift;
        shift += 5;
      } while (temp >= 0x20);

      let dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }

    return points;
  }
}

module.exports = new RoadSnapService();
```

---

### Phase 3: Update OD Trail Service to Use Road Snapping

**File:** `backend/leaves/services/odTrailService.js`

```javascript
const roadSnapService = require('../../shared/services/roadSnapService');

// Add this function to process trails with road snapping
async function processTrailWithRoadSnapping(odId, rawPoints) {
  try {
    // 1. Snap points to roads
    const snappedPoints = await roadSnapService.snapPointsToRoads(rawPoints);

    // 2. Smooth the path (remove jitter)
    const smoothedPoints = roadSnapService.smoothPathKalman(snappedPoints);

    // 3. Compress (reduce points by 30-40%)
    const compressedPoints = roadSnapService.compressPolyline(smoothedPoints);

    // 4. Encode for storage
    const encodedPolyline = roadSnapService.encodePolyline(compressedPoints);

    // Store compressed data
    return {
      rawPoints, // Keep for debugging
      snappedPoints: compressedPoints,
      encodedPolyline, // For efficient storage/transfer
      processedAt: new Date(),
    };
  } catch (error) {
    console.error('[Trail Processing] Error:', error);
    return { rawPoints, snappedPoints: rawPoints }; // Fallback
  }
}

module.exports = { ...exports, processTrailWithRoadSnapping };
```

---

### Phase 4: Update OD Controller Endpoint

**File:** `backend/leaves/controllers/odController.js` (Update appendODLocationTrail)

```javascript
const roadSnapService = require('../../shared/services/roadSnapService');
const { processTrailWithRoadSnapping } = require('../services/odTrailService');

// Modify the appendODLocationTrail function
async function appendODLocationTrail(req, res) {
  try {
    const { id: odId } = req.params;
    const { points, client } = req.body;

    // ... existing validation ...

    // NEW: Process points with road snapping
    const processedTrail = await processTrailWithRoadSnapping(odId, points);

    // Store BOTH raw and snapped versions
    const od = await OD.findByIdAndUpdate(
      odId,
      {
        $push: {
          locationTrail: {
            rawPoints: processedTrail.rawPoints,
            snappedPoints: processedTrail.snappedPoints,
            encodedPolyline: processedTrail.encodedPolyline,
            version: 2, // Track format version
            processedAt: processedTrail.processedAt,
            source: client,
          },
        },
      },
      { new: true }
    );

    // Broadcast snapped points to frontend (not raw)
    emitOdTrailUpdate(odId, processedTrail.snappedPoints);

    res.json({ success: true, pointsProcessed: points.length });
  } catch (error) {
    console.error('[appendODLocationTrail]', error);
    res.status(500).json({ error: error.message });
  }
}

// Don't forget to export
module.exports.appendODLocationTrail = appendODLocationTrail;
```

---

### Phase 5: Update Frontend to Use Snapped Points

**File:** `frontend/src/components/DualLocationMapInner.tsx`

```tsx
// Add this helper to decode polyline
const decodePolyline = (encoded: string): Array<[number, number]> => {
  let points: Array<[number, number]> = [];
  let lat = 0, lng = 0;
  let index = 0;

  while (index < encoded.length) {
    let result = 0, shift = 0, temp;
    do {
      temp = encoded.charCodeAt(index++) - 63;
      result |= (temp & 0x1f) << shift;
      shift += 5;
    } while (temp >= 0x20);

    let dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      temp = encoded.charCodeAt(index++) - 63;
      result |= (temp & 0x1f) << shift;
      shift += 5;
    } while (temp >= 0x20);

    let dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
};

// Update the main component
export default function DualLocationMapInner({ 
  markers, 
  routePolyline, 
  encodedPolyline, // NEW: Add this prop
  height 
}: DualLocationMapInnerProps & { encodedPolyline?: string }) {
  // ... existing code ...

  useEffect(() => {
    // ... existing setup ...

    // Use snapped route if available, otherwise fall back to raw points
    let routeForRender = routePolyline || [];
    
    if (encodedPolyline) {
      // Decode the snapped polyline
      const decoded = decodePolyline(encodedPolyline);
      routeForRender = decoded.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng,
      }));
    }

    if (routeForRender.length >= 2) {
      const latlngs = routeForRender.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
      
      // NEW: Use dashed style for snapped vs solid for raw
      const isSnapped = !!encodedPolyline;
      const routeLine = L.polyline(latlngs, { 
        color: isSnapped ? '#22c55e' : '#6366f1', // Green for snapped, indigo for raw
        weight: 4, 
        opacity: 0.82,
        dashArray: isSnapped ? '5, 10' : undefined, // Dashed if snapped
      }).addTo(map);
      
      const routeLabel = isSnapped 
        ? 'Real Road Path (Snapped to Roads)' 
        : 'GPS Points (Raw)';
      routeLine.bindTooltip(routeLabel, { sticky: true, direction: 'top' });

      // ... rest of existing code for arrows, bounds, etc. ...
    }
  }, [markers, routePolyline, encodedPolyline]);
}
```

---

## 📊 Configuration & Settings

**File:** `.env`

```bash
# Road Snapping Provider
ROAD_SNAP_PROVIDER=osrm          # Options: osrm, google, mapbox

# Google Roads API (if using Google)
GOOGLE_ROADS_API_KEY=<your-key>

# Mapbox (if using Mapbox)
MAPBOX_API_TOKEN=<your-token>

# OSRM Server (if self-hosted)
OSRM_SERVER=https://router.project-osrm.org

# Feature Flags
ENABLE_ROAD_SNAPPING=true
ENABLE_PATH_SMOOTHING=true
ENABLE_POLYLINE_COMPRESSION=true
```

---

## 🚀 Deployment Checklist

### Before Going Live:

- [ ] Set up road snapping provider account (Google/Mapbox)
- [ ] Configure API keys in `.env`
- [ ] Test with sample GPS trails (5+ employees)
- [ ] Verify snapped paths are accurate (compare with street view)
- [ ] Monitor API costs/quotas
- [ ] Update database schema to store `encodedPolyline`
- [ ] Add migration script to process old trails
- [ ] Test fallback behavior (when snapping fails)
- [ ] Update frontend to display snapped vs raw routes

---

## 📈 Expected Improvements

| Metric | Before | After |
|--------|--------|-------|
| Visual Accuracy | Straight lines through buildings | Real road paths ✅ |
| Route Length | Incorrect (shorter) | Accurate (+10-20%) |
| API Calls | Every location point (100+/shift) | Batched, compressed (10-20/shift) |
| Storage | Raw points (~500 bytes/point) | Encoded polyline (~2 bytes/point) |
| Load Time | Medium (large arrays) | Fast (encoded format) |

---

## 💡 Pro Tips

1. **Process trails offline** (after OD ends, not real-time)
2. **Batch process** every 50 points to avoid API limits
3. **Cache snapped results** to avoid re-processing
4. **Use OSRM for MVP**, migrate to Google when accuracy critical
5. **Add confidence scores** to identify problematic GPS readings
6. **Monitor API costs** monthly

---

## 🔗 Reference Links

- **OSRM Docs:** https://project-osrm.org/docs/v5.24.0/api/match-service/
- **Google Roads API:** https://developers.google.com/maps/documentation/roads/overview
- **Mapbox Matching:** https://docs.mapbox.com/api/navigation/map-matching/
- **Douglas-Peucker:** https://en.wikipedia.org/wiki/Ramer%E2%80%93Douglas%E2%80%93Peucker_algorithm
- **Polyline Encoding:** https://developers.google.com/maps/documentation/utilities/polylinealgorithm

---

## Questions to Consider

**Q: Should I snap in real-time or after OD ends?**
A: **After OD ends** (batch process). Real-time snapping = higher API costs + latency.

**Q: Which provider should I choose?**
A: **OSRM for MVP** (free), **Google for production** (most accurate).

**Q: Will snappy paths work with Socket.IO broadcasting?**
A: Yes! Emit encoded polyline instead of array of points → **80% smaller messages**.

**Q: What about old trails? Do I need to reprocess?**
A: **Optional**. Keep raw points, add snapped version gradually.
