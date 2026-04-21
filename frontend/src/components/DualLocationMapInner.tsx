'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MarkerPoint {
  latitude: number;
  longitude: number;
  label: string;
  address?: string | null;
}

interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
  capturedAt?: string;
}

interface DualLocationMapInnerProps {
  markers: MarkerPoint[];
  routePolyline?: RoutePolylinePoint[];
  /** Google-encoded polyline string from road snapping (preferred over raw routePolyline) */
  encodedPolyline?: string | null;
  trailSource?: 'osrm' | 'mapbox' | 'raw';
  height: string;
}

const blueIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const ARROW_ICON = (rotationDeg: number) =>
  L.divIcon({
    className: '',
    html: `<div style="transform: rotate(${rotationDeg}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid #4f46e5; filter: drop-shadow(0 1px 2px rgba(15,23,42,.35));"></div>`,
    iconSize: [12, 10],
    iconAnchor: [6, 5],
  });

const SNAPPED_ARROW_ICON = (rotationDeg: number) =>
  L.divIcon({
    className: '',
    html: `<div style="transform: rotate(${rotationDeg}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid #059669; filter: drop-shadow(0 1px 2px rgba(15,23,42,.35));"></div>`,
    iconSize: [12, 10],
    iconAnchor: [6, 5],
  });

const haversineM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
};

const bearingDeg = (from: L.LatLngTuple, to: L.LatLngTuple) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from[0]);
  const lat2 = toRad(to[0]);
  const dLon = toRad(to[1] - from[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return brng;
};

/**
 * Decode a Google-format encoded polyline string to {latitude, longitude}[].
 */
function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  if (!encoded) return [];
  const points: { latitude: number; longitude: number }[] = [];
  let lat = 0;
  let lng = 0;
  let index = 0;

  while (index < encoded.length) {
    // Decode latitude
    let result = 0;
    let shift = 0;
    let temp: number;
    do {
      temp = encoded.charCodeAt(index++) - 63;
      result |= (temp & 0x1f) << shift;
      shift += 5;
    } while (temp >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    // Decode longitude
    result = 0;
    shift = 0;
    do {
      temp = encoded.charCodeAt(index++) - 63;
      result |= (temp & 0x1f) << shift;
      shift += 5;
    } while (temp >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}

export default function DualLocationMapInner({ markers, routePolyline, encodedPolyline, trailSource = 'osrm', height }: DualLocationMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!markers?.length && (!routePolyline || routePolyline.length < 2) && !encodedPolyline) return;

    const map = L.map(el, { zoom: 15, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const bounds: L.LatLngTuple[] = [];
    const outMarker = (markers || []).find((m) => String(m.label || '').toUpperCase() === 'OUT');
    const outPoint: L.LatLngTuple | null =
      outMarker && Number.isFinite(outMarker.latitude) && Number.isFinite(outMarker.longitude)
        ? [outMarker.latitude, outMarker.longitude]
        : null;

    // Decode snapped polyline if available
    const snappedPoints = encodedPolyline ? decodePolyline(encodedPolyline) : null;
    const hasSnapped = snappedPoints && snappedPoints.length >= 2;

    // --- Render SNAPPED route (provider-specific, solid — road-aligned) ---
    if (hasSnapped) {
      const snappedColor = trailSource === 'mapbox' ? '#0891b2' : '#059669';
      const snappedLatLngs = snappedPoints.map(
        (p) => [p.latitude, p.longitude] as L.LatLngTuple
      );
      const snappedLine = L.polyline(snappedLatLngs, {
        color: snappedColor,
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
      snappedLine.bindTooltip(
        `${trailSource === 'mapbox' ? 'Mapbox' : 'OSRM'} road-aligned route (IN → OUT)`,
        { sticky: true, direction: 'top' }
      );
      snappedLatLngs.forEach((pt) => bounds.push(pt));

      // Directional arrows on snapped route
      const arrowCount = Math.min(10, Math.max(2, Math.floor(snappedLatLngs.length / 4)));
      const step = Math.max(1, Math.floor((snappedLatLngs.length - 1) / arrowCount));
      for (let i = step; i < snappedLatLngs.length; i += step) {
        const prev = snappedLatLngs[Math.max(0, i - 1)];
        const curr = snappedLatLngs[i];
        const angle = bearingDeg(prev, curr);
        L.marker(curr, {
          icon: SNAPPED_ARROW_ICON(angle + 90),
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
    }

    // --- Render RAW route (indigo, dashed — original GPS trail) ---
    let routeForRender = routePolyline || [];
    if (outPoint && routeForRender.length >= 2) {
      const last = routeForRender[routeForRender.length - 1];
      const gapToOut = haversineM(last.latitude, last.longitude, outPoint[0], outPoint[1]);
      if (gapToOut <= 50) {
        routeForRender = routeForRender.slice(0, -1);
      }
    }

    if (routeForRender.length >= 2) {
      const latlngs = routeForRender.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
      const routeLine = L.polyline(latlngs, {
        color: hasSnapped ? '#94a3b8' : '#6366f1',
        weight: hasSnapped ? 2 : 4,
        opacity: hasSnapped ? 0.45 : 0.82,
        dashArray: hasSnapped ? '6, 8' : undefined,
      }).addTo(map);
      routeLine.bindTooltip(
        hasSnapped ? 'Raw GPS trail (reference)' : 'Route direction: IN → OUT',
        { sticky: true, direction: 'top' }
      );
      if (!hasSnapped) {
        latlngs.forEach((pt) => bounds.push(pt));
      }

      // Directional arrowheads (only when no snapped route, to avoid clutter)
      if (!hasSnapped) {
        const arrowCount = Math.min(10, Math.max(2, Math.floor(latlngs.length / 3)));
        const step = Math.max(1, Math.floor((latlngs.length - 1) / arrowCount));
        for (let i = step; i < latlngs.length; i += step) {
          const prev = latlngs[Math.max(0, i - 1)];
          const curr = latlngs[i];
          const angle = bearingDeg(prev, curr);
          const arrowMarker = L.marker(curr, {
            icon: ARROW_ICON(angle + 90),
            interactive: false,
            keyboard: false,
          }).addTo(map);
          const at = routeForRender[i]?.capturedAt;
          if (at) {
            arrowMarker.bindTooltip(`Direction • ${new Date(at).toLocaleTimeString()}`, {
              direction: 'top',
              opacity: 0.9,
            });
          }
        }
      }
    }

    (markers || []).forEach((m, idx) => {
      const point: L.LatLngTuple = [m.latitude, m.longitude];
      bounds.push(point);
      const marker = L.marker(point, { icon: idx === 0 ? blueIcon : redIcon }).addTo(map);
      marker.bindPopup(`<b>${m.label}</b><br/>${m.address || ''}`);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }

    return () => {
      map.remove();
    };
  }, [markers, routePolyline, encodedPolyline, trailSource]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600"
      style={{ height }}
    />
  );
}
