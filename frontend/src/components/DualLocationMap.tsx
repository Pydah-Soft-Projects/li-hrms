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
  className?: string;
  height?: string;
}

export default function DualLocationMap({ markers, routePolyline, className = '', height = '180px' }: DualLocationMapProps) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    markers: MarkerPoint[];
    routePolyline?: RoutePolylinePoint[];
    height: string;
  }> | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

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
        <MapComponent markers={markers} routePolyline={routePolyline} height={height} />
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
              <MapComponent markers={markers} routePolyline={routePolyline} height="100%" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

