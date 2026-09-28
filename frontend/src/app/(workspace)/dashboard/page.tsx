"use client";

import React, { useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { api, type InAppNotification, type WorkspaceDashboardStats } from '@/lib/api';
import TodayBirthdayTicker from '@/components/employee-birthdays/TodayBirthdayTicker';
import HolidayCelebrationOverlay from '@/components/dashboard/HolidayCelebrationOverlay';
import TicketSupportBubble from '@/components/TicketSupportBubble';
import Link from 'next/link';
import {
  Users,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  FileText,
  Star,
  LayoutDashboard,
  ChevronRight,
  Bell,
  BellRing,
  X,
  CheckCheck,
  Sparkles
} from 'lucide-react';
import { useSocket } from '@/contexts/SocketContext';
import { useDashboardPushBell } from '@/hooks/useDashboardPushBell';

type DashboardStats = WorkspaceDashboardStats;

interface DashboardCardProps {
  title: string;
  value: string | number;
  description: string;
  change?: string;
  statusBadge?: React.ReactNode;
  footer?: React.ReactNode;
  icon?: React.ReactElement<{ className?: string }>;
}

const DashboardCard = ({ title, value, description, change, statusBadge, footer, icon }: DashboardCardProps) => (
  <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-3 md:p-6 hover:bg-bg-surface/80 transition-all duration-300 shadow-sm group">
    <div className="flex justify-between items-start mb-3 md:mb-4 gap-2">
      <div className="flex flex-col gap-0.5 md:gap-1 min-w-0">
        <p className="text-[10px] md:text-sm font-semibold text-text-secondary uppercase tracking-wide md:tracking-wider truncate">{title}</p>
        <h3 className="text-lg md:text-3xl font-black text-text-primary tracking-tight truncate">{value}</h3>
      </div>
      <div className="p-1.5 md:p-3 rounded-lg md:rounded-xl bg-bg-base border border-border-base text-text-secondary group-hover:scale-110 transition-transform duration-300 shrink-0">
        {icon && React.cloneElement(icon, { className: 'w-4 h-4 md:w-6 md:h-6' })}
      </div>
    </div>

    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-1.5 md:gap-2 mt-auto">
      <div className="flex flex-col min-w-0 w-full">
        <p className="text-[9px] md:text-xs text-text-secondary font-medium truncate">{description}</p>
        {change && <span className="text-[8px] md:text-[10px] text-text-secondary font-normal">{change}</span>}
        {footer && <div className="mt-2 pt-2 border-t border-border-base w-full">{footer}</div>}
      </div>
      {statusBadge}
    </div>
  </div>
);

export default function DashboardPage() {
  const { activeWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [stats, setStats] = useState<DashboardStats>({});
  const [loading, setLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState<any[] | null>(null);
  const [currentDate] = useState(new Date());
  const [todayBirthdayItems, setTodayBirthdayItems] = useState<Array<{ id: string; name: string; designationName: string }>>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadBroadcastPopup, setUnreadBroadcastPopup] = useState<InAppNotification | null>(null);
  const { pushSubscribed } = useDashboardPushBell(!!user);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, attendanceRes] = await Promise.all([
          api.getDashboardStats(),
          (async () => {
            const empNo = user?.emp_no || user?.employeeId || (user as any)?.employeeNumber;
            if (!empNo) return { success: false };
            const today = new Date().toISOString().split('T')[0];
            return api.getAttendanceDetail(empNo, today);
          })()
        ]);

        if (statsRes.success && statsRes.data) {
          setStats(statsRes.data);
        }

        if (attendanceRes.success && attendanceRes.data) {
          setAttendanceData([attendanceRes.data]);
        } else {
          setAttendanceData([]);
        }

        try {
          const birthdayRes = await api.getBirthdaysSummary({ today: true, includeLeft: false });
          if (birthdayRes?.success && Array.isArray(birthdayRes.data)) {
            const items = birthdayRes.data.map((emp: any) => ({
              id: emp._id || emp.emp_no,
              name: emp.employee_name || emp.emp_no || 'Employee',
              designationName:
                (typeof emp.designation_id === 'object' && emp.designation_id?.name) ||
                (typeof emp.designation === 'object' && emp.designation?.name) ||
                '—',
            }));
            setTodayBirthdayItems(items);
          } else {
            setTodayBirthdayItems([]);
          }
        } catch {
          setTodayBirthdayItems([]);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const loadNotifications = async () => {
      try {
        setNotificationLoading(true);
        const [listRes, countRes] = await Promise.all([
          api.getNotifications({ page: 1, limit: 25 }),
          api.getNotificationUnreadCount(),
        ]);
        if (listRes?.success) {
          const rawLoaded = listRes.data || [];
          const seenKeys = new Set<string>();
          const loaded = rawLoaded.filter((n) => {
            const key = `${(n.title || '').trim().toLowerCase()}|${(n.message || n.content || '').trim().toLowerCase()}`;
            if (seenKeys.has(key)) return false;
            seenKeys.add(key);
            return true;
          });
          setNotifications(loaded);
          const unreadBroadcast = loaded.find(
            (n: InAppNotification) =>
              !n.isRead &&
              (n.type === 'communications' ||
                n.type === 'broadcast_message' ||
                n.title?.toLowerCase().includes('announcement') ||
                n.title?.toLowerCase().includes('broadcast') ||
                n.message?.toLowerCase().includes('popup'))
          );
          if (unreadBroadcast) {
            setUnreadBroadcastPopup(unreadBroadcast);
          }
        }
        if (countRes?.success) {
          setUnreadCount(Number(countRes.unreadCount ?? countRes.data?.unreadCount ?? 0));
        }
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setNotificationLoading(false);
      }
    };
    loadNotifications();
  }, [user]);

  useEffect(() => {
    if (!socket) return;

    const onNew = (n: InAppNotification) => {
      setNotifications((prev) => {
        const combined = [n, ...prev];
        const seen = new Set<string>();
        return combined.filter((item) => {
          const k = `${(item.title || '').trim().toLowerCase()}|${(item.message || item.content || '').trim().toLowerCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 25);
      });
      if (!n.isRead) {
        setUnreadCount((c) => c + 1);
        if (
          n.type === 'communications' ||
          n.type === 'broadcast_message' ||
          n.title?.toLowerCase().includes('announcement') ||
          n.title?.toLowerCase().includes('broadcast') ||
          n.message?.toLowerCase().includes('popup')
        ) {
          setUnreadBroadcastPopup(n);
        }
      }
    };
    const onCount = (payload: { unreadCount: number }) => {
      setUnreadCount(Number(payload?.unreadCount || 0));
    };

    socket.on('in_app_notification', onNew);
    socket.on('notification_unread_count', onCount);
    return () => {
      socket.off('in_app_notification', onNew);
      socket.off('notification_unread_count', onCount);
    };
  }, [socket]);

  const markOneRead = async (id: string) => {
    try {
      const target = notifications.find((n) => n._id === id);
      await api.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) =>
          n._id === id || (target && `${(n.title || '').trim().toLowerCase()}|${(n.message || n.content || '').trim().toLowerCase()}` === `${(target.title || '').trim().toLowerCase()}|${(target.message || target.content || '').trim().toLowerCase()}`)
            ? { ...n, isRead: true }
            : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleCloseBroadcastPopup = async () => {
    if (unreadBroadcastPopup?._id) {
      try {
        const targetKey = `${(unreadBroadcastPopup.title || '').trim().toLowerCase()}|${(unreadBroadcastPopup.message || unreadBroadcastPopup.content || '').trim().toLowerCase()}`;
        await api.markNotificationRead(unreadBroadcastPopup._id);
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === unreadBroadcastPopup._id || `${(n.title || '').trim().toLowerCase()}|${(n.message || n.content || '').trim().toLowerCase()}` === targetKey
              ? { ...n, isRead: true }
              : n
          )
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch (err) {
        console.error('Failed to mark broadcast popup read:', err);
      }
    }
    setUnreadBroadcastPopup(null);
  };

  const userRole = user?.role || activeWorkspace?.type || 'employee';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderDashboardContent = () => {
    if (userRole === 'hr' || userRole === 'super_admin' || userRole === 'sub_admin') {
      return <HRDashboard stats={stats} />;
    }
    if (userRole === 'hod' || userRole === 'manager') {
      return <HODDashboard stats={stats} />;
    }
    return <EmployeeDashboard stats={stats} notifications={notifications} markOneRead={markOneRead} />;
  };

  const isPresent = (data: any[] | null) => {
    if (!data || data.length === 0) return false;
    const status = data[0].status?.toUpperCase();
    return status === 'PRESENT' || status === 'PARTIAL' || status === 'HALF_DAY';
  };

  const getStatusDisplay = (data: any[] | null) => {
    if (!data || data.length === 0) return 'ABSENT';
    return data[0].status || 'Running';
  };

  const formatTimeIST = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '--:--';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase();
  };

  return (
    <div className="relative min-h-screen -m-4 sm:-m-5 lg:-m-6">


      <div className="relative z-10 pt-11 p-4 sm:p-5 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-nowrap items-center justify-between gap-2 md:gap-4 mb-6 md:mb-8">
          <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-2xl hidden md:flex bg-gradient-to-br from-indigo-500 to-indigo-600 items-center justify-center text-white shadow-lg shadow-indigo-500/20 shrink-0">
              <LayoutDashboard className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base md:text-2xl font-black tracking-tight text-text-primary capitalize truncate">Welcome Back, {user?.name?.split(' ')[0]}</h1>
              <p className="text-[10px] md:text-sm text-text-secondary font-medium truncate">Here&apos;s what&apos;s happening today</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-3 px-2 py-1 md:px-4 md:py-2 rounded-full bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm shrink-0">
            <Calendar className="w-3 h-3 md:w-4 md:h-4 text-indigo-500" />
            <span className="text-[10px] md:text-sm font-bold text-text-secondary whitespace-nowrap">
              {currentDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
          <button
            onClick={() => setNotificationPanelOpen(true)}
            title={
              pushSubscribed === true
                ? 'Push notifications active on this device'
                : pushSubscribed === false
                  ? 'Push not registered — allow notifications in the prompt or browser settings'
                  : 'Notifications'
            }
            className={`relative h-9 w-9 md:h-10 md:w-10 rounded-full border transition-colors flex items-center justify-center ${
              unreadCount > 0 ? 'animate-bell-wrap-pulse' : ''
            } ${
              pushSubscribed === true
                ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-700 hover:text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/45 dark:text-emerald-300 dark:hover:text-emerald-200'
                : pushSubscribed === false
                  ? 'border-amber-400/80 bg-amber-500/10 text-amber-800 hover:text-amber-900 dark:border-amber-500/45 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:text-amber-100'
                  : 'border-border-base bg-bg-surface/70 text-text-secondary hover:text-text-primary'
            }`}
            aria-label="Open notifications"
          >
            {unreadCount > 0 ? (
              <BellRing className="w-4 h-4 md:w-5 md:h-5 animate-bell-ring" />
            ) : (
              <Bell className="w-4 h-4 md:w-5 md:h-5" />
            )}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </div>

        {todayBirthdayItems.length > 0 && (
          <div className="mb-5">
            <TodayBirthdayTicker items={todayBirthdayItems} />
          </div>
        )}

        {(stats.isTodayHoliday || stats.isTodayWeekOff) && (
          <HolidayCelebrationOverlay
            dayType={stats.isTodayHoliday ? 'HOLIDAY' : 'WEEK_OFF'}
            holidayName={stats.todayHolidayName}
          />
        )}

        {/* Global Attendance Card (Always relevant for employees/managers) */}
        {userRole !== 'super_admin' && (
          <div className="rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 p-4 md:p-6 shadow-xl shadow-indigo-500/20 border border-white/10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl transition-all duration-500 group-hover:bg-white/20" />

            <div className="relative z-10 flex flex-col md:flex-row md:flex-wrap items-start md:items-center justify-between gap-4 md:gap-6">
              <div className="flex items-center gap-3 md:gap-4 w-full md:w-auto">
                <div className="w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-inner shrink-0">
                  <Clock className="w-5 h-5 md:w-7 md:h-7" />
                </div>
                <div className="flex-1 md:flex-initial">
                  <p className="text-[10px] md:text-xs font-bold text-white/70 uppercase tracking-wide md:tracking-widest">Your Work Status</p>
                  <h3 className="text-base md:text-2xl font-black text-white capitalize">{isPresent(attendanceData) ? 'Clocked In' : 'Not Clocked In'}</h3>
                </div>
                <div className={`px-4 py-2 md:px-6 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-wide md:tracking-widest shadow-lg ${isPresent(attendanceData) ? 'bg-white text-indigo-700' : 'bg-white/10 text-white border border-white/20'
                  }`}>
                  {getStatusDisplay(attendanceData)}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 md:gap-4 items-center w-full md:w-auto">
                <div className="flex-1 md:flex-initial px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[80px] md:min-w-[100px] relative overflow-hidden">
                  <span className="text-[8px] md:text-[10px] font-bold text-white/60 uppercase">In Time</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm md:text-lg font-black text-white font-mono">
                      {attendanceData?.[0]?.inTime
                        ? formatTimeIST(attendanceData[0].inTime)
                        : (attendanceData?.[0]?.shifts?.[0]?.inTime
                          ? formatTimeIST(attendanceData[0].shifts[0].inTime)
                          : '--:--')
                      }
                    </span>
                  </div>
                </div>
                <div className="flex-1 md:flex-initial px-3 py-2 md:px-5 md:py-2.5 rounded-xl md:rounded-2xl bg-black/10 backdrop-blur-md border border-white/10 flex flex-col items-center min-w-[80px] md:min-w-[100px]">
                  <span className="text-[8px] md:text-[10px] font-bold text-white/60 uppercase">Expected Out</span>
                  <span className="text-sm md:text-lg font-black text-white font-mono">
                    {attendanceData?.[0]?.outTime
                      ? formatTimeIST(attendanceData[0].outTime)
                      : (attendanceData?.[0]?.shifts?.[0]?.shiftEndTime
                        ? formatTimeIST(`${new Date().toISOString().split('T')[0]}T${attendanceData[0].shifts[0].shiftEndTime}`)
                        : '--:--')
                    }
                  </span>
                </div>

              </div>
            </div>
            <div className="bg-black/10 rounded-xl md:rounded-2xl p-3 md:p-4 border border-white/10 backdrop-blur-sm mt-3 md:mt-4">
              {attendanceData && attendanceData.length > 0 ? (
                attendanceData.map((record: any, recordIdx: number) => (
                  <div key={recordIdx} className="w-full">
                    {record.shifts && record.shifts.length > 0 ? (
                      record.shifts.map((shift: any, shiftIdx: number) => (
                        <div key={`${recordIdx}-${shiftIdx}`} className={`flex flex-col px-5 md:flex-row md:items-center md:justify-between gap-2 md:gap-0 ${shiftIdx > 0 ? 'mt-3 md:mt-4 pt-3 md:pt-4 border-t border-white/10' : ''}`}>
                          <div className="flex flex-row justify-between items-center w-full md:w-auto md:flex-col md:items-start">
                            <div className="flex flex-col">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Shift Info</span>
                              <span className="text-[10px] md:text-xs font-bold text-white">{shift.shiftName || shift.shiftId?.name || 'General Shift'}</span>
                            </div>
                            {shift.inTime && (
                              <div className="flex flex-col items-end md:hidden">
                                <span className="text-[8px] font-semibold text-emerald-100 uppercase tracking-wide">Status</span>
                                <span className={`text-[10px] font-bold uppercase tracking-wide ${shift.isLateIn ? 'text-red-300' : 'text-emerald-300'}`}>
                                  {shift.isLateIn ? 'Late' : 'On Time'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-4 md:gap-8 w-full md:w-auto">
                            {shift.inTime && (
                              <div className="hidden md:flex flex-col flex-1 md:flex-initial md:items-center">
                                <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Status</span>
                                <span className={`text-[10px] md:text-xs font-bold uppercase tracking-wide ${shift.isLateIn ? 'text-red-300' : 'text-emerald-300'}`}>
                                  {shift.isLateIn ? 'Late' : 'On Time'}
                                </span>
                              </div>
                            )}
                            <div className="flex flex-col flex-1 md:flex-initial md:items-center">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">In Time</span>
                              <span className="text-xs md:text-sm font-bold text-white font-mono">{formatTimeIST(shift.inTime)}</span>
                            </div>
                            <div className="flex flex-col flex-1 items-end md:flex-initial md:items-end">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Out Time</span>
                              <span className="text-xs md:text-sm font-bold text-white font-mono">{formatTimeIST(shift.outTime)}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
                        <div className="flex flex-row justify-between items-center w-full md:w-auto md:flex-col md:items-start">
                          <div className="flex flex-col">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Shift Info</span>
                            <span className="text-[10px] md:text-xs font-bold text-white">{record.shiftId?.name || record.shift || 'General Shift'}</span>
                          </div>
                          {record.inTime && (
                            <div className="flex flex-col items-end md:hidden">
                              <span className="text-[8px] font-semibold text-emerald-100 uppercase tracking-wide">Status</span>
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${record.isLateIn ? 'text-red-300' : 'text-emerald-300'}`}>
                                {record.isLateIn ? 'Late' : 'On Time'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 md:gap-8 w-full md:w-auto">
                          {record.inTime && (
                            <div className="hidden md:flex flex-col flex-1 md:flex-initial md:items-center">
                              <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Status</span>
                              <span className={`text-[10px] md:text-xs font-bold uppercase tracking-wide ${record.isLateIn ? 'text-red-300' : 'text-emerald-300'}`}>
                                {record.isLateIn ? 'Late' : 'On Time'}
                              </span>
                            </div>
                          )}
                          <div className="flex flex-col flex-1 md:flex-initial md:items-center">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">In Time</span>
                            <span className="text-xs md:text-sm font-bold text-white font-mono">{formatTimeIST(record.inTime)}</span>
                          </div>
                          <div className="flex flex-col flex-1 items-end md:flex-initial md:items-end">
                            <span className="text-[8px] md:text-[10px] font-semibold text-emerald-100 uppercase tracking-wide md:tracking-wider">Out Time</span>
                            <span className="text-xs md:text-sm font-bold text-white font-mono">{formatTimeIST(record.outTime)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-2 flex flex-col items-center">
                  <p className="text-emerald-50 text-xs md:text-sm font-medium">No check-in found</p>
                  <p className="text-emerald-200/60 text-[10px] md:text-xs">Waiting for attendance log</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Role-specific dashboards */}
        {renderDashboardContent()}
      </div>

      {notificationPanelOpen && (
        <div className="fixed inset-0 z-[140]">
          <button
            onClick={() => setNotificationPanelOpen(false)}
            className="absolute inset-0 bg-slate-900/45"
            aria-label="Close notifications overlay"
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Notifications</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Unread: {unreadCount}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Read All
                </button>
                <button
                  onClick={() => setNotificationPanelOpen(false)}
                  className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 flex items-center justify-center"
                  aria-label="Close notifications"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {notificationLoading ? (
                <div className="text-xs text-slate-500 p-3">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="text-xs text-slate-500 p-3">No notifications yet.</div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n._id}
                    onClick={() => !n.isRead && markOneRead(n._id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      n.isRead
                        ? 'bg-slate-50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-700'
                        : 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-black text-slate-900 dark:text-white">{n.title}</p>
                      {!n.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-indigo-500" />}
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-2 uppercase tracking-wider">
                      {n.module.replace('_', ' ')} | {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      {/* In-App Broadcast Popup Modal for Logged In User */}
      {unreadBroadcastPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all flex flex-col">
            <div className="h-2 shrink-0 w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600" />
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/20 shrink-0">
                    <Sparkles className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="inline-block px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-950/80 rounded-full mb-1.5 border border-indigo-200 dark:border-indigo-800">
                      Important Announcement
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-tight break-words">
                      {unreadBroadcastPopup.title || 'Broadcast Notification'}
                    </h3>
                  </div>
                </div>
                <button
                  onClick={handleCloseBroadcastPopup}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                  aria-label="Close Announcement Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 max-h-60 overflow-y-auto custom-scrollbar">
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-normal whitespace-pre-wrap break-words">
                  {unreadBroadcastPopup.message || unreadBroadcastPopup.content}
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 text-center sm:text-left">
                  {unreadBroadcastPopup.createdAt
                    ? new Date(unreadBroadcastPopup.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : ''}
                </span>
                <button
                  onClick={handleCloseBroadcastPopup}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 active:scale-95 shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCheck className="w-4 h-4" />
                  Acknowledge & Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <TicketSupportBubble />
    </div>
  );
}

// HR/Admin Dashboard Component
function HRDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Total Workforce"
          value={stats.totalEmployees || 0}
          description="Active employees"
          icon={<Users className="w-full h-full" />}
          statusBadge={<span className="text-[10px] font-bold text-status-positive bg-status-positive/10 px-2 py-0.5 rounded-full">+4 this mo</span>}
        />
        <DashboardCard
          title="Pending Approvals"
          value={stats.pendingLeaves || 0}
          description="Requires your action"
          icon={<Clock className="w-full h-full" />}
          statusBadge={stats.pendingLeaves ? <span className="text-[10px] font-bold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full animate-pulse">Urgent</span> : null}
        />
        <DashboardCard
          title="Ready for Payroll"
          value={stats.approvedLeaves || 0}
          description="Finalized records"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
        <DashboardCard
          title="Active Today"
          value={stats.todayPresent || 0}
          description="92% Attendance"
          icon={<Calendar className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-1 p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            Quick Access
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/employees" label="Directory" desc="Manage workforce info" icon={<Users />} color="indigo" />
            <QuickLink href="/attendance" label="Time Logs" desc="Track daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/leaves" label="Absence" desc="Review leave/OD requests" icon={<Clock />} color="amber" />
            <QuickLink href="/pay-register" label="Payroll" desc="Calculate earnings" icon={<Building2 />} color="indigo" />
          </div>
        </div>

        {/* <div className="lg:col-span-2 p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-blue-500 rounded-full" />
            System Updates
          </h2>
          <div className="space-y-2 md:space-y-4">
            <NotificationItem icon="✓" title="Sync Complete" desc="Biometric logs processed today" status="Success" color="positive" />
            <NotificationItem icon="!" title="Payroll Deadline" desc="Finalize arrears by tomorrow" status="Urgent" color="warning" />
            <NotificationItem icon="i" title="Policy Update" desc="New OT rules active next cycle" status="Info" color="primary" />
          </div>
        </div> */}
      </div>
    </div>
  );
}

// HOD Dashboard Component
function HODDashboard({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Team Strength"
          value={stats.totalEmployees || 0}
          description="Total members"
          icon={<Users className="w-full h-full" />}
        />
        <DashboardCard
          title="Team Present"
          value={stats.todayPresent || 0}
          description={`${stats.totalEmployees ? stats.totalEmployees - (stats.todayPresent || 0) : 0} Away today`}
          icon={<Calendar className="w-full h-full" />}
        />
        <DashboardCard
          title="Pending Team Requests"
          value={stats.teamPendingApprovals || 0}
          description="Awaiting decision"
          icon={<Clock className="w-full h-full" />}
          statusBadge={stats.teamPendingApprovals ? <span className="text-[10px] font-bold text-status-warning bg-status-warning/10 px-2 py-0.5 rounded-full">Urgent</span> : null}
        />
        <DashboardCard
          title="Efficiency Score"
          value={`${stats.efficiencyScore || 0}%`}
          description="Department avg"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
        <div className="p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            Team Management
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/leaves" label="Reviews" desc="Approve team requests" icon={<CheckCircle2 />} color="amber" />
            <QuickLink href="/attendance" label="Time Tracking" desc="Review daily presence" icon={<Calendar />} color="blue" />
            <QuickLink href="/employees" label="Staff Directory" desc="Member profiles" icon={<Users />} color="indigo" />
          </div>
        </div>

        <div className="p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm overflow-hidden">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6">Recent Team Requests</h2>
          <div className="space-y-2 md:space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {stats.departmentFeed && stats.departmentFeed.length > 0 ? (
              stats.departmentFeed.map((req: any) => (
                <div key={req._id} className="flex items-center justify-between p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold text-xs md:text-base">
                      {req.employeeId?.employee_name?.[0] || 'U'}
                    </div>
                    <div>
                      <h4 className="font-bold text-text-primary text-xs md:text-sm">{req.employeeId?.employee_name || 'Staff'}</h4>
                      <p className="text-text-secondary text-[10px] md:text-xs">{req.leaveType} • {req.numberOfDays}d</p>
                    </div>
                  </div>
                  <Link href={`/leaves`} className="text-[10px] md:text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-2 md:px-3 py-1 md:py-1.5 rounded-md md:rounded-lg transition-colors">
                    Review
                  </Link>
                </div>
              ))
            ) : (
              <div className="text-center py-8 md:py-12">
                <p className="text-text-secondary font-medium text-sm md:text-base">No pending requests</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Employee Dashboard Component
function EmployeeDashboard({
  stats,
  notifications = [],
  markOneRead,
}: {
  stats: DashboardStats;
  notifications?: InAppNotification[];
  markOneRead?: (id: string) => void;
}) {
  const fyLabel = stats.financialYearRegister || '';
  const clPosted = stats.yearlyClCreditDaysPosted ?? null;
  const cclPosted = stats.yearlyCclCreditDaysPosted ?? null;
  const paidTotal = stats.totalPaidLeaveDaysAvailable ?? stats.leaveBalance ?? 0;
  const rows = stats.leaveBalancesByType || [];
  const paidRows = rows.filter((r) => r.paid);
  const unpaidRows = rows.filter((r) => !r.paid);
  const pendingTotal = stats.myPendingRequestsTotal ?? (Number(stats.myPendingLeaves || 0) + Number(stats.myPendingODs || 0));
  const pendingLeave = stats.myPendingLeaves ?? 0;
  const pendingOd = stats.myPendingODs ?? 0;
  const nextHolName = stats.nextHolidayName || (stats.upcomingHolidaysList && stats.upcomingHolidaysList[0]?.name) || '—';
  const nextHolDate =
    stats.nextHolidayDate || (stats.upcomingHolidaysList && stats.upcomingHolidaysList[0]?.date) || null;
  const holCount = stats.upcomingHolidays ?? 0;
  const roster = stats.rosterNextDays || [];

  const formatShortDate = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const leaveTypeFooter = (
    <div className="space-y-1.5 text-[9px] md:text-[10px] text-text-secondary leading-snug">
      {paidRows.length > 0 && (
        <p>
          <span className="font-bold text-emerald-700 dark:text-emerald-400">Paid</span>{' '}
          {paidRows.map((r) => `${r.code} ${r.balanceDays}`).join(' · ')}
        </p>
      )}
      {unpaidRows.length > 0 && (
        <p>
          <span className="font-bold text-amber-700 dark:text-amber-400">Unpaid / LOP</span>{' '}
          {unpaidRows.map((r) => `${r.code} ${r.balanceDays}`).join(' · ')}
        </p>
      )}
      {fyLabel && clPosted != null && cclPosted != null && (
        <p className="text-text-secondary/80 pt-0.5">
          FY {fyLabel}: {clPosted} CL credited · {cclPosted} CCL credited (register)
        </p>
      )}
    </div>
  );

  const pendingFooter = (
    <div className="flex flex-col gap-0.5 text-[10px] md:text-xs font-semibold text-text-secondary">
      <span>
        Leave <span className="text-text-primary">{pendingLeave}</span>
      </span>
      <span>
        OD <span className="text-text-primary">{pendingOd}</span>
      </span>
    </div>
  );

  const holidayFooter =
    stats.upcomingHolidaysList && stats.upcomingHolidaysList.length > 0 ? (
      <ul className="space-y-0.5 text-[9px] md:text-[10px] text-text-secondary max-h-24 overflow-y-auto">
        {stats.upcomingHolidaysList.slice(0, 6).map((h) => (
          <li key={`${h.date}-${h.name}`} className="flex justify-between gap-2">
            <span className="truncate font-medium text-text-primary/90">{h.name}</span>
            <span className="shrink-0 tabular-nums">{formatShortDate(h.date)}</span>
          </li>
        ))}
      </ul>
    ) : null;
      const isCreatedToday = (dateVal?: string | Date) => {
    if (!dateVal) return false;
    const d = new Date(dateVal);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  };

  const latestTodayBroadcast = notifications.find(
    (n) =>
      (n.module === 'communications' ||
        n.eventType === 'broadcast_message' ||
        n.title?.toLowerCase().includes('announcement') ||
        n.title?.toLowerCase().includes('broadcast') ||
        n.message?.toLowerCase().includes('popup')) &&
      isCreatedToday(n.createdAt)
  );

  return (
    <div className="space-y-8">
      {/* Minimal Broadcast Announcement Card for Today */}
      {latestTodayBroadcast && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-purple-50/50 to-pink-50/30 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-slate-900/40 p-4 sm:p-5 shadow-sm transition-all hover:border-indigo-300 dark:hover:border-indigo-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-400/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 bg-indigo-100/80 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800">
                    Announcement Today
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {latestTodayBroadcast.createdAt
                      ? new Date(latestTodayBroadcast.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </span>
                </div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug break-words">
                  {latestTodayBroadcast.title || 'Announcement'}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed whitespace-pre-wrap break-words line-clamp-2 sm:line-clamp-none">
                  {latestTodayBroadcast.message || latestTodayBroadcast.content}
                </p>
              </div>
            </div>

            {!latestTodayBroadcast.isRead && markOneRead && (
              <div className="shrink-0 flex sm:flex-col items-end justify-end">
                <button
                  onClick={() => markOneRead(latestTodayBroadcast._id)}
                  className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-sm transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Acknowledge
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <DashboardCard
          title="Paid leave (register)"
          value={paidTotal}
          description="Sum of paid-type balances from your leave register"
          footer={rows.length > 0 ? leaveTypeFooter : undefined}
          icon={<Calendar className="w-full h-full" />}
        />
        <DashboardCard
          title="In progress"
          value={pendingTotal}
          description="Leave & OD applications awaiting approval"
          footer={pendingFooter}
          icon={<Clock className="w-full h-full" />}
        />
        <DashboardCard
          title="Monthly presence"
          value={stats.todayPresent || 0}
          description="Present / partial days this month"
          icon={<CheckCircle2 className="w-full h-full" />}
        />
        <DashboardCard
          title="Holidays ahead"
          value={nextHolName}
          description={
            nextHolDate
              ? `Next: ${formatShortDate(nextHolDate)} · ${holCount} day(s) in next 120d (calendar + attendance)`
              : 'Calendar for your division / group, plus attendance-marked holidays'
          }
          footer={holidayFooter}
          icon={<Star className="w-full h-full" />}
        />
      </div>

      {roster.length > 0 && (
        <div className="rounded-xl border border-border-base bg-bg-surface/70 backdrop-blur p-4 md:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3 md:mb-4">
            <Building2 className="w-4 h-4 md:w-5 md:h-5 text-indigo-500 shrink-0" />
            <h2 className="text-sm md:text-base font-black text-text-primary uppercase tracking-wide">Shift roster (14 days)</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-2 md:gap-3">
            {roster.map((d) => (
              <div
                key={d.date}
                className="rounded-lg border border-border-base bg-bg-base/80 px-2 py-2 md:px-3 md:py-2.5 text-[10px] md:text-xs"
              >
                <p className="font-bold text-text-primary tabular-nums">{formatShortDate(d.date)}</p>
                {d.rosterStatus === 'HOL' && (
                  <p className="text-amber-700 dark:text-amber-400 font-semibold mt-0.5">Holiday</p>
                )}
                {d.rosterStatus === 'WO' && (
                  <p className="text-slate-500 font-semibold mt-0.5">Week off</p>
                )}
                {!d.rosterStatus && d.shiftName && (
                  <p className="text-text-secondary font-medium mt-0.5 truncate" title={d.shiftName}>
                    {d.shiftName}
                  </p>
                )}
                {!d.rosterStatus && !d.shiftName && <p className="text-text-secondary/70 mt-0.5">—</p>}
                {d.shiftTime && !['HOL', 'WO'].includes(String(d.rosterStatus || '')) && (
                  <p className="text-[9px] text-text-secondary/90 tabular-nums mt-0.5">{d.shiftTime}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        {/* Notifications & Announcements Feed */}
        <div className="lg:col-span-2 p-4 md:p-6 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm h-fit space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-xl font-black text-text-primary flex items-center gap-2 md:gap-3">
              <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
              Notifications & Announcements
            </h2>
            {notifications.filter((n) => !n.isRead).length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                {notifications.filter((n) => !n.isRead).length} unread
              </span>
            )}
          </div>

          <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-text-secondary text-xs font-medium bg-bg-base/30 rounded-2xl border border-border-base/40">
                <Bell className="w-7 h-7 mx-auto mb-2 text-text-secondary/40" />
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const isBroadcast =
                  n.module === 'communications' ||
                  n.eventType === 'broadcast_message' ||
                  n.title?.toLowerCase().includes('announcement') ||
                  n.title?.toLowerCase().includes('broadcast');

                return (
                  <div
                    key={n._id}
                    onClick={() => !n.isRead && markOneRead?.(n._id)}
                    className={`p-3 md:p-3.5 rounded-xl md:rounded-2xl border transition-all cursor-pointer ${
                      n.isRead
                        ? 'bg-bg-base/40 border-border-base/60 hover:bg-bg-base/60'
                        : 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500/30 hover:border-indigo-500/50 shadow-sm'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase tracking-wider ${
                            isBroadcast
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                              : n.module === 'leaves' || n.module === 'od'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                          }`}
                        >
                          {isBroadcast ? 'Announcement' : n.module?.replace('_', ' ') || 'Notice'}
                        </span>
                        <h4 className="font-bold text-text-primary text-xs md:text-sm">{n.title}</h4>
                      </div>
                      {!n.isRead && (
                        <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-1.5 leading-relaxed whitespace-pre-wrap">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-text-secondary/70 mt-2 pt-2 border-t border-border-base/30">
                      <span>
                        {new Date(n.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      {!n.isRead && (
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                          Mark as read
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* My Portal Card */}
        <div className="p-4 md:p-8 rounded-2xl md:rounded-3xl bg-bg-surface/50 border border-border-base backdrop-blur-md shadow-sm h-fit">
          <h2 className="text-base md:text-xl font-black text-text-primary mb-4 md:mb-6 flex items-center gap-2 md:gap-3">
            <span className="w-1.5 md:w-2 h-4 md:h-6 bg-indigo-500 rounded-full" />
            My Portal
          </h2>
          <div className="grid grid-cols-1 gap-2 md:gap-4">
            <QuickLink href="/leaves" label="Apply Absence" desc="Leave or OD request" icon={<Calendar />} color="indigo" />
            <QuickLink href="/attendance" label="Time Card" desc="Review daily logs" icon={<Clock />} color="blue" />
            <QuickLink href="/payslips" label="Earnings" desc="View monthly payslips" icon={<FileText />} color="teal" />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper Components
function QuickLink({ href, label, desc, icon, color }: { href: string; label: string; desc: string; icon: any; color: string }) {
  const colors: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    teal: 'text-teal-600 bg-teal-50 border-teal-100',
  };

  return (
    <Link href={href} className="flex items-center gap-2 md:gap-4 p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-surface border border-border-base hover:border-indigo-200 hover:shadow-md transition-all group">
      <div className={`p-2 md:p-3 rounded-lg md:rounded-xl ${colors[color]} group-hover:scale-110 transition-transform shrink-0`}>
        {React.cloneElement(icon, { className: 'w-4 h-4 md:w-5 md:h-5' })}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-text-primary text-xs md:text-sm group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{label}</h4>
        <p className="text-[10px] md:text-xs text-text-secondary truncate">{desc}</p>
      </div>
      <ChevronRight className="w-3 h-3 md:w-4 md:h-4 text-text-secondary/30 group-hover:translate-x-1 transition-transform shrink-0" />
    </Link>
  );
}

function NotificationItem({ icon, title, desc, status, color }: { icon: string; title: string; desc: string; status: string; color: string }) {
  const colors: Record<string, string> = {
    positive: 'text-status-positive bg-status-positive/10',
    warning: 'text-status-warning bg-status-warning/10',
    primary: 'text-indigo-600 bg-indigo-600/10',
  };

  return (
    <div className="flex items-center justify-between p-2.5 md:p-4 rounded-xl md:rounded-2xl bg-bg-base/50 border border-border-base group hover:bg-bg-base transition-colors">
      <div className="flex items-center gap-2 md:gap-4">
        <div className={`w-8 h-8 md:w-12 md:h-12 rounded-lg md:rounded-xl flex items-center justify-center font-black text-base md:text-xl group-hover:scale-110 transition-transform shrink-0 ${colors[color]}`}>
          {icon}
        </div>
        <div>
          <h3 className="font-bold text-text-primary text-xs md:text-sm">{title}</h3>
          <p className="text-[10px] md:text-xs text-text-secondary">{desc}</p>
        </div>
      </div>
      <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-wide md:tracking-widest px-2 md:px-3 py-0.5 md:py-1 rounded-full shrink-0 ${colors[color]}`}>
        {status}
      </span>
    </div>
  );
}

