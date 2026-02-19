'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { QRCodeSVG } from 'qrcode.react';

interface PermissionData {
  _id: string;
  employeeId: {
    _id: string;
    emp_no: string;
    employee_name: string;
    department?: { _id: string; name: string };
    designation?: { _id: string; name: string };
    photo?: string;
  };
  employeeNumber: string;
  date: string;
  permissionStartTime: string;
  permissionEndTime: string;
  permissionHours: number;
  purpose: string;
  status: string;
  qrCode: string;
  qrExpiry: string;
  approvedBy?: {
    name: string;
    email: string;
  };
  approvedAt: string;
  comments?: string;
}

export default function OutpassPage() {
  const params = useParams();
  const qrCode = params?.qrCode as string;
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<PermissionData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (qrCode) {
      loadOutpass();
    }
  }, [qrCode]);

  const loadOutpass = async () => {
    if (!qrCode) {
      setError('QR code is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await api.getOutpassByQR(qrCode);
      if (response.success && response.data) {
        setPermission(response.data);
      } else {
        setError(response.message || 'Invalid or expired QR code');
      }
    } catch (err: any) {
      console.error('Error loading outpass:', err);
      setError(err.message || 'Failed to load outpass information');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '-';
    try {
      const date = new Date(time);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
    } catch {
      return time;
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      });
    } catch {
      return dateStr;
    }
  };

  const formatDateTime = (time: string) => {
    if (!time) return '-';
    try {
      const date = new Date(time);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'UTC'
      });
    } catch {
      return time;
    }
  };

  if (loading) {
    return (
      <div className="relative min-h-screen">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
        <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-slate-500 border-t-transparent"></div>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Loading outpass...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !permission) {
    return (
      <div className="relative min-h-screen">
        <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
        <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20">
                <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white">Invalid QR Code</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'This QR code is invalid or has expired.'}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="relative min-h-screen">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-green-50/40 via-green-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

      <div className="relative z-10 mx-auto max-w-[1920px] px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Outpass</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Permission to Leave Premises</p>
          </div>
        </div>

        {/* Top Row - Approved By, Valid Till, Print Button */}
        {permission && (
          <div className="mb-6 flex flex-wrap items-center gap-4">
            {permission.approvedBy && (
              <div className="flex-1 min-w-[200px] rounded-xl border border-green-200 bg-green-50/50 p-4 dark:border-green-800 dark:bg-green-900/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-green-700 dark:text-green-300">Approved By</p>
                    <p className="mt-1 text-sm font-semibold text-green-900 dark:text-green-200">
                      {permission.approvedBy.name}
                    </p>
                    <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                      {formatDateTime(permission.approvedAt)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {permission.qrExpiry && (
              <div className="flex-1 min-w-[200px] rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Valid Until</p>
                    <p className="mt-1 text-sm font-semibold text-blue-900 dark:text-blue-200">
                      {formatDateTime(permission.qrExpiry)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-shrink-0">
              <button
                onClick={() => window.print()}
                className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <svg className="mr-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print Outpass
              </button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Employee & Permission Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Employee Information */}
            <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Employee Information</h2>
              <div className="flex items-start gap-4">
                {permission.employeeId?.photo ? (
                  <img
                    src={permission.employeeId.photo}
                    alt={permission.employeeId.employee_name}
                    className="h-20 w-20 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-2xl font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                    {permission.employeeId?.employee_name?.charAt(0)?.toUpperCase() || permission.employeeNumber?.charAt(0)?.toUpperCase() || 'E'}
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {permission.employeeId?.employee_name || permission.employeeNumber}
                  </h3>
                  <div className="mt-3 space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      <span className="font-medium">Employee No:</span> {permission.employeeNumber}
                    </p>
                    {permission.employeeId?.department && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Department:</span> {permission.employeeId.department.name}
                      </p>
                    )}
                    {permission.employeeId?.designation && (
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span className="font-medium">Designation:</span> {permission.employeeId.designation.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Permission Details */}
            <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Permission Details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Date</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDate(permission.date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Duration</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {permission.permissionHours} {permission.permissionHours === 1 ? 'hour' : 'hours'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Start Time</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDateTime(permission.permissionStartTime)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">End Time</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                    {formatDateTime(permission.permissionEndTime)}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Purpose</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {permission.purpose}
                </p>
              </div>
              {permission.comments && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Comments</p>
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">
                    {permission.comments}
                  </p>
                </div>
              )}
            </div>

          </div>

          {/* Right Column - QR Code */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
              <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">QR Code</h2>
              <div className="flex flex-col items-center">
                <div className="mb-4 flex h-64 w-64 items-center justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                  {currentUrl && (
                    <QRCodeSVG
                      value={currentUrl}
                      size={240}
                      level="H"
                      includeMargin={true}
                    />
                  )}
                </div>
                <div className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">QR Code</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-900 dark:text-white">
                    {permission.qrCode}
                  </p>
                </div>
                <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  Scan this QR code to verify the outpass
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white/80 backdrop-blur-sm p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900/80">
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            This is an authorized outpass. Please present this QR code when leaving the premises.
          </p>
          <p className="mt-2 text-center text-xs text-slate-400 dark:text-slate-500">
            Generated on {new Date().toLocaleString()}
          </p>
        </div>

      </div>
    </div>
  );
}
