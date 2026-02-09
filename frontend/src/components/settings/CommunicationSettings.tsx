'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, MessageSquare, Mail, ShieldCheck, Zap } from 'lucide-react';

const CommunicationSettings = () => {
    const [passwordGenerationMode, setPasswordGenerationMode] = useState<'random' | 'phone_empno'>('random');
    const [credentialDeliveryStrategy, setCredentialDeliveryStrategy] = useState<'email_only' | 'sms_only' | 'both' | 'intelligent'>('both');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const [resPass, resStrat] = await Promise.all([
                api.getSetting('password_generation_mode'),
                api.getSetting('credential_delivery_strategy'),
            ]);

            if (resPass.success && resPass.data) setPasswordGenerationMode(resPass.data.value);
            if (resStrat.success && resStrat.data) setCredentialDeliveryStrategy(resStrat.data.value);
        } catch (err) {
            console.error('Failed to load communication settings', err);
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
            await Promise.all([
                api.upsertSetting({ key: 'password_generation_mode', value: passwordGenerationMode, category: 'communications' }),
                api.upsertSetting({ key: 'credential_delivery_strategy', value: credentialDeliveryStrategy, category: 'communications' }),
            ]);
            toast.success('Communication settings saved successfully');
        } catch (err) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Communication & Security</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Configure how the system communicates with users and manages credentials.</p>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Password Strategy */}
                <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Credential Generation</h3>
                            <p className="text-xs text-gray-500">Define default password policy for new users.</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[
                            { id: 'random', title: 'Random Generation', desc: 'Secure, randomly generated passwords.' },
                            { id: 'phone_empno', title: 'Phone/EmpNo Base', desc: 'Pre-defined based on user identifiers.' }
                        ].map((mode) => (
                            <label
                                key={mode.id}
                                className={`flex cursor-pointer items-center justify-between rounded-xl border p-4 transition-all ${passwordGenerationMode === mode.id
                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10'
                                        : 'border-gray-100 bg-gray-50/50 hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900/30'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <input
                                        type="radio"
                                        name="passwordMode"
                                        checked={passwordGenerationMode === mode.id}
                                        onChange={() => setPasswordGenerationMode(mode.id as any)}
                                        className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <div>
                                        <p className={`text-sm font-medium ${passwordGenerationMode === mode.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{mode.title}</p>
                                        <p className="text-xs text-gray-500">{mode.desc}</p>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Delivery Strategy */}
                <div className="p-6 rounded-2xl border border-gray-200 bg-white/50 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
                            <Mail className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Delivery Channel</h3>
                            <p className="text-xs text-gray-500">Choose how credentials are sent to users.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { id: 'email_only', title: 'Email Only', icon: Mail },
                            { id: 'sms_only', title: 'SMS Only', icon: MessageSquare },
                            { id: 'both', title: 'Dual Delivery (Recommended)', icon: ShieldCheck },
                            { id: 'intelligent', title: 'Intelligent Routing', icon: Zap }
                        ].map((strategy) => (
                            <label
                                key={strategy.id}
                                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-all ${credentialDeliveryStrategy === strategy.id
                                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/10'
                                        : 'border-gray-100 bg-gray-50/50 hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900/30'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="deliveryStrat"
                                    checked={credentialDeliveryStrategy === strategy.id}
                                    onChange={() => setCredentialDeliveryStrategy(strategy.id as any)}
                                    className="h-4 w-4 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <strategy.icon className={`h-4 w-4 ${credentialDeliveryStrategy === strategy.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                                <span className={`text-sm font-medium ${credentialDeliveryStrategy === strategy.id ? 'text-indigo-900 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>{strategy.title}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunicationSettings;
