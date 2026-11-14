'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { initAfterLoginTheme } from '@/lib/utils';
import { ChevronRight, ShieldCheck, Fingerprint } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [currentLine, setCurrentLine] = useState(0);
  const [prevLine, setPrevLine] = useState(-1);
  const [isShattering, setShattering] = useState(false);
  const [isCharging, setIsCharging] = useState(false);

  const lines = [
    "Workforce Potential",
    "Employee Experience",
    "Talent Strategy",
    "Payroll Dynamics",
    "People Management",
    "Organizational Brilliance"
  ];

  useEffect(() => {
    initAfterLoginTheme();

    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const ssoToken = urlParams.get('token');
      if (ssoToken) {
        auth.clearLocalSession();
        router.replace(`/login?${urlParams.toString()}`);
        return;
      }
    }

    // Check if user is already authenticated
    const token = auth.getToken();
    const user = auth.getUser();

    // Local development delay to preview the Biometric Loader
    const authDelay = setTimeout(() => {
      if (token && user) {
        // User is authenticated, redirect to their dashboard
        const dashboardPath = auth.getRoleBasedPath(user.role);
        router.replace(dashboardPath);
      } else {
        // No token, show welcome page
        setChecking(false);
      }
    }, 1000);

    // Headline rotation interval
    const timer = setInterval(() => {
      setPrevLine(currentLine);
      setCurrentLine((prev) => (prev + 1) % lines.length);
    }, 5000);

    return () => {
      clearTimeout(authDelay);
      clearInterval(timer);
    };
  }, [router, lines.length, currentLine]);

  // Show loading while checking authentication
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 biometric-grid overflow-hidden">
        <div className="relative flex flex-col items-center gap-12">
          {/* Biometric Sensor Frame */}
          <div className="relative w-48 h-48 flex items-center justify-center">
            {/* Corners */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: 'rgba(var(--primary-rgb, 5, 150, 105), 0.35)' }} />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: 'rgba(var(--primary-rgb, 5, 150, 105), 0.35)' }} />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: 'rgba(var(--primary-rgb, 5, 150, 105), 0.35)' }} />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: 'rgba(var(--primary-rgb, 5, 150, 105), 0.35)' }} />
            
            {/* Base Fingerprint (Dim) */}
            <div className="absolute transition-opacity duration-500" style={{ color: 'var(--primary-light, #ECFDF5)' }}>
              <Fingerprint size={120} strokeWidth={1.5} />
            </div>
            
            {/* Scanned Fingerprint (Filing) */}
            <div className="absolute animate-scan-fill" style={{ color: 'var(--primary, #059669)', filter: 'drop-shadow(0 0 10px rgba(var(--primary-rgb, 5, 150, 105), 0.3))' }}>
              <Fingerprint size={120} strokeWidth={1.5} />
            </div>
            
            {/* Scanning Laser Line */}
            <div className="absolute w-64 h-0.5 animate-scan-line z-10" style={{ backgroundColor: 'var(--primary, #059669)', boxShadow: '0 0 10px rgba(var(--primary-rgb, 5, 150, 105), 0.5)' }}>
              <div className="absolute inset-0 blur-sm opacity-50" style={{ backgroundColor: 'var(--primary-hover, var(--primary, #10b981))' }} />
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-2">
            <p className="text-slate-400 font-display font-medium tracking-[0.2em] uppercase text-xs">
              Authenticating Biometrics
            </p>
            <div className="h-1 w-32 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full animate-[scan-fill_3s_ease-in-out_infinite]" style={{ backgroundColor: 'var(--primary, #059669)' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col min-h-screen overflow-x-hidden text-slate-900"
      style={{ backgroundColor: 'var(--primary-50, var(--primary-light, #f0fdf4))' }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/20 backdrop-blur-xl border-b border-white/20 h-20 shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg border border-white/20"
              style={{ background: 'linear-gradient(135deg, var(--primary-hover, var(--primary, #10b981)), var(--primary, #059669))' }}
            >
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold tracking-tight text-slate-900">
              <span style={{ color: 'var(--primary, #059669)' }}>HRMS</span>
            </span>
          </div>
          
          <Link
            href="/login"
            className="group relative inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-white rounded-lg transition-all shadow-md hover:shadow-lg active:scale-95 border border-white/10 overflow-hidden hover:brightness-95"
            style={{ backgroundColor: 'var(--primary, #059669)' }}
          >
            <div className="shimmer-btn-overlay" />
            <span className="relative z-10">Sign In</span>
          </Link>
        </div>
      </header>

      {/* Hero Section - 100vh Independent */}
      <main className="relative z-10 h-[100dvh] flex items-center justify-center px-6 overflow-hidden hero-silk-bg">
        <div className="absolute inset-0 z-0 hero-silk-tint pointer-events-none" />
        <div className="absolute inset-0 z-0 hero-bg-overlay" />
        <div className="absolute inset-0 z-0 hero-silk-sheen pointer-events-none" />

        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto animate-fade-in-up">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-bold tracking-tight text-slate-900 leading-[1.1] mb-6 md:mb-8">
              Revolutionize your <br />
              <div className="h-[1.2em] relative flex justify-center">
                {/* Outgoing Line */}
                {prevLine !== -1 && (
                  <span 
                    key={`prev-${prevLine}`}
                    className="text-gradient absolute top-0 animate-headline-exit whitespace-nowrap"
                  >
                    {lines[prevLine]}
                  </span>
                )}
                {/* Incoming Line */}
                <span 
                  key={`curr-${currentLine}`}
                  className="text-gradient absolute top-0 animate-headline-enter whitespace-nowrap"
                >
                  {lines[currentLine]}
                </span>
              </div>
            </h1>
            
            <p className="text-base md:text-xl text-slate-600 font-light mb-10 md:mb-12 max-w-2xl leading-relaxed">
              Experience a seamless, professional HRMS platform designed to empower your employees and streamline your management processes.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="relative group">
                <button
                  onClick={() => {
                    setIsCharging(true);
                    setTimeout(() => {
                      setIsCharging(false);
                      setShattering(true);
                      setTimeout(() => router.push('/login'), 500);
                    }, 200);
                  }}
                  disabled={isShattering || isCharging}
                  className={`relative inline-flex items-center justify-center px-7 md:px-8 py-3.5 md:py-4 text-base md:text-lg font-semibold text-white bg-slate-900 rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:scale-95 ${isCharging ? 'animate-windup' : ''} ${isShattering ? 'animate-punch pointer-events-none' : 'animate-aura-glow'}`}
                >
                  {!isShattering && !isCharging && <div className="shimmer-btn-overlay delay-2s" />}
                  
                  {isShattering && (
                    <>
                      <div className="impact-ripple" />
                      <div
                        className="absolute inset-0 animate-mist rounded-xl blur-xl"
                        style={{ backgroundColor: 'rgba(var(--primary-rgb, 5, 150, 105), 0.2)' }}
                      />
                      {[...Array(28)].map((_, i) => {
                        const polygons = [
                          'polygon(50% 0%, 0% 100%, 100% 100%)',
                          'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)',
                          'polygon(0% 15%, 15% 0%, 100% 85%, 85% 100%)',
                          'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                          'polygon(10% 25%, 90% 10%, 80% 90%, 20% 80%)'
                        ];
                        const size = Math.random() * 30 + 15;
                        return (
                          <div 
                            key={i} 
                            className="shatter-fragment"
                            style={{
                              width: size + 'px',
                              height: size + 'px',
                              clipPath: polygons[i % polygons.length],
                              '--tx': (Math.random() - 0.5) * 800 + 'px',
                              '--ty': (Math.random() - 0.5) * 800 + 'px',
                              '--tz': (Math.random() * 1200 - 400) + 'px',
                              '--rx': (Math.random() * 1080) + 'deg',
                              '--ry': (Math.random() * 1080) + 'deg',
                              '--rz': (Math.random() * 1080) + 'deg',
                              '--ts': (Math.random() * 2 + 0.5),
                              '--tb': (Math.random() > 0.6 ? '12px' : '0px'),
                              left: (Math.random() * 100) + '%',
                              top: (Math.random() * 100) + '%',
                              background: i % 3 === 0 ? 'var(--primary, #059669)' : i % 3 === 1 ? '#0f172a' : '#334155',
                              animationDelay: (Math.random() * 0.2) + 's'
                            } as any}
                          />
                        );
                      })}
                    </>
                  )}

                  <span className={`relative z-10 flex items-center transition-opacity duration-200 ${isShattering ? 'opacity-0' : 'opacity-100'}`}>
                    Get Started Now
                    <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </button>
              </div>
              <button 
                onClick={() => window.open('#', '_blank')}
                className="px-8 py-4 text-base md:text-lg font-semibold text-slate-600 transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary, #059669)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '')}
                disabled={isShattering}
              >
                View Live Demo
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer - Revealed by Scroll */}
      <footer className="relative z-10 bg-white border-t border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-6 h-full">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-col items-center md:items-start gap-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" style={{ color: 'var(--primary, #059669)' }} />
                <span className="font-display font-bold text-slate-900">HRMS</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                A Product of <span className="font-semibold" style={{ color: 'var(--primary, #059669)' }}>PydahSoft</span>
              </p>
            </div>
            
            <div className="flex gap-8 text-sm text-slate-500 font-medium">
              <a
                href="#"
                className="transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary, #059669)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '')}
              >
                Solutions
              </a>
              <a
                href="#"
                className="transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary, #059669)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '')}
              >
                Privacy
              </a>
              <a
                href="#"
                className="transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary, #059669)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '')}
              >
                Contact
              </a>
            </div>
            
            <div className="flex flex-col items-center md:items-end gap-1">
              <p className="text-sm text-slate-500 font-light">
                © {new Date().getFullYear()} HRMS. All rights reserved.
              </p>
              <p className="text-[10px] text-slate-300 uppercase tracking-widest">
                Developed by <span className="text-slate-400 font-medium">PydahSoft</span>
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}


