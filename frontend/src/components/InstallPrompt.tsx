'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      checkIfShouldShow();
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const checkIfShouldShow = () => {
    const lastDismissed = localStorage.getItem('installPromptDismissed');
    if (lastDismissed) {
      const timeSinceDismissed = Date.now() - parseInt(lastDismissed, 10);
      // Show again if 2 minutes have passed (120000 ms)
      if (timeSinceDismissed > 120000) {
        setShowPrompt(true);
      }
    } else {
      setShowPrompt(true);
    }
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowPrompt(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[420px] z-100 bg-slate-900/90 backdrop-blur-md text-white p-4 rounded-3xl shadow-2xl animate-in slide-in-from-top-4 duration-500 border border-white/10 ring-1 ring-black/5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 bg-linear-to-br from-blue-500 to-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 shrink-0">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-sm">Install App</p>
          <p className="text-xs text-slate-300">Add to home screen for better experience</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDismiss}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
        <button
          onClick={handleInstallClick}
          className="px-5 py-2 bg-white text-slate-900 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-100 transition-colors shadow-lg shadow-white/10"
        >
          Install
        </button>
      </div>
    </div>
  );
}
