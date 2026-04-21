'use client';

import { useEffect, useState } from 'react';
import { Expand, X } from 'lucide-react';

interface MarkerPoint {
  latitude: number;
  longitude: number;
  label: string;
  address?: string | null;
}

export interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
  capturedAt?: string;
}

interface DualLocationMapProps {
  markers: MarkerPoint[];
  /** Optional draft OD route (IN→OUT movement), shown as a polyline */
  routePolyline?: RoutePolylinePoint[];
  /** Google-encoded polyline from road snapping (preferred over raw routePolyline) */
  encodedPolyline?: string | null;
  encodedPolylineOSRM?: string | null;
  encodedPolylineMapbox?: string | null;
  snappedAtOSRM?: string | null;
  snappedAtMapbox?: string | null;
  className?: string;
  height?: string;
}

export default function DualLocationMap({
  markers,
  routePolyline,
  encodedPolyline,
  encodedPolylineOSRM,
  encodedPolylineMapbox,
  snappedAtOSRM,
  snappedAtMapbox,
  className = '',
  height = '180px',
}: DualLocationMapProps) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    markers: MarkerPoint[];
    routePolyline?: RoutePolylinePoint[];
    encodedPolyline?: string | null;
    trailSource?: 'osrm' | 'mapbox' | 'raw';
    height: string;
  }> | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [trailSource, setTrailSource] = useState<'osrm' | 'mapbox' | 'raw'>('osrm');

  const effectiveOSRM = encodedPolylineOSRM || encodedPolyline || null;
  const effectiveMapbox = encodedPolylineMapbox || null;
  const hasOSRM = Boolean(effectiveOSRM);
  const hasMapbox = Boolean(effectiveMapbox);

  useEffect(() => {
    if (hasOSRM) {
      setTrailSource('osrm');
      return;
    }
    if (hasMapbox) {
      setTrailSource('mapbox');
      return;
    }
    setTrailSource('raw');
  }, [hasOSRM, hasMapbox]);

  const selectedEncoded =
    trailSource === 'mapbox'
      ? effectiveMapbox
      : trailSource === 'osrm'
      ? effectiveOSRM
      : null;
  const selectedSnappedAt =
    trailSource === 'mapbox' ? snappedAtMapbox : trailSource === 'osrm' ? snappedAtOSRM : null;

  useEffect(() => {
    import('./DualLocationMapInner').then((mod) => setMapComponent(() => mod.default));
  }, []);

  useEffect(() => {
    if (!isFullscreenOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isFullscreenOpen]);

  useEffect(() => {
    if (!isFullscreenOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreenOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreenOpen]);

  if (!MapComponent) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm ${className}`}
        style={{ height }}
      >
        Loading map...
      </div>
    );
  }

  return (
    <>
      <div className={`relative ${className}`}>
        {(hasOSRM || hasMapbox) && (
          <div className="absolute left-2 top-2 z-[401] rounded-md border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-1 flex items-center gap-1 shadow">
            <button
              type="button"
              onClick={() => setTrailSource('osrm')}
              className={`px-2 py-1 text-[10px] font-bold rounded ${
                trailSource === 'osrm'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              disabled={!hasOSRM}
            >
              OSRM
            </button>
            <button
              type="button"
              onClick={() => setTrailSource('mapbox')}
              className={`px-2 py-1 text-[10px] font-bold rounded ${
                trailSource === 'mapbox'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              disabled={!hasMapbox}
            >
              Mapbox
            </button>
            <button
              type="button"
              onClick={() => setTrailSource('raw')}
              className={`px-2 py-1 text-[10px] font-bold rounded ${
                trailSource === 'raw'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              Raw
            </button>
          </div>
        )}
        <div className="absolute left-2 bottom-2 z-[401] rounded-md border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 shadow">
          {trailSource === 'raw' ? 'Source: Raw GPS' : `Source: ${trailSource.toUpperCase()}`}
          {selectedSnappedAt ? ` • Snapped: ${new Date(selectedSnappedAt).toLocaleString()}` : ''}
        </div>
        <MapComponent
          markers={markers}
          routePolyline={routePolyline}
          encodedPolyline={selectedEncoded}
          trailSource={trailSource}
          height={height}
        />
        <button
          type="button"
          onClick={() => setIsFullscreenOpen(true)}
          className="absolute top-2 right-2 z-[401] inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 bg-white/90 dark:bg-slate-900/90 p-1.5 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow"
          title="Open full screen map"
          aria-label="Open full screen map"
        >
          <Expand className="h-4 w-4" />
        </button>
      </div>

      {isFullscreenOpen && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-[1px]">
          <div className="absolute inset-0 p-3 sm:p-5">
            <div className="relative h-full w-full rounded-2xl overflow-hidden border border-slate-200/20 bg-white dark:bg-slate-900 shadow-2xl">
              <div className="absolute top-2 right-2 z-[1001]">
                <button
                  type="button"
                  onClick={() => setIsFullscreenOpen(false)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-600 bg-white/90 dark:bg-slate-900/90 p-1.5 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 shadow"
                  title="Close full screen map"
                  aria-label="Close full screen map"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <MapComponent
                markers={markers}
                routePolyline={routePolyline}
                encodedPolyline={selectedEncoded}
                trailSource={trailSource}
                height="100%"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
