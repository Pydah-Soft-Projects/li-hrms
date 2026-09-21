'use client';

import React, { useEffect, useState } from 'react';
import { MapPin, Shield, Smartphone, Globe, CheckCircle2, AlertTriangle, RefreshCw, Save, Navigation, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import { alertSuccess, alertError } from '@/lib/customSwal';
import GeofenceMapPicker from '@/components/settings/GeofenceMapPicker';

interface GeofenceConfig {
  enabled: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  locationName: string;
}

interface LoginMetricsData {
  summary: {
    totalLogins: number;
    webLogins: number;
    mobileLogins: number;
    failedLogins: number;
  };
  dailyTrend: Array<{
    date: string;
    webSuccess: number;
    mobileSuccess: number;
    failed: number;
  }>;
}

export default function GeofenceSettings() {
  const [config, setConfig] = useState<GeofenceConfig>({
    enabled: false,
    latitude: 16.9048,
    longitude: 82.2369,
    radiusMeters: 500,
    locationName: 'Head Office',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<LoginMetricsData | null>(null);
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getSetting('mobile_login_geofence');
      const dataObj = res?.data?.value ?? res?.data ?? (res as any)?.value;
      if (dataObj && typeof dataObj === 'object' && dataObj !== null) {
        const val = dataObj as Partial<GeofenceConfig>;
        const isEnabled = val.enabled === true || (val as any).enabled === 'true';
        setConfig({
          enabled: isEnabled,
          latitude: typeof val.latitude === 'number' ? val.latitude : 16.9048,
          longitude: typeof val.longitude === 'number' ? val.longitude : 82.2369,
          radiusMeters: typeof val.radiusMeters === 'number' ? val.radiusMeters : 500,
          locationName: val.locationName || 'Head Office',
        });
      }
    } catch (err: any) {
      toast.error('Failed to load geofence settings');
    } finally {
      setLoading(false);
    }
  };

  const loadLoginMetrics = async () => {
    setLoadingMetrics(true);
    try {
      const res = await (api as any).getLoginMetrics?.();
      if (res && res.success && res.data) {
        setMetrics(res.data);
      }
    } catch {
      /* ignore if not available */
    } finally {
      setLoadingMetrics(false);
    }
  };

  useEffect(() => {
    loadData();
    loadLoginMetrics();
  }, []);

  const handleToggleEnabled = async (newEnabled: boolean) => {
    const updatedConfig = { ...config, enabled: newEnabled };
    setConfig(updatedConfig);
    try {
      const res = await api.upsertSetting({
        key: 'mobile_login_geofence',
        value: updatedConfig,
        category: 'geofence',
        description: 'Superadmin Geofence & Location Restriction for Mobile App Login',
      });
      if (res && res.success) {
        const msg = `Geofence restriction is now ${newEnabled ? 'ACTIVE' : 'DISABLED'}.`;
        setSaveMessage(msg);
        toast.success(newEnabled ? 'Geofence status activated!' : 'Geofence status disabled!');
      } else {
        toast.error('Failed to update geofence status');
        setConfig(config);
      }
    } catch {
      toast.error('Error updating geofence status');
      setConfig(config);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
      return;
    }
    toast.loading('Fetching browser position...', { id: 'geo' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig((prev) => ({
          ...prev,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
        }));
        toast.success('Coordinates updated to your current location!', { id: 'geo' });
      },
      (err) => {
        toast.error(`Could not get position: ${err.message}`, { id: 'geo' });
      }
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await api.upsertSetting({
        key: 'mobile_login_geofence',
        value: config,
        category: 'geofence',
        description: 'Superadmin Geofence & Location Restriction for Mobile App Login',
      });
      if (res && res.success) {
        const msg = `Geofence settings saved successfully! Status: ${config.enabled ? 'ACTIVE (' + config.radiusMeters + 'm radius around ' + (config.locationName || 'center') + ')' : 'DISABLED'}.`;
        setSaveMessage(msg);
        toast.success('Geofence settings saved!');
        alertSuccess(
          'Geofence Settings Saved',
          `Mobile App Geofence configuration updated successfully.\nLocation: ${config.locationName || 'Company Area'}\nRadius: ${config.radiusMeters} meters\nStatus: ${config.enabled ? 'ACTIVE' : 'DISABLED'}`
        );
      } else {
        const errMsg = (res as any)?.message || 'Failed to save geofence settings';
        toast.error(errMsg);
        alertError('Save Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Error saving geofence settings';
      toast.error(errMsg);
      alertError('Save Error', errMsg);
    } finally {
      setSaving(false);
    }
  };

  const mapUrl = `https://www.google.com/maps?q=${config.latitude},${config.longitude}`;

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span>Loading geofence configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner / Card */}
      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/40 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                Mobile App Geofence & Location Restrictions
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 max-w-2xl">
              Configure perimeter restrictions for Mobile App sign-ins. When enabled, mobile users can only log in within the defined radius and will be automatically logged out if they leave the geofenced area.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-2.5 rounded-xl shadow-sm">
            <div className="text-right">
              <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</div>
              <div className={`text-sm font-bold ${config.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>
                {config.enabled ? 'GEOFENCE ACTIVE' : 'DISABLED'}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => handleToggleEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:peer-focus:ring-emerald-800 peer-checked:bg-emerald-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Save Success Message Banner */}
      {saveMessage && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded-2xl flex items-center justify-between gap-3 text-emerald-900 dark:text-emerald-200 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Check className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <div className="font-bold text-sm">Geofence Configuration Saved</div>
              <div className="text-xs text-emerald-700 dark:text-emerald-300">{saveMessage}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSaveMessage(null)}
            className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline font-semibold px-2 py-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Form & Interactive Preview */}
      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-500" />
            Geofence Boundary Details
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Location Name / Workplace Title
              </label>
              <input
                type="text"
                value={config.locationName}
                onChange={(e) => setConfig((prev) => ({ ...prev, locationName: e.target.value }))}
                placeholder="e.g. Head Office Campus, Kakinada Office"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            {/* Interactive Map Picker with Search Bar */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Interactive Map Location Picker & Address Search
              </label>
              <GeofenceMapPicker
                lat={config.latitude}
                lng={config.longitude}
                radiusMeters={config.radiusMeters}
                locationName={config.locationName}
                onSelectLocation={(newLat, newLng, name) => {
                  setConfig((prev) => ({
                    ...prev,
                    latitude: newLat,
                    longitude: newLng,
                    locationName: name || prev.locationName,
                  }));
                }}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={config.latitude}
                  onChange={(e) => setConfig((prev) => ({ ...prev, latitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="any"
                  value={config.longitude}
                  onChange={(e) => setConfig((prev) => ({ ...prev, longitude: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleUseCurrentLocation}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800/60"
              >
                <Navigation className="w-3.5 h-3.5" />
                Fill with my current browser GPS position
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Allowed Radius (meters)
              </label>
              <input
                type="number"
                min="10"
                max="50000"
                value={config.radiusMeters}
                onChange={(e) => setConfig((prev) => ({ ...prev, radiusMeters: parseInt(e.target.value, 10) || 100 }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Mobile app sign-ins will be permitted only when the device GPS is within {config.radiusMeters} meters of ({config.latitude}, {config.longitude}).
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-sm flex items-center gap-2 disabled:opacity-50 transition-all"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Geofence Settings</span>
            </button>
          </div>
        </div>

        {/* Live Preview Card */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <h4 className="text-md font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              Live Geofence Summary
            </h4>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-3 border border-slate-200/60 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Location:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{config.locationName || 'Not Set'}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Center Coordinates:</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">{config.latitude}, {config.longitude}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Allowed Perimeter:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{config.radiusMeters} meters</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500">Mobile Auto-Logout:</span>
                <span className={`font-semibold ${config.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {config.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <a
              href={mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-700 dark:text-slate-300 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              View Center Location on Google Maps
            </a>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl text-xs text-amber-800 dark:text-amber-300 space-y-2">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Important Geofence Notice
            </div>
            <p>
              When Geofence restriction is enabled, employees attempting to sign in via the mobile app outside the designated radius will be blocked with an explicit geofence error.
            </p>
            <p>
              Ensure location permissions are granted on employee mobile devices.
            </p>
          </div>
        </div>
      </form>

      {/* Login Metrics Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-500" />
              Web vs Mobile Login Metrics
            </h3>
            <p className="text-xs text-slate-500">
              Audit log metrics of user authentication attempts classified by device platform.
            </p>
          </div>
          <button
            onClick={loadLoginMetrics}
            disabled={loadingMetrics}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMetrics ? 'animate-spin' : ''}`} />
            Refresh Metrics
          </button>
        </div>

        {metrics ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                Web Logins
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {metrics.summary.webLogins}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Successful web portal logins</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5 text-emerald-500" />
                Mobile Logins
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {metrics.summary.mobileLogins}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Successful mobile app logins</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                Failed Attempts
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {metrics.summary.failedLogins}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Blocked/Invalid login attempts</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                Total Audited Logins
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {metrics.summary.totalLogins}
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">Lifetime authentication records</div>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-xs text-slate-400">
            Login metrics data loading...
          </div>
        )}
      </div>
    </div>
  );
}
