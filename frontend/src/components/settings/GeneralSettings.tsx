'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, Clock } from 'lucide-react';

const GeneralSettings = () => {
  const [lateInGrace, setLateInGrace] = useState<number>(15);
  const [earlyOutGrace, setEarlyOutGrace] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [resLate, resEarly] = await Promise.all([
        api.getSetting('late_in_grace_time'),
        api.getSetting('early_out_grace_time'),
      ]);

      if (resLate.success && resLate.data) setLateInGrace(Number(resLate.data.value));
      if (resEarly.success && resEarly.data) setEarlyOutGrace(Number(resEarly.data.value));
    } catch (err) {
      console.error('Failed to load general settings', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const [resLate, resEarly] = await Promise.all([
        api.upsertSetting({
          key: 'late_in_grace_time',
          value: lateInGrace,
          category: 'general',
          description: 'Global Late In Grace Period (Minutes)'
        }),
        api.upsertSetting({
          key: 'early_out_grace_time',
          value: earlyOutGrace,
          category: 'general',
          description: 'Global Early Out Grace Period (Minutes)'
        })
      ]);

      if (resLate.success && resEarly.success) {
        toast.success('General settings saved successfully');
      } else {
        toast.error('Failed to save general settings');
      }
    } catch (err) {
      toast.error('An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">General Settings</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage global grace periods and other general configurations.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Spinner /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="group relative rounded-2xl border border-gray-200 bg-white/50 p-6 backdrop-blur-sm transition-all hover:border-indigo-500/50 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <label htmlFor="lateInGrace" className="block text-sm font-semibold text-gray-900 dark:text-white">Late In Grace Period</label>
              <p className="text-xs text-gray-500 dark:text-gray-400">Minutes allowed after shift start time.</p>
            </div>
          </div>
          <div className="mt-4">
            <input
              type="number"
              id="lateInGrace"
              value={lateInGrace}
              onChange={(e) => setLateInGrace(Number(e.target.value))}
              className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
        </div>

        <div className="group relative rounded-2xl border border-gray-200 bg-white/50 p-6 backdrop-blur-sm transition-all hover:border-indigo-500/50 hover:shadow-xl dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <label htmlFor="earlyOutGrace" className="block text-sm font-semibold text-gray-900 dark:text-white">Early Out Grace Period</label>
              <p className="text-xs text-gray-500 dark:text-gray-400">Minutes allowed before shift end time.</p>
            </div>
          </div>
          <div className="mt-4">
            <input
              type="number"
              id="earlyOutGrace"
              value={earlyOutGrace}
              onChange={(e) => setEarlyOutGrace(Number(e.target.value))}
              className="w-full rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
