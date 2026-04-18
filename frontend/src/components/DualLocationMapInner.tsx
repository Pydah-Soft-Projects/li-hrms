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
}

interface DualLocationMapInnerProps {
  markers: MarkerPoint[];
  routePolyline?: RoutePolylinePoint[];
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

    if (routePolyline && routePolyline.length >= 2) {
      const latlngs = routePolyline.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
      L.polyline(latlngs, { color: '#6366f1', weight: 4, opacity: 0.82 }).addTo(map);
      latlngs.forEach((pt) => bounds.push(pt));
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
  }, [markers, routePolyline]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600"
      style={{ height }}
    />
  );
}

