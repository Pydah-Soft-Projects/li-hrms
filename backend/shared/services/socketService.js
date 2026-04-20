const { Server } = require('socket.io');
const { authenticateSocket } = require('./socketAuthService');
const { appendOdTrailPoints, canViewOdTrail } = require('../../leaves/services/odTrailService');
const OD = require('../../leaves/model/OD');

let io;
const SOCKET_DEBUG = String(process.env.SOCKET_DEBUG || '').toLowerCase() === 'true'
    || String(process.env.OD_TRAIL_SOCKET_DEBUG || '').toLowerCase() === 'true';

const debugLog = (message, data) => {
    if (!SOCKET_DEBUG) return;
    if (data !== undefined) {
        console.log(`[SocketDebug] ${message}`, data);
    } else {
        console.log(`[SocketDebug] ${message}`);
    }
};

const summarizePoints = (points) => {
    const list = Array.isArray(points) ? points : [];
    const first = list[0];
    const last = list[list.length - 1];
    const mini = (p) =>
        p
            ? {
                latitude: p.latitude,
                longitude: p.longitude,
                capturedAt: p.capturedAt,
                accuracy: p.accuracy,
                heading: p.heading,
                speed: p.speed,
                source: p.source,
            }
            : null;
    return {
        count: list.length,
        first: mini(first),
        last: mini(last),
    };
};

/**
 * Initialize Socket.io
 * @param {Object} server - HTTP server instance
 * @param {Array} allowedOrigins - Origins allowed by CORS
 */
