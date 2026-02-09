'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSidebar } from '@/contexts/SidebarContext';
import { auth } from '@/lib/auth';
import { api } from '@/lib/api';
import { MODULE_CATEGORIES, isModuleEnabled, isCategoryEnabled } from '@/config/moduleCategories';
import {
    LayoutDashboard,
    Plane,
    Users,
    Watch,
    Building,
    CalendarClock,
    UserCog,
    Settings,
    PiggyBank,
    AlertTriangle,
    BarChart3,
    Wallet,
    CreditCard,
    Sheet,
    Receipt,
    Banknote,
    LogOut,
    ChevronLeft,
    ChevronRight,
    Menu,
    X,
} from 'lucide-react';

// Module code to icon mapping
const moduleIcons: Record<string, any> = {
    DASHBOARD: LayoutDashboard,
    LEAVE: Plane,
    OD: Plane,
    LEAVE_OD: Plane,
    CCL: Plane,
    EMPLOYEE: Users,
    EMPLOYEES: Users,
    SHIFT: Watch,
    SHIFTS: Watch,
    SHIFT_ROSTER: CalendarClock,
    DEPARTMENT: Building,
    DEPARTMENTS: Building,
    ATTENDANCE: CalendarClock,
    PROFILE: UserCog,
    SETTINGS: Settings,
    LOANS: PiggyBank,
    LOAN: PiggyBank,
    OT_PERMISSIONS: Watch,
    CONFUSED_SHIFTS: AlertTriangle,
    USERS: UserCog,
    REPORTS: BarChart3,
    ALLOWANCES_DEDUCTIONS: Wallet,
    PAYROLL_TRANSACTIONS: CreditCard,
    PAY_REGISTER: Sheet,
    PAYSLIPS: Receipt,
    PAYROLL: Banknote,
    LOANS_SALARY_ADVANCE: PiggyBank,
};

