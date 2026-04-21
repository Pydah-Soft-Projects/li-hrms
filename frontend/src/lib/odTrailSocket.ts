import { io, Socket } from 'socket.io-client';
import { auth } from './auth';

type TrailPoint = {
  latitude: number;
  longitude: number;
  capturedAt?: string;
  address?: string;
  accuracy?: number;
  heading?: number;
  speed?: number;
  source?: 'web' | 'mobile' | 'unknown';
};

let socket: Socket | null = null;

const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.0.36:5000/api';
const socketBase = apiBase.replace(/\/api\/?$/, '');

function getSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  if (socket?.connected) return socket;
  const token = auth.getToken();
  if (!token) return null;
  if (!socket) {
    socket = io(socketBase, {
      transports: ['websocket', 'polling'],
      auth: { token: `Bearer ${token}` },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
    });
  } else if (!socket.connected) {
    socket.auth = { token: `Bearer ${token}` };
    socket.connect();
  }
  return socket;
}

export function joinOdTrailRoom(odId: string): Promise<boolean> {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s || !odId) return resolve(false);
    s.emit('od_trail:join', { odId }, (ack?: { success?: boolean }) => {
      resolve(Boolean(ack?.success));
    });
  });
}

export function leaveOdTrailRoom(odId: string): void {
  const s = getSocket();
  if (!s || !odId) return;
  s.emit('od_trail:leave', { odId });
}

export function publishOdTrailPoints(
  odId: string,
  points: TrailPoint[],
  client: 'web' | 'mobile' = 'web'
): Promise<boolean> {
  return new Promise((resolve) => {
    const s = getSocket();
    if (!s || !odId || !points.length) return resolve(false);
    s.emit('od_trail:publish', { odId, points, client }, (ack?: { success?: boolean }) => {
      resolve(Boolean(ack?.success));
    });
  });
}

export function subscribeOdTrailUpdates(
  odId: string,
  onPoints: (points: TrailPoint[]) => void
): () => void {
  const s = getSocket();
  if (!s || !odId) return () => {};
  const handler = (payload: { odId?: string; points?: TrailPoint[] }) => {
    if (!payload || String(payload.odId || '') !== String(odId)) return;
    if (Array.isArray(payload.points) && payload.points.length) {
      onPoints(payload.points);
    }
  };
  s.on('od_trail:update', handler);
  return () => {
    s.off('od_trail:update', handler);
  };
}

/**
 * Subscribe to road-snapped polyline updates for an OD.
 * Fires when the backend finishes the OSRM pipeline on accumulated trail points.
 */
export function subscribeOdTrailSnappedUpdates(
  odId: string,
  onSnapped: (data: {
    encodedPolyline: string | null;
    snappedPoints: { latitude: number; longitude: number }[];
    providers: {
      osrm: { encodedPolyline: string | null; snappedPoints: { latitude: number; longitude: number }[]; snappedAt: string | null };
      mapbox: { encodedPolyline: string | null; snappedPoints: { latitude: number; longitude: number }[]; snappedAt: string | null };
    };
  }) => void
): () => void {
  const s = getSocket();
  if (!s || !odId) return () => {};
  const handler = (payload: {
    odId?: string;
    encodedPolyline?: string | null;
    snappedPoints?: { latitude: number; longitude: number }[];
    providers?: {
      osrm?: { encodedPolyline?: string | null; snappedPoints?: { latitude: number; longitude: number }[]; snappedAt?: string | null };
      mapbox?: { encodedPolyline?: string | null; snappedPoints?: { latitude: number; longitude: number }[]; snappedAt?: string | null };
    };
  }) => {
    if (!payload || String(payload.odId || '') !== String(odId)) return;
    onSnapped({
      encodedPolyline: payload.encodedPolyline ?? null,
      snappedPoints: Array.isArray(payload.snappedPoints) ? payload.snappedPoints : [],
      providers: {
        osrm: {
          encodedPolyline: payload.providers?.osrm?.encodedPolyline ?? null,
          snappedPoints: Array.isArray(payload.providers?.osrm?.snappedPoints) ? payload.providers.osrm.snappedPoints : [],
          snappedAt: payload.providers?.osrm?.snappedAt ?? null,
        },
        mapbox: {
          encodedPolyline: payload.providers?.mapbox?.encodedPolyline ?? null,
          snappedPoints: Array.isArray(payload.providers?.mapbox?.snappedPoints) ? payload.providers.mapbox.snappedPoints : [],
          snappedAt: payload.providers?.mapbox?.snappedAt ?? null,
        },
      },
    });
  };
  s.on('od_trail:snapped_update', handler);
  return () => {
    s.off('od_trail:snapped_update', handler);
  };
}

