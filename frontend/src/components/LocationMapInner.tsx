'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix default marker icon (Leaflet's default paths break with bundlers)
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface LocationMapInnerProps {
  lat: number;
  lng: number;
  address?: string | null;
  height: string;
}

/**
 * Uses imperative Leaflet API so we create/destroy the map in useEffect.
 * Avoids "Map container is already initialized" from react-leaflet + React Strict Mode / remounts.
 */
export default function LocationMapInner({ lat, lng, address, height }: LocationMapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = L.map(el, {
      center: [lat, lng],
      zoom: 15,
      scrollWheelZoom: false,
    });

    const normalLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });

    const googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    });

    // Default to Google Hybrid so satellite view includes place names.
    googleHybridLayer.addTo(map);
    L.control.layers({ 'Satellite (Google Hybrid)': googleHybridLayer, Street: normalLayer }).addTo(map);

    const marker = L.marker([lat, lng], { icon: defaultIcon }).addTo(map);
    if (address) {
      marker.bindPopup(address);
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lng, address]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600"
      style={{ height }}
    />
  );
}