export default function WorkspaceSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { isCollapsed, toggleSidebar } = useSidebar();
    const [user, setUser] = useState<{ name: string; email: string; role: string; emp_no?: string; featureControl?: string[] | null } | null>(null);
    const [featureControl, setFeatureControl] = useState<string[] | null>(null);
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const userData = auth.getUser();
        if (userData) {
            setUser({
                name: userData.name,
                email: userData.email,
                role: userData.role,
                emp_no: userData.emp_no,
                featureControl: userData.featureControl || null
            });
        }
    }, []);

    useEffect(() => {
        const fetchFeatureControl = async () => {
            if (!user?.role) return;

            if (user.featureControl && Array.isArray(user.featureControl) && user.featureControl.length > 0) {
                setFeatureControl(user.featureControl);
                return;
            }

            try {
                const response = await api.getSetting(`feature_control_${user.role}`);
                if (response.success && response.data?.value?.activeModules) {
                    setFeatureControl(response.data.value.activeModules);
                } else {
                    const managementRoles = ['manager', 'hr', 'hod'];
                    if (managementRoles.includes(user.role)) {
                        setFeatureControl(MODULE_CATEGORIES.flatMap(c => c.modules.map(m => m.code)));
                    } else {
                        setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
                    }
                }
            } catch (error) {
                console.error('Error fetching RBAC settings:', error);
                const managementRoles = ['manager', 'hr', 'hod'];
                if (managementRoles.includes(user.role)) {
                    setFeatureControl(MODULE_CATEGORIES.flatMap(c => c.modules.map(m => m.code)));
                } else {
                    setFeatureControl(['DASHBOARD', 'LEAVE_OD', 'ATTENDANCE', 'PROFILE', 'PAYSLIPS']);
                }
            }
        };
        fetchFeatureControl();
    }, [user?.role, user?.featureControl]);

    const handleLogout = () => {
        auth.logout();
        router.push('/login');
    };

    if (!mounted) return null;

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                onClick={() => setIsMobileOpen(true)}
                type="button"
                className="fixed top-3 left-3 z-10 inline-flex items-center p-2 text-sm text-slate-500 rounded-lg sm:hidden hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-slate-400 dark:hover:bg-slate-700"
            >
                <span className="sr-only">Open sidebar</span>
                <Menu className="w-6 h-6" />
            </button>

            {/* Overlay for mobile */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 z-10 bg-gray-900/50 sm:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar Aside */}
            <aside
                className={`fixed top-0 left-0 h-screen bg-white dark:bg-black border-r border-slate-200/60 dark:border-slate-800 transition-all duration-300 ease-in-out z-10
          ${isMobileOpen ? 'translate-x-0 w-64' : '-translate-x-full sm:translate-x-0'} 
          ${isCollapsed ? 'sm:w-[70px]' : 'sm:w-[240px]'} 
          `}
                aria-label="Sidebar"
            >
                {/* Collapse/Expand Button */}
                <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-md hidden sm:flex items-center justify-center hover:bg-slate-50 transition-all z-50 text-slate-500"
                >
                    {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronLeft className="h-3.5 w-3.5" />
                    )}
                </button>

                <div className="flex flex-col h-full overflow-hidden">
                    {/* Logo/Header */}
                    <div className={`px-4 py-4 flex items-center border-b border-slate-200/60 dark:border-slate-800 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center w-full' : ''}`}>
                            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 flex-shrink-0">
                                <span className="text-sm font-bold text-white">H</span>
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">HRMS</h2>
                            )}
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300">
                        {MODULE_CATEGORIES.map(category => {
                            if (!isCategoryEnabled(category.code, featureControl)) return null;

                            const enabledModules = category.modules.filter(module =>
                                isModuleEnabled(module.code, featureControl)
                            );

                            if (enabledModules.length === 0) return null;

                            return (
                                <div key={category.code}>
                                    {(!isCollapsed || isMobileOpen) && (
                                        <h3 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                            {category.name}
                                        </h3>
                                    )}

                                    <ul className="space-y-1">
                                        {enabledModules.map(module => {
                                            const isActive = pathname === module.href ||
                                                (module.code === 'LEAVE_OD' && (pathname === '/leaves' || pathname === '/od')) ||
                                                (module.code === 'CCL' && pathname === '/ccl');

                                            const Icon = moduleIcons[module.code] || LayoutDashboard;

                                            return (
                                                <li key={module.code}>
                                                    <Link
                                                        href={module.href}
                                                        onClick={() => setIsMobileOpen(false)}
                                                        className={`flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                              ${isActive
                                                                ? 'bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 text-indigo-700 dark:text-indigo-400 font-medium shadow-sm'
                                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                                                            }
                              ${(isCollapsed && !isMobileOpen) ? 'justify-center px-2' : ''}
                            `}
                                                    >
                                                        <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200 ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'}`} />

                                                        {(!isCollapsed || isMobileOpen) && (
                                                            <span className="ms-3 text-sm">{module.label}</span>
                                                        )}

                                                        {isActive && (!isCollapsed || isMobileOpen) && (
                                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-indigo-500 rounded-r-full" />
                                                        )}
                                                    </Link>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            );
                        })}
                    </nav>

                    {/* User Section */}
                    <div className="border-t border-slate-200/60 dark:border-slate-800 p-4 space-y-2 bg-slate-50/50 dark:bg-black/20">
                        <Link
                            href="/profile"
                            onClick={() => setIsMobileOpen(false)}
                            className={`flex items-center gap-3 p-2 rounded-xl transition-all duration-200 hover:bg-white dark:hover:bg-slate-800 shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700
                ${(isCollapsed && !isMobileOpen) ? 'justify-center' : ''}`}
                        >
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm">
                                {user?.name?.[0]?.toUpperCase() || 'U'}
                            </div>
                            {(!isCollapsed || isMobileOpen) && (
                                <div className="shrink-0 max-w-[140px]">
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user?.name || 'User'}</p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate capitalize">{user?.role?.replace(/_/g, ' ') || '...'}</p>
                                </div>
                            )}
                        </Link>

                        <button
                            onClick={handleLogout}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 text-slate-500 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/10 hover:text-red-600 dark:hover:text-red-400
                ${(isCollapsed && !isMobileOpen) ? 'justify-center' : ''}`}
                        >
                            <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
                            {(!isCollapsed || isMobileOpen) && (
                                <span className="text-sm font-medium">Logout</span>
                            )}
                        </button>
                    </div>
                </div>
            </aside>
        </>
    );
}
