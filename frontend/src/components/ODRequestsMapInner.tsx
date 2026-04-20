'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import dayjs from 'dayjs';
import type { ODMapRecord } from './ODRequestsMap';

interface ODRequestsMapInnerProps {
  requests: ODMapRecord[];
  height: string;
  getStatusColor: (status?: string) => string;
  statusColors: Record<string, string>;
}

const toEmployeeName = (record: ODMapRecord) =>
  record.employeeId?.employee_name ||
  [record.employeeId?.first_name, record.employeeId?.last_name].filter(Boolean).join(' ') ||
  'Unknown employee';

const toCoordinates = (record: ODMapRecord) => {
  const lat = record.geoLocation?.latitude ?? record.photoEvidence?.exifLocation?.latitude;
  const lng = record.geoLocation?.longitude ?? record.photoEvidence?.exifLocation?.longitude;
  if (lat == null || lng == null) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
};

const escapeHtml = (value?: string) =>
  String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const toStatusLabel = (status?: string) => (status || 'unknown').replaceAll('_', ' ').toUpperCase();

const buildMarkerIcon = (color: string) =>
  L.divIcon({
    className: '',
    html: `<span style="display:inline-flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(15,23,42,.35));transform:translateY(-2px);">
      <svg width="26" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 22C12 22 19 16 19 10.5C19 6.35786 15.866 3 12 3C8.13401 3 5 6.35786 5 10.5C5 16 12 22 12 22Z" fill="${color}" stroke="#ffffff" stroke-width="1.8" />
        <circle cx="12" cy="10" r="2.8" fill="#ffffff" />
      </svg>
    </span>`,
    iconSize: [26, 36],
    iconAnchor: [13, 34],
  });

export default function ODRequestsMapInner({ requests, height, getStatusColor, statusColors }: ODRequestsMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [layerView, setLayerView] = useState<'pins' | 'heat' | 'both'>('pins');

  const mappedRecords = useMemo(
    () =>
      requests
        .map((record) => {
          const coords = toCoordinates(record);
          if (!coords) return null;
          return { record, coords };
        })
        .filter(Boolean) as Array<{ record: ODMapRecord; coords: { lat: number; lng: number } }>,
    [requests]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mappedRecords.length === 0) return;

    const map = L.map(el, {
      center: [mappedRecords[0].coords.lat, mappedRecords[0].coords.lng],
      zoom: 6,
      scrollWheelZoom: true,
    });

    const normalLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    });
    const googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 20,
      attribution: 'Map data &copy; Google',
    });

    // Default to Google Hybrid so satellite view includes place names.
    googleHybridLayer.addTo(map);
    L.control.layers({ 'Satellite (Google Hybrid)': googleHybridLayer, Street: normalLayer }).addTo(map);

    const bounds = L.latLngBounds([]);
    const groups = new Map<string, L.LayerGroup>();
    const uniqueStatuses = Array.from(new Set(mappedRecords.map((m) => m.record.status || 'unknown')));
    uniqueStatuses.forEach((status) => {
      const group = L.layerGroup();
      groups.set(status, group);
    });

    mappedRecords.forEach(({ record, coords }) => {
      const status = record.status || 'unknown';
      const color = getStatusColor(status);
      const marker = L.marker([coords.lat, coords.lng], { icon: buildMarkerIcon(color) });
      const employeeName = toEmployeeName(record);
      const dateLabel = record.fromDate ? dayjs(record.fromDate).format('DD MMM YYYY') : 'N/A';
      const statusLabel = toStatusLabel(status);

      marker.bindTooltip(
        `<div style="font-size:12px;line-height:1.35">
          <div style="font-weight:700">${escapeHtml(employeeName)}</div>
          <div>${escapeHtml(statusLabel)}</div>
          <div>${escapeHtml(dateLabel)}</div>
        </div>`,
        { sticky: true, direction: 'top', opacity: 0.95 }
      );

      marker.bindPopup(
        `<div style="min-width:220px;font-size:12px;line-height:1.45">
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">${escapeHtml(employeeName)}</div>
          <div><strong>Emp No:</strong> ${escapeHtml(record.employeeId?.emp_no || 'N/A')}</div>
          <div><strong>Status:</strong> ${escapeHtml(statusLabel)}</div>
          <div><strong>OD Date:</strong> ${escapeHtml(dateLabel)}</div>
          <div><strong>OD Type:</strong> ${escapeHtml((record.odType || 'General').replaceAll('_', ' '))}</div>
          <div><strong>Location:</strong> ${escapeHtml(record.placeVisited || record.geoLocation?.address || 'N/A')}</div>
          <div><strong>Purpose:</strong> ${escapeHtml(record.purpose || 'N/A')}</div>
        </div>`
      );

      groups.get(status)?.addLayer(marker);
      bounds.extend([coords.lat, coords.lng]);
    });

    const heatPoints = mappedRecords.map(({ coords }) => [coords.lat, coords.lng, 0.8] as [number, number, number]);
    const heatLayer = (L as any).heatLayer(heatPoints, {
      radius: 26,
      blur: 20,
      maxZoom: 16,
      minOpacity: 0.35,
      gradient: {
        0.2: '#3b82f6',
        0.45: '#22c55e',
        0.65: '#f59e0b',
        0.85: '#f97316',
        1.0: '#ef4444',
      },
    });

    if (layerView === 'pins' || layerView === 'both') {
      groups.forEach((group) => group.addTo(map));
    }
    if (layerView === 'heat' || layerView === 'both') {
      heatLayer.addTo(map);
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.2));
    }

    if (layerView !== 'heat') {
      const overlays: Record<string, L.Layer> = {};
      groups.forEach((group, status) => {
        overlays[status.replaceAll('_', ' ').toUpperCase()] = group;
      });
      L.control.layers(undefined, overlays, { collapsed: true }).addTo(map);
    }

    // Ensure tiles/layout are recalculated after modal mount/animation.
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 120);

    mapRef.current = map;
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
    };
  }, [mappedRecords, getStatusColor, layerView]);

  if (mappedRecords.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4 text-xs text-slate-500 dark:text-slate-400">
        No OD requests with location data found for the selected filters and time range.
      </div>
    );
  }

  const presentStatuses = Array.from(new Set(mappedRecords.map((m) => m.record.status || 'unknown')));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[
          { id: 'pins', label: 'Pins' },
          { id: 'heat', label: 'Heatmap' },
          { id: 'both', label: 'Both' },
        ].map((view) => (
          <button
            key={view.id}
            onClick={() => setLayerView(view.id as 'pins' | 'heat' | 'both')}
            className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-colors ${
              layerView === view.id
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {presentStatuses.map((status) => (
          <span
            key={status}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[status] || '#334155' }} />
            {status.replaceAll('_', ' ')}
          </span>
        ))}
      </div>
      <div
        ref={containerRef}
        className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
        style={{ height }}
      />
    </div>
  );
}
