'use client';

import { useEffect, useState } from 'react';

interface MarkerPoint {
  latitude: number;
  longitude: number;
  label: string;
  address?: string | null;
}

export interface RoutePolylinePoint {
  latitude: number;
  longitude: number;
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

  useEffect(() => {
    import('./DualLocationMapInner').then((mod) => setMapComponent(() => mod.default));
  }, []);

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

  return <MapComponent markers={markers} routePolyline={routePolyline} height={height} />;
}

