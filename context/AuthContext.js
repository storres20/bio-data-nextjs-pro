'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { authHeaders } from '@/lib/hospitalAccess';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [hydrated, setHydrated] = useState(false); // 👈 New

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');

        if (storedToken && storedUser) {
            setToken(storedToken);
            setUser(JSON.parse(storedUser));
        }

        setHydrated(true); // ✅ Mark context as ready
    }, []);

    useEffect(() => {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_RAILWAY;
        if (!token || !apiBase) return;
        const controller = new AbortController();
        const refreshProfile = async () => {
            try {
                const response = await fetch(`${apiBase}/api/auth/me`, {
                    headers: authHeaders(token),
                    signal: controller.signal,
                });
                if (response.status === 401 && !controller.signal.aborted) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    setToken(null);
                    setUser(null);
                    return;
                }
                if (!response.ok) return;
                const profile = await response.json();
                if (controller.signal.aborted) return;
                const serialized = JSON.stringify(profile);
                if (localStorage.getItem('user') === serialized) return;
                localStorage.setItem('user', serialized);
                setUser(profile);
            } catch (error) {
                if (!controller.signal.aborted) console.error('Error refreshing profile:', error);
            }
        };
        refreshProfile();
        const interval = setInterval(refreshProfile, 15000);
        return () => {
            controller.abort();
            clearInterval(interval);
        };
    }, [token]);

    const login = (userData, token) => {
        setUser(userData);
        setToken(token);
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        setToken(null);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, token, login, logout, hydrated }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
