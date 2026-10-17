'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { auth } from '@/lib/auth';

declare global {
  interface Window {
    PydahSwitcher?: {
      init: (config: Record<string, unknown>) => void;
      close?: () => void;
      setSession?: (config: Record<string, unknown>) => void;
    };
    PydahPortalSwitcher?: {
      init: (config: Record<string, unknown>) => void;
      close?: () => void;
      setSession?: (config: Record<string, unknown>) => void;
    };
  }
}

const SCRIPT_ID = 'pydah-portal-switcher-cdn';
const PORTAL_ID = 'hrms';
const CDN_URL = process.env.NEXT_PUBLIC_PORTAL_SWITCHER_URL || 'https://crm.pydah.edu.in/portal-switcher.js';
const API_BASE_URL = process.env.NEXT_PUBLIC_CRM_BACKEND_URL || 'https://pydah-crm-backend.pydah.edu.in';
const LANDING_URL = process.env.NEXT_PUBLIC_CRM_URL || 'https://crm.pydah.edu.in';

export default function PortalSwitcher() {
  const pathname = usePathname();
  const [ssoActive, setSsoActive] = useState(() => (typeof window !== 'undefined' ? auth.isSSOUser() : false));

  // Keep SSO state reactive with auth changes, storage events, and route navigation
  useEffect(() => {
    const checkSSO = () => {
      setSsoActive(auth.isSSOUser());
    };

    window.addEventListener('auth-change', checkSSO);
    window.addEventListener('auth-logout', checkSSO);
    window.addEventListener('storage', checkSSO);

    checkSSO();

    return () => {
      window.removeEventListener('auth-change', checkSSO);
      window.removeEventListener('auth-logout', checkSSO);
      window.removeEventListener('storage', checkSSO);
    };
  }, [pathname]);

  useEffect(() => {
    // Check if current route is a public or auth-related screen
    const isPublicPage =
      !pathname ||
      pathname === '/' ||
      pathname === '/login' ||
      pathname === '/forgot-password' ||
      pathname.startsWith('/outpass') ||
      pathname.startsWith('/public');

    // STRICT SSO RULE: Render ONLY if the user is authenticated via SSO and is on an active internal route
    const shouldShow = ssoActive && !isPublicPage;

    const cleanupSwitcher = () => {
      const switcher = window.PydahSwitcher || window.PydahPortalSwitcher;
      if (switcher?.close) {
        try {
          switcher.close();
        } catch {
          // ignore
        }
      }

      // Hide and completely remove any custom web component elements created by the switcher
      const customElements = document.querySelectorAll(
        'pydah-portal-switcher, portal-switcher, [data-pydah-switcher], #pydah-portal-switcher'
      );
      customElements.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
        el.remove();
      });

      // Remove the script tag so it does not persist for normal / non-SSO sessions
      const hasSsoToken = typeof window !== 'undefined' && Boolean(new URLSearchParams(window.location.search).get('token'));
      if (!hasSsoToken) {
        const existingScript = document.getElementById(SCRIPT_ID);
        if (existingScript) {
          existingScript.remove();
        }
      }
    };

    if (!shouldShow) {
      cleanupSwitcher();
      return;
    }

    // SSO is verified and user is on an authorized portal page: load and initialize the switcher
    const token = auth.getToken() || (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);
    const user = auth.getUser();

    const initSwitcher = () => {
      const switcher = window.PydahSwitcher || window.PydahPortalSwitcher;
      if (switcher?.init) {
        switcher.init({
          currentPortal: PORTAL_ID,
          apiBaseUrl: API_BASE_URL,
          landingUrl: LANDING_URL,
          token: token,
          user: user || {},
          position: 'bottom-right',
        });
      } else if (switcher?.setSession) {
        switcher.setSession({
          token: token,
          user: user || {},
        });
      }

      // Ensure switcher elements are visible if previously hidden
      const customElements = document.querySelectorAll(
        'pydah-portal-switcher, portal-switcher, [data-pydah-switcher], #pydah-portal-switcher'
      );
      customElements.forEach((el) => {
        (el as HTMLElement).style.display = '';
      });
    };

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = CDN_URL;
      script.async = true;
      script.setAttribute('data-current-portal', PORTAL_ID);
      script.setAttribute('data-api-base-url', API_BASE_URL);
      script.setAttribute('data-landing-url', LANDING_URL);
      script.setAttribute('data-position', 'bottom-right');

      script.onload = () => {
        initSwitcher();
      };

      script.onerror = (err) => {
        console.warn('[PortalSwitcher] Failed to load portal-switcher.js CDN script:', err);
      };

      document.body.appendChild(script);
    } else {
      initSwitcher();
    }

    return () => {
      // In case user navigates to public route or logs out
      if (!auth.isSSOUser()) {
        cleanupSwitcher();
      }
    };
  }, [ssoActive, pathname]);

  return null;
}
