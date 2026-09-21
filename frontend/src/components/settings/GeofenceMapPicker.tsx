'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { RefreshCw } from 'lucide-react';

const GeofenceMapPickerInner = dynamic(
  () => import('./GeofenceMapPickerInner'),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/50 flex flex-col items-center justify-center text-slate-500 gap-2">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
        <span className="text-sm font-medium">Loading interactive geofence map...</span>
      </div>
    ),
  }
);

interface GeofenceMapPickerProps {
  lat: number;
  lng: number;
  radiusMeters: number;
  locationName: string;
  onSelectLocation: (lat: number, lng: number, name?: string) => void;
  height?: string;
}

export default function GeofenceMapPicker(props: GeofenceMapPickerProps) {
  return <GeofenceMapPickerInner {...props} />;
}
