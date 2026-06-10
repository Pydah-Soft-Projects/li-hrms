'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { toast } from 'react-toastify';
import { SettingsSkeleton } from './SettingsSkeleton';
import { MessageSquare, Mail, ShieldCheck, Zap } from 'lucide-react';
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsSectionCard,
  SettingsSaveBar,
} from '@/components/settings/SettingsPageShell';
import { settingsLedgerBorder } from '@/lib/settingsUi';

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

    if (loading) return <SettingsSkeleton />;

    return (
        <SettingsPanel>
            <SettingsPanelHeader
                section="Communications"
                title="Communication & Security Infrastructure"
                subtitle="Orchestrate credential deployment and automated notification channels."
            />

            <div className="grid grid-cols-1 gap-10 xl:grid-cols-2">
                <SettingsSectionCard
                    title="Credential Generation"
                    description="Automated Password Engine"
                >
                    <div className="space-y-4">
                        {[
                            { id: 'random', title: 'Cryptographic Random', desc: 'Secure, non-deterministic alphanumeric strings.' },
                            { id: 'phone_empno', title: 'Deterministic Base', desc: 'Constructed from employee identifiers for accessibility.' }
                        ].map((mode) => (
                            <label
                                key={mode.id}
                                className={`group flex cursor-pointer items-start justify-between border-2 p-5 transition-all ${
                                    passwordGenerationMode === mode.id
                                    ? 'border-[color:var(--ps-accent)] bg-[var(--ps-accent-soft)]'
                                    : 'border-transparent bg-stone-50 hover:border-stone-200 dark:bg-stone-900 dark:hover:border-stone-800'
                                }`}
                                style={settingsLedgerBorder}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${passwordGenerationMode === mode.id ? 'border-[color:var(--ps-accent)] bg-[color:var(--ps-accent)]' : 'border-stone-300 dark:border-stone-700'}`}>
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
                                        <p className={`text-xs font-semibold uppercase tracking-tight ${passwordGenerationMode === mode.id ? 'text-[color:var(--ps-accent-ink)]' : 'text-stone-500'}`}>{mode.title}</p>
                                        <p className="mt-1 text-[10px] font-medium leading-relaxed text-stone-400">{mode.desc}</p>
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                    title="Deployment Matrix"
                    description="Authorization Delivery Channels"
                >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {[
                            { id: 'email_only', title: 'SMTP ONLY', icon: Mail, color: 'text-blue-500' },
                            { id: 'sms_only', title: 'GSM ONLY', icon: MessageSquare, color: 'text-emerald-500' },
                            { id: 'both', title: 'REDUNDANT', icon: ShieldCheck, color: 'text-indigo-500' },
                            { id: 'intelligent', title: 'ROUTING', icon: Zap, color: 'text-amber-500' }
                        ].map((strategy) => (
                            <label
                                key={strategy.id}
                                className={`group flex cursor-pointer flex-col border-2 p-5 transition-all ${
                                    credentialDeliveryStrategy === strategy.id
                                    ? 'border-[color:var(--ps-accent)] bg-[var(--ps-accent-soft)]'
                                    : 'border-transparent bg-stone-50 hover:border-stone-200 dark:bg-stone-900 dark:hover:border-stone-800'
                                }`}
                                style={settingsLedgerBorder}
                            >
                                <div className="mb-4 flex items-center justify-between">
                                    <div className={`p-2 ${credentialDeliveryStrategy === strategy.id ? 'bg-white dark:bg-stone-950' : 'bg-transparent'}`}>
                                        <strategy.icon className={`h-5 w-5 ${credentialDeliveryStrategy === strategy.id ? strategy.color : 'text-stone-300'}`} />
                                    </div>
                                    <input
                                        type="radio"
                                        name="deliveryStrat"
                                        checked={credentialDeliveryStrategy === strategy.id}
                                        onChange={() => setCredentialDeliveryStrategy(strategy.id as 'email_only' | 'sms_only' | 'both' | 'intelligent')}
                                        className="h-4 w-4 border-stone-300 text-[color:var(--ps-accent)] focus:ring-[color:var(--ps-accent)]"
                                    />
                                </div>
                                <span className={`text-[10px] font-semibold uppercase tracking-widest ${credentialDeliveryStrategy === strategy.id ? 'text-[color:var(--ps-accent-ink)]' : 'text-stone-400'}`}>{strategy.title}</span>
                            </label>
                        ))}
                    </div>
                </SettingsSectionCard>
            </div>

            <SettingsSaveBar onSave={handleSave} saving={saving} label="Save Matrix Configuration" />
        </SettingsPanel>
    );
};

export default CommunicationSettings;
