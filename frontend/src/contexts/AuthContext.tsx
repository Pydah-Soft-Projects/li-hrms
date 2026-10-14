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
        if (userData?.loginMethod === 'sso') {
            auth.setLoginMethod('sso');
        } else {
            auth.setLoginMethod('credentials');
        }
        setUser(userData);
    };

    const logout = async () => {
        const isSSO = auth.isSSO();
        await auth.logout();
        setUser(null);
        auth.redirectAfterLogout(isSSO);
    };

    useEffect(() => {
        checkAuth();

        const handleGlobalLogout = (event: Event) => {
            console.log('[AuthContext] Global logout event received');
            setUser(null);

            const detail = (event as CustomEvent<{ reason?: string; isSSO?: boolean }>).detail;
            const reason = detail?.reason;
            if (reason === 'SESSION_REPLACED') {
                toast.error('You were logged out because your account signed in on another device.');
            } else if (reason === 'TOKEN_VERSION_MISMATCH') {
                toast.error('Your password was changed. Please sign in again.');
            }

            if (typeof window !== 'undefined') {
                if (window.location.pathname === '/login') {
                    return;
                }
                const isSSO = detail?.isSSO ?? false;
                auth.redirectAfterLogout(isSSO);
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
