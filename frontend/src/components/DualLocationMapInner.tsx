'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MarkerPoint {
  latitude: number;
  longitude: number;
  label: string;
  address?: string | null;
  photoUrl?: string | null;
  timestamp?: string | number | Date | null;
  odDateRange?: string | null;
}

interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
  capturedAt?: string;
}

interface DualLocationMapInnerProps {
  markers: MarkerPoint[];
  routePolyline?: RoutePolylinePoint[];
  height: string;
}

const ARROW_ICON = (rotationDeg: number) =>
  L.divIcon({
    className: '',
    html: `<div style="transform: rotate(${rotationDeg}deg); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 10px solid #4f46e5; filter: drop-shadow(0 1px 2px rgba(15,23,42,.35));"></div>`,
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

export default function DualLocationMapInner({ markers, routePolyline, height }: DualLocationMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!markers?.length && (!routePolyline || routePolyline.length < 2)) return;

    const map = L.map(el, { zoom: 15, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const bounds: L.LatLngTuple[] = [];
    const outMarker = (markers || []).find((m) => String(m.label || '').toUpperCase().includes('OUT'));
    const outPoint: L.LatLngTuple | null =
      outMarker && Number.isFinite(outMarker.latitude) && Number.isFinite(outMarker.longitude)
        ? [outMarker.latitude, outMarker.longitude]
        : null;

    let routeForRender = routePolyline || [];
    if (outPoint && routeForRender.length >= 2) {
      const last = routeForRender[routeForRender.length - 1];
      const gapToOut = haversineM(last.latitude, last.longitude, outPoint[0], outPoint[1]);
      // If trail already reaches very near OD OUT, avoid visually merging/connecting with OUT marker.
      if (gapToOut <= 50) {
        routeForRender = routeForRender.slice(0, -1);
      }
    }

    if (routeForRender.length >= 2) {
      const latlngs = routeForRender.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
      const routeLine = L.polyline(latlngs, { color: '#6366f1', weight: 4, opacity: 0.82 }).addTo(map);
      routeLine.bindTooltip('Route direction: IN → OUT', { sticky: true, direction: 'top' });
      latlngs.forEach((pt) => bounds.push(pt));

      // Add directional arrowheads along the path for clearer movement direction.
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

    (markers || []).forEach((m) => {
      const point: L.LatLngTuple = [m.latitude, m.longitude];
      bounds.push(point);

      const isOut = String(m.label || '').toUpperCase().includes('OUT');
      const themeColor = isOut ? '#ef4444' : '#22c55e';

      let customIcon: L.DivIcon;
      if (m.photoUrl) {
        customIcon = L.divIcon({
          className: '',
          html: `
            <div style="position: relative; width: 46px; height: 56px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.35)); cursor: pointer;">
              <div style="width: 46px; height: 46px; border-radius: 50%; border: 3px solid ${themeColor}; background: #ffffff; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15);">
                <img src="${m.photoUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" alt="${m.label}" />
              </div>
              <div style="position: absolute; bottom: 0px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-top: 10px solid ${themeColor};"></div>
              <div style="position: absolute; top: -6px; right: -4px; background: ${themeColor}; color: white; font-size: 9px; font-weight: 900; padding: 1px 5px; border-radius: 8px; border: 1.5px solid white; text-transform: uppercase; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">
                ${m.label}
              </div>
            </div>
          `,
          iconSize: [46, 56],
          iconAnchor: [23, 56],
          popupAnchor: [0, -56],
        });
      } else {
        customIcon = L.divIcon({
          className: '',
          html: `
            <div style="position: relative; width: 34px; height: 44px; filter: drop-shadow(0 3px 5px rgba(0,0,0,0.3)); cursor: pointer;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: ${themeColor}; border: 2.5px solid #ffffff; display: flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-size: 11px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                ${m.label.substring(0, 3)}
              </div>
              <div style="position: absolute; bottom: 0px; left: 50%; transform: translateX(-50%); width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 9px solid ${themeColor};"></div>
            </div>
          `,
          iconSize: [34, 44],
          iconAnchor: [17, 44],
          popupAnchor: [0, -44],
        });
      }

      const marker = L.marker(point, { icon: customIcon }).addTo(map);

      const formattedDateTime = m.timestamp
        ? new Date(m.timestamp).toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          })
        : null;

      const cardHtml = `
        <div style="min-width: 175px; max-width: 195px; font-family: system-ui, -apple-system, sans-serif; padding: 4px; background: #ffffff; box-sizing: border-box;">
          ${m.photoUrl ? `
            <div style="width: 100%; aspect-ratio: 1/1; border-radius: 8px; overflow: hidden; margin-bottom: 6px; border: 1px solid #e2e8f0; background: #0f172a; position: relative; box-shadow: 0 2px 6px rgba(0,0,0,0.12);">
              <a href="${m.photoUrl}" target="_blank" rel="noopener noreferrer" title="Click to view full photo">
                <img src="${m.photoUrl}" style="width: 100%; height: 100%; object-fit: cover; aspect-ratio: 1/1; display: block;" alt="${m.label} Photo Evidence" />
              </a>
              <span style="position: absolute; bottom: 4px; right: 4px; background: rgba(15,23,42,0.85); color: #ffffff; font-size: 8px; font-weight: 700; padding: 1.5px 5px; border-radius: 4px; backdrop-filter: blur(4px); text-transform: uppercase;">
                1:1 Photo
              </span>
            </div>
          ` : ''}
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; gap: 4px;">
            <span style="font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; color: ${themeColor}; background: ${isOut ? '#fef2f2' : '#f0fdf4'}; padding: 2px 6px; border-radius: 5px; border: 1px solid ${isOut ? '#fecaca' : '#bbf7d0'};">
              ${m.label}
            </span>
            ${m.timestamp ? `<span style="font-size: 9px; font-weight: 600; color: #64748b; background: #f1f5f9; padding: 1.5px 5px; border-radius: 4px;">${new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>` : ''}
          </div>
          ${m.odDateRange ? `
            <div style="font-size: 10px; color: #0f172a; margin-bottom: 4px; display: flex; align-items: baseline; justify-content: space-between; gap: 6px; line-height: 1.3;">
              <span style="font-weight: 600; color: #64748b; shrink: 0; white-space: nowrap;">OD Date:</span>
              <span style="font-weight: 600; text-align: right;">${m.odDateRange}</span>
            </div>
          ` : ''}
          ${formattedDateTime ? `
            <div style="font-size: 10px; color: #0f172a; margin-bottom: 4px; display: flex; align-items: baseline; justify-content: space-between; gap: 6px; line-height: 1.3;">
              <span style="font-weight: 600; color: #64748b; shrink: 0; white-space: nowrap;">Recorded:</span>
              <span style="font-weight: 500; text-align: right;">${formattedDateTime}</span>
            </div>
          ` : ''}
          ${m.address ? `
            <div style="font-size: 9.5px; color: #334155; margin-top: 4px; padding: 4px 6px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; line-height: 1.3; max-height: 50px; overflow-y: auto;">
              📍 ${m.address}
            </div>
          ` : ''}
        </div>
      `;

      marker.bindTooltip(cardHtml, {
        direction: 'top',
        offset: [0, -45],
        opacity: 1,
        interactive: true,
        className: 'custom-leaflet-tooltip-forward',
      });
      marker.bindPopup(cardHtml, { maxWidth: 260, className: 'custom-leaflet-popup-forward' });
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [60, 60] });
    }

    // Inject tooltip z-index styles once
    const styleId = 'leaflet-tooltip-fix';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .leaflet-tooltip-pane { z-index: 99999 !important; }
        .leaflet-popup-pane { z-index: 99999 !important; }
        .leaflet-tooltip.custom-leaflet-tooltip-forward {
          z-index: 99999 !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
          padding: 0 !important;
          overflow: visible !important;
        }
        .od-map-wrap { overflow: visible !important; }
        .od-map-wrap .leaflet-container { overflow: visible !important; }
      `;
      document.head.appendChild(style);
    }

    return () => {
      map.remove();
    };
  }, [markers, routePolyline]);

  return (
    <div
      className="od-map-wrap relative rounded-xl border border-slate-200 dark:border-slate-600"
      style={{ height, overflow: 'visible' }}
    >
      <div
        ref={containerRef}
        className="absolute inset-0 rounded-xl"
        style={{ overflow: 'visible' }}
      />
    </div>
  );
}

