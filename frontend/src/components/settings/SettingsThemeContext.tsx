'use client';

import React, { createContext, useContext, type ReactNode } from 'react';
import {
  getSettingsTheme,
  settingsThemeCssVars,
  type SettingsThemeKey,
  type SettingsThemeTokens,
} from '@/lib/settingsTheme';

const SettingsThemeContext = createContext<SettingsThemeTokens>(getSettingsTheme('general'));

export function SettingsThemeProvider({
  themeKey,
  children,
  className = '',
}: {
  themeKey: SettingsThemeKey;
  children: ReactNode;
  className?: string;
}) {
  const theme = getSettingsTheme(themeKey);
  return (
    <SettingsThemeContext.Provider value={theme}>
      <div className={`settings-themed-scope w-full min-w-0 ${className}`.trim()} style={settingsThemeCssVars(themeKey)}>
        {children}
      </div>
    </SettingsThemeContext.Provider>
  );
}

/** Nest inside a tab panel — workflow blocks use violet while parent tab keeps its palette. */
export function SettingsWorkflowTheme({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <SettingsThemeProvider themeKey="workflow" className={className}>
      {children}
    </SettingsThemeProvider>
  );
}

export function useSettingsTheme(): SettingsThemeTokens {
  return useContext(SettingsThemeContext);
}
