const { Server } = require('socket.io');

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

    console.log('🔌 Socket.io initialized');

    io.on('connection', (socket) => {
        console.log(`🔌 New client connected: ${socket.id}`);

        socket.on('join_user_room', (userId) => {
            console.log(`🔌 User ${userId} joined their private room`);
            socket.join(userId);
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
    sendNotification,
    broadcastNotification
};
