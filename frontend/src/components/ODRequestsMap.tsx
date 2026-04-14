'use client';

import { useEffect, useState } from 'react';

export interface ODMapRecord {
  _id: string;
  status?: string;
  fromDate?: string;
  toDate?: string;
  odType?: string;
  purpose?: string;
  placeVisited?: string;
  employeeId?: {
    employee_name?: string;
    first_name?: string;
    last_name?: string;
    emp_no?: string;
  };
  geoLocation?: {
    latitude?: number;
    longitude?: number;
    address?: string;
  };
  photoEvidence?: {
    exifLocation?: {
      latitude?: number;
      longitude?: number;
    };
  };
}

interface ODRequestsMapProps {
  requests: ODMapRecord[];
  height?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  reporting_manager_approved: '#6366f1',
  manager_approved: '#3b82f6',
  hod_approved: '#06b6d4',
  hr_approved: '#14b8a6',
  principal_approved: '#0ea5e9',
  approved: '#16a34a',
  reporting_manager_rejected: '#ef4444',
  manager_rejected: '#dc2626',
  hod_rejected: '#b91c1c',
  hr_rejected: '#991b1b',
  principal_rejected: '#7f1d1d',
  rejected: '#e11d48',
  cancelled: '#64748b',
};

const getStatusColor = (status?: string) => STATUS_COLORS[status || ''] || '#334155';

export default function ODRequestsMap({ requests, height = '420px' }: ODRequestsMapProps) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    requests: ODMapRecord[];
    height: string;
    getStatusColor: (status?: string) => string;
    statusColors: Record<string, string>;
  }> | null>(null);

  useEffect(() => {
    import('./ODRequestsMapInner').then((mod) => setMapComponent(() => mod.default));
  }, []);

  if (!MapComponent) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-sm border border-slate-200 dark:border-slate-700"
        style={{ height }}
      >
        Loading OD map...
      </div>
    );
  }

  return (
    <MapComponent
      requests={requests}
      height={height}
      getStatusColor={getStatusColor}
      statusColors={STATUS_COLORS}
    />
  );
}
