'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, User } from '@/lib/auth';
import { toast } from 'react-hot-toast';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (token: string, user: User, refreshToken?: string) => void;
    logout: () => Promise<void>;
    checkAuth: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: () => { },
    logout: async () => { },
    checkAuth: () => { },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = () => {
        const loadedUser = auth.getUser();
        setUser(loadedUser);
        setLoading(false);
    };

    const login = (token: string, userData: User, refreshToken?: string) => {
        auth.setAuthSession(token, refreshToken);
        auth.setUser(userData);
        setUser(userData);
    };

    const logout = async () => {
        await auth.logout();
        setUser(null);
    };

    useEffect(() => {
        checkAuth();

        const handleGlobalLogout = (event: Event) => {
            console.log('[AuthContext] Global logout event received');
            setUser(null);

            const reason = (event as CustomEvent<{ reason?: string }>).detail?.reason;
            if (reason === 'SESSION_REPLACED') {
                toast.error('You were logged out because your account signed in on another device.');
            } else if (reason === 'TOKEN_VERSION_MISMATCH') {
                toast.error('Your password was changed. Please sign in again.');
            }

            if (typeof window !== 'undefined') {
                const storedUser = localStorage.getItem('user');
                const parsedUser = storedUser ? JSON.parse(storedUser) : null;
                const isSSO = parsedUser?.loginMethod === 'sso';
                const crmUrl = process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.pydah.edu.in';

                if (isSSO && crmUrl) {
                    window.location.href = crmUrl;
                } else if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
            }
        };

        window.addEventListener('auth-logout', handleGlobalLogout);
        return () => window.removeEventListener('auth-logout', handleGlobalLogout);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
