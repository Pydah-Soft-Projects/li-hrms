const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

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

    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Missing auth token'));
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = { id: decoded.userId || decoded.id };
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    console.log('🔌 Socket.io initialized');

    io.on('connection', (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);

        socket.on('join_user_room', (userId) => {
            const canonicalId = socket.user?.id?.toString?.();
            const requestedId = userId?.toString?.();
            if (requestedId && canonicalId && requestedId === canonicalId) {
                socket.join(userId);
                console.log(`🔌 User ${userId} joined their private room`);
            } else {
                console.warn(`🔌 join_user_room rejected: requested ${userId} vs auth ${canonicalId}`);
            }
        });

        socket.on('disconnect', () => {
            console.log(`🔌 Client disconnected: ${socket.id}`);
        });
    });

    return io;
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
    if (!io) {
        console.warn('sendNotification: Socket.io not initialized, skipping userId=', userId);
        return;
    }
    io.to(userId).emit('toast_notification', data);
};

/**
 * Broadcast notification to all connected clients
 * @param {Object} data - Notification data
 */
const broadcastNotification = (data) => {
    if (!io) {
        console.warn('broadcastNotification: Socket.io not initialized');
        return;
    }
    io.emit('toast_notification', data);
};

module.exports = {
    initSocket,
    getIO,
    sendNotification,
    broadcastNotification
};
