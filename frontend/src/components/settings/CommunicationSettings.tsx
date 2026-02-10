'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import Spinner from '@/components/Spinner';
import { Save, MessageSquare, Mail, ShieldCheck, Zap, ChevronRight } from 'lucide-react';

const CommunicationSettings = () => {
    const [passwordGenerationMode, setPasswordGenerationMode] = useState<'random' | 'phone_empno'>('random');
    const [credentialDeliveryStrategy, setCredentialDeliveryStrategy] = useState<'email_only' | 'sms_only' | 'both' | 'intelligent'>('both');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadSettings = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        try {
            setSaving(true);
            await Promise.all([
                api.upsertSetting({ key: 'password_generation_mode', value: passwordGenerationMode, category: 'communications' }),
                api.upsertSetting({ key: 'credential_delivery_strategy', value: credentialDeliveryStrategy, category: 'communications' }),
            ]);
            toast.success('Communication settings saved successfully');
        } catch {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8 text-black" /></div>;

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="border-b border-gray-200 dark:border-gray-800 pb-5 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">
                        <span>Settings</span>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-indigo-600">Communications</span>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Communication & Security Infrastructure</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Orchestrate credential deployment and automated notification channels.</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-xl bg-gray-900 text-white px-5 py-2.5 text-xs font-bold hover:bg-black transition-all shadow-xl shadow-gray-200 dark:shadow-none dark:bg-emerald-600 dark:hover:bg-emerald-700 disabled:opacity-50"
                >
                    {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    Save Matrix Configuration
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                {/* Password Strategy */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 bg-purple-50/10 dark:bg-purple-900/5">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-100/50 text-purple-600 dark:bg-purple-950 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Credential Generation</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Automated Password Engine</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-4 flex-1">
                        {[
                            { id: 'random', title: 'Cryptographic Random', desc: 'Secure, non-deterministic alphanumeric strings.' },
                            { id: 'phone_empno', title: 'Deterministic Base', desc: 'Constructed from employee identifiers for accessibility.' }
                        ].map((mode) => (
                            <label
                                key={mode.id}
                                className={`group flex cursor-pointer items-start justify-between rounded-xl border-2 p-5 transition-all ${passwordGenerationMode === mode.id
                                    ? 'border-purple-500 bg-purple-50/30 dark:bg-purple-950/20 shadow-lg shadow-purple-500/5'
                                    : 'border-gray-50 dark:border-[#0F172A] bg-gray-50/50 dark:bg-[#0F172A] hover:border-gray-200 dark:hover:border-gray-800'
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all ${passwordGenerationMode === mode.id ? 'border-purple-500 bg-purple-500' : 'border-gray-300 dark:border-gray-700'}`}>
                                        {passwordGenerationMode === mode.id && <div className="h-2 w-2 rounded-full bg-white" />}
                                    </div>
                                    <input
                                        type="radio"
                                        name="passwordMode"
                                        checked={passwordGenerationMode === mode.id}
                                        onChange={() => setPasswordGenerationMode(mode.id as 'random' | 'phone_empno')}
                                        className="hidden"
                                    />
                                    <div>
                                        <p className={`text-xs font-black uppercase tracking-tight ${passwordGenerationMode === mode.id ? 'text-purple-700 dark:text-purple-300' : 'text-gray-500'}`}>{mode.title}</p>
                                        <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed">{mode.desc}</p>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </section>

                {/* Delivery Strategy */}
                <section className="bg-white dark:bg-[#1E293B] rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
                    <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 bg-blue-50/10 dark:bg-blue-900/5">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100/50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 border border-blue-100 dark:border-blue-900/50">
                                <Mail className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Deployment Matrix</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight mt-0.5">Authorization Delivery Channels</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
                        {[
                            { id: 'email_only', title: 'SMTP ONLY', icon: Mail, color: 'text-blue-500' },
                            { id: 'sms_only', title: 'GSM ONLY', icon: MessageSquare, color: 'text-emerald-500' },
                            { id: 'both', title: 'REDUNDANT', icon: ShieldCheck, color: 'text-indigo-500' },
                            { id: 'intelligent', title: 'ROUTING', icon: Zap, color: 'text-amber-500' }
                        ].map((strategy) => (
                            <label
                                key={strategy.id}
                                className={`group flex cursor-pointer flex-col p-5 rounded-2xl border-2 transition-all ${credentialDeliveryStrategy === strategy.id
                                    ? 'border-blue-500 bg-blue-50/30 dark:bg-blue-950/20 shadow-lg shadow-blue-500/5'
                                    : 'border-gray-50 dark:border-[#0F172A] bg-gray-50/50 dark:bg-[#0F172A] hover:border-gray-200 dark:hover:border-gray-800'
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <div className={`p-2 rounded-lg ${credentialDeliveryStrategy === strategy.id ? 'bg-white dark:bg-[#1E293B]' : 'bg-transparent'}`}>
                                        <strategy.icon className={`h-5 w-5 ${credentialDeliveryStrategy === strategy.id ? strategy.color : 'text-gray-300'}`} />
                                    </div>
                                    <input
                                        type="radio"
                                        name="deliveryStrat"
                                        checked={credentialDeliveryStrategy === strategy.id}
                                        onChange={() => setCredentialDeliveryStrategy(strategy.id as 'email_only' | 'sms_only' | 'both' | 'intelligent')}
                                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                </div>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${credentialDeliveryStrategy === strategy.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400'}`}>{strategy.title}</span>
                            </label>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default CommunicationSettings;
