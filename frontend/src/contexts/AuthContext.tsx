'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth, User } from '@/lib/auth';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (token: string, user: User) => void;
    logout: () => void;
    checkAuth: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    login: () => { },
    logout: () => { },
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

    useEffect(() => {
        checkAuth();
    }, []);

    const login = (token: string, userData: User) => {
        auth.setToken(token);
        auth.setUser(userData);
        setUser(userData);
    };

    const logout = () => {
        auth.logout();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
