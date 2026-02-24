'use client';

import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

interface TopHeaderProps {
    showLogout?: boolean;
}

export default function TopHeader({ showLogout = true }: TopHeaderProps) {
    const { logout } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    return (
        <div className="fixed top-3 right-3 z-[110] flex items-center gap-3 pointer-events-none md:hidden">
            {showLogout && (
                <button
                    onClick={handleLogout}
                    className="group flex items-center justify-center w-10 h-10 sm:w-auto sm:h-auto sm:px-4 sm:py-2 pointer-events-auto rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-lg transition-all hover:bg-white dark:hover:bg-slate-900 hover:scale-105 active:scale-95"
                >
                    <LogOut className="h-5 w-5 sm:h-4 sm:w-4 transition-transform group-hover:rotate-12" />
                    <span className="hidden sm:inline-block ml-2 text-sm font-bold">Logout</span>
                </button>
            )}
        </div>
    );
}
