'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { toast } from 'react-toastify';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
    socket: null,
    isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!user) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
        const newSocket = io(socketUrl, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
        });

        newSocket.on('connect', () => {
            console.log('🔌 Connected to Socket.io');
            setIsConnected(true);

            // Join user-specific room for private notifications
            const userId = user.id || (user as any)._id;
            if (userId) {
                newSocket.emit('join_user_room', userId);
            }
        });

        newSocket.on('disconnect', () => {
            console.log('🔌 Disconnected from Socket.io');
            setIsConnected(false);
        });

        newSocket.on('toast_notification', (data: { type: 'success' | 'error' | 'info' | 'warning', message: string, title?: string }) => {
            console.log('🔔 Received notification:', data);

            const toastOptions = {
                position: "top-right" as const,
                autoClose: 5000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
            };

            switch (data.type) {
                case 'success':
                    toast.success(data.message, toastOptions);
                    break;
                case 'error':
                    toast.error(data.message, toastOptions);
                    break;
                case 'warning':
                    toast.warn(data.message, toastOptions);
                    break;
                default:
                    toast.info(data.message, toastOptions);
            }
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, [user]);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
};
