'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import LiquidEther from '@/components/LiquidEther';
import '@/components/LiquidEther.css';
import { ChevronRight, ShieldCheck, Zap, Users, BarChart3, Clock, CreditCard } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [currentLine, setCurrentLine] = useState(0);
  const [prevLine, setPrevLine] = useState(-1);

  const lines = [
    "Workforce Potential",
    "Employee Experience",
    "Talent Strategy",
    "Payroll Dynamics",
    "People Management",
    "Organizational Brilliance"
  ];

  useEffect(() => {
    // Check if user is already authenticated
    const token = auth.getToken();
    const user = auth.getUser();

    if (token && user) {
      // User is authenticated, redirect to their dashboard
      const dashboardPath = auth.getRoleBasedPath(user.role);
      router.replace(dashboardPath);
    } else {
      // No token, show welcome page
      setChecking(false);
    }

    // Headline rotation interval
    const timer = setInterval(() => {
      setPrevLine(currentLine);
      setCurrentLine((prev) => (prev + 1) % lines.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [router, lines.length, currentLine]);

  // Show loading while checking authentication
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
          <p className="text-slate-600 font-light">Loading experience...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col min-h-screen overflow-x-hidden bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/20 backdrop-blur-xl border-b border-white/20 h-20 shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg border border-white/20">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold tracking-tight text-slate-900">
              <span className="text-emerald-600">HRMS</span>
            </span>
          </div>
          
          <Link
            href="/login"
            className="group relative inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg active:scale-95 border border-white/10 overflow-hidden"
          >
            <div className="shimmer-btn-overlay" />
            <span className="relative z-10">Sign In</span>
          </Link>
        </div>
      </header>

      {/* Hero Section - 100vh Independent */}
      <main 
        className="relative z-10 h-[100dvh] flex items-center justify-center px-6 overflow-hidden"
        style={{
          backgroundImage: 'url("/images/hero_bg.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }}
      >
        {/* Transparent Overlay to ensure contrast */}
        <div className="absolute inset-0 z-0 hero-bg-overlay opacity-80" />

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
              <Link
                href="/login"
                className="group relative inline-flex items-center justify-center px-7 md:px-8 py-3.5 md:py-4 text-base md:text-lg font-semibold text-white bg-slate-900 rounded-xl overflow-hidden transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:scale-95 animate-aura-glow"
              >
                <div className="shimmer-btn-overlay delay-2s" />
                <span className="relative z-10 flex items-center">
                  Get Started Now
                  <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
              <button className="px-8 py-4 text-base md:text-lg font-semibold text-slate-600 hover:text-emerald-600 transition-colors">
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
                <ShieldCheck className="text-emerald-600 w-5 h-5" />
                <span className="font-display font-bold text-slate-900">HRMS</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                A Product of <span className="text-emerald-600 font-semibold">PydahSoft</span>
              </p>
            </div>
            
            <div className="flex gap-8 text-sm text-slate-500 font-medium">
              <a href="#" className="hover:text-emerald-600 transition-colors">Solutions</a>
              <a href="#" className="hover:text-emerald-600 transition-colors">Privacy</a>
              <a href="#" className="hover:text-emerald-600 transition-colors">Contact</a>
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