const initSocket = (server, allowedOrigins) => {
    io = new Server(server, {
        cors: {
            origin: allowedOrigins,
            credentials: true,
        },
        transports: ['websocket', 'polling'],
    });

    console.log('🔌 Socket.io initialized');

    io.use(async (socket, next) => {
        try {
            const tokenFromAuth = socket.handshake?.auth?.token;
            const authHeader = socket.handshake?.headers?.authorization;
            const user = await authenticateSocket(tokenFromAuth || authHeader);
            if (!user) return next(new Error('Unauthorized'));
            socket.user = user;
            debugLog('socket authenticated', {
                socketId: socket.id,
                userId: String(user?._id || ''),
                role: user?.role,
            });
            return next();
        } catch (error) {
            debugLog('socket auth failed', {
                socketId: socket.id,
                message: error?.message || 'Unauthorized',
            });
            return next(new Error('Unauthorized'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);

        socket.on('join_user_room', (userId) => {
            console.log(`🔌 User ${userId} joined their private room`);
            socket.join(userId);
        });

        socket.on('od_trail:join', async (payload = {}, ack) => {
            try {
                const odId = String(payload.odId || '').trim();
                if (!odId) {
                    debugLog('od_trail:join rejected (missing odId)', { socketId: socket.id });
                    ack?.({ success: false, error: 'odId is required' });
                    return;
                }
                const od = await OD.findById(odId).select('_id employeeId emp_no appliedBy status endEvidence').lean();
                if (!od) {
                    debugLog('od_trail:join rejected (OD not found)', { socketId: socket.id, odId });
                    ack?.({ success: false, error: 'OD not found' });
                    return;
                }
                if (!canViewOdTrail(od, socket.user)) {
                    debugLog('od_trail:join rejected (not authorized)', {
                        socketId: socket.id,
                        odId,
                        userId: String(socket.user?._id || ''),
                    });
                    ack?.({ success: false, error: 'Not authorized to view this OD trail' });
                    return;
                }
                const room = `od_trail:${odId}`;
                socket.join(room);
                debugLog('od_trail:join accepted', {
                    socketId: socket.id,
                    odId,
                    room,
                    userId: String(socket.user?._id || ''),
                });
                ack?.({ success: true, room });
            } catch (error) {
                debugLog('od_trail:join error', {
                    socketId: socket.id,
                    message: error?.message || 'Join failed',
                });
                ack?.({ success: false, error: error.message || 'Join failed' });
            }
        });

        socket.on('od_trail:leave', (payload = {}, ack) => {
            const odId = String(payload.odId || '').trim();
            if (!odId) {
                debugLog('od_trail:leave rejected (missing odId)', { socketId: socket.id });
                ack?.({ success: false, error: 'odId is required' });
                return;
            }
            socket.leave(`od_trail:${odId}`);
            debugLog('od_trail:leave', { socketId: socket.id, odId });
            ack?.({ success: true });
        });

        socket.on('od_trail:publish', async (payload = {}, ack) => {
            try {
                const odId = String(payload.odId || '').trim();
                const points = Array.isArray(payload.points) ? payload.points : [];
                const client = payload.client;
                debugLog('od_trail:publish received', {
                    socketId: socket.id,
                    odId,
                    client,
                    userId: String(socket.user?._id || ''),
                    payload: summarizePoints(points),
                });
                const result = await appendOdTrailPoints({
                    odId,
                    user: socket.user,
                    points,
                    client,
                });
                if (!result.ok) {
                    debugLog('od_trail:publish rejected', {
                        socketId: socket.id,
                        odId,
                        error: result.error || 'Publish failed',
                    });
                    ack?.({ success: false, error: result.error || 'Publish failed' });
                    return;
                }
                emitOdTrailUpdate({
                    odId,
                    points: result.normalized,
                    trailLength: result.od.locationTrail.length,
                });
                debugLog('od_trail:publish stored', {
                    socketId: socket.id,
                    odId,
                    appended: result.normalized.length,
                    trailLength: result.od.locationTrail.length,
                    normalized: summarizePoints(result.normalized),
                });
                ack?.({
                    success: true,
                    appended: result.normalized.length,
                    trailLength: result.od.locationTrail.length,
                });
            } catch (error) {
                debugLog('od_trail:publish error', {
                    socketId: socket.id,
                    message: error?.message || 'Publish failed',
                });
                ack?.({ success: false, error: error.message || 'Publish failed' });
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

const emitOdTrailUpdate = ({ odId, points, trailLength }) => {
    if (!io || !odId || !Array.isArray(points) || points.length === 0) return;
    debugLog('od_trail:update broadcast', {
        odId: String(odId),
        trailLength: Number.isFinite(Number(trailLength)) ? Number(trailLength) : undefined,
        payload: summarizePoints(points),
    });
    io.to(`od_trail:${String(odId)}`).emit('od_trail:update', {
        odId: String(odId),
        points: points.map((p) => ({
            latitude: p.latitude,
            longitude: p.longitude,
            capturedAt: p.capturedAt ? new Date(p.capturedAt).toISOString() : new Date().toISOString(),
            address: p.address,
            accuracy: p.accuracy,
            heading: p.heading,
            speed: p.speed,
            source: p.source,
        })),
        trailLength: Number.isFinite(Number(trailLength)) ? Number(trailLength) : undefined,
    });
};

/**
 * Broadcast road-snapped polyline update to all viewers of an OD trail room.
 * Called asynchronously from odTrailService after the OSRM pipeline completes.
 * @param {{ odId: string, encodedPolyline: string, snappedPoints?: {latitude:number,longitude:number}[] }} payload
 */
const emitOdTrailSnappedUpdate = ({ odId, encodedPolyline, snappedPoints }) => {
    if (!io || !odId) return;
    debugLog('od_trail:snapped_update broadcast', {
        odId: String(odId),
        encodedLength: encodedPolyline?.length || 0,
        snappedCount: snappedPoints?.length || 0,
    });
    io.to(`od_trail:${String(odId)}`).emit('od_trail:snapped_update', {
        odId: String(odId),
        encodedPolyline: encodedPolyline || null,
        snappedPoints: Array.isArray(snappedPoints)
            ? snappedPoints.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))
            : [],
    });
};

/**
 * Get the IO instance
 * @returns {Object} Socket.io server instance
 */
const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

/**
 * Send a notification to a specific user
 * @param {string} userId - User ID to send notification to
 * @param {Object} data - Notification data { type, message, title }
 */
const sendNotification = (userId, data) => {
    if (!io) return;
    io.to(userId).emit('toast_notification', data);
};

/**
 * Broadcast notification to all connected clients
 * @param {Object} data - Notification data
 */
const broadcastNotification = (data) => {
    if (!io) return;
    io.emit('toast_notification', data);
};

module.exports = {
    initSocket,
    getIO,
    emitOdTrailUpdate,
    emitOdTrailSnappedUpdate,
    sendNotification,
    broadcastNotification
};
