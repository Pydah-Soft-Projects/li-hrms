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
      setCurrentLine((prev) => (prev + 1) % lines.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [router, lines.length]);

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
    <div className="relative flex flex-col min-h-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* LiquidEther Background */}
      <div className="fixed inset-0 z-0 w-full h-full opacity-40 pointer-events-none">
        <LiquidEther
          colors={['#10b981', '#34d399', '#059669']}
          mouseForce={20}
          cursorSize={100}
          isViscous={false}
          viscous={30}
          iterationsViscous={32}
          iterationsPoisson={32}
          resolution={0.5}
          isBounce={false}
          autoDemo={true}
          autoSpeed={0.5}
          autoIntensity={3.5}
          takeoverDuration={0.25}
          autoResumeDelay={0}
          autoRampDuration={0.6}
          interactive={false}
        />
      </div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-nav h-20">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold tracking-tight text-slate-900">
              <span className="text-emerald-600">HRMS</span>
            </span>
          </div>
          
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#features" className="hover:text-emerald-600 transition-colors">Features</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Solutions</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Pricing</a>
          </nav>

          <Link
            href="/login"
            className="inline-flex items-center justify-center px-5 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-grow pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col items-center text-center max-w-4xl mx-auto animate-fade-in-up">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold mb-6">
              <Zap className="w-3 h-3 fill-emerald-500 text-emerald-500" />
              <span>Modern Workforce Management</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl font-display font-bold tracking-tight text-slate-900 leading-[1.1] mb-8">
              Revolutionize your <br />
              <div className="h-[1.2em] overflow-hidden">
                <span 
                  key={currentLine}
                  className="text-gradient inline-block animate-headline-switch"
                >
                  {lines[currentLine]}
                </span>
              </div>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-600 font-light mb-12 max-w-2xl leading-relaxed">
              Experience a seamless, professional HRMS platform designed to empower your employees and streamline your management processes.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="/login"
                className="group relative inline-flex items-center justify-center px-8 py-4 text-lg font-semibold text-white bg-slate-900 rounded-xl overflow-hidden transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:scale-95"
              >
                Get Started Now
                <ChevronRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <button className="px-8 py-4 text-lg font-semibold text-slate-600 hover:text-emerald-600 transition-colors">
                View Live Demo
              </button>
            </div>
          </div>

          {/* Features Grid */}
          <div id="features" className="mt-32 grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<Clock className="text-emerald-600" />}
              title="Attendance Tracking"
              description="Monitor employee presence and work hours effortlessly with digital check-ins and real-time logs."
              delay="0.1s"
            />
            <FeatureCard 
              icon={<CreditCard className="text-emerald-600" />}
              title="Payroll Management"
              description="Automate salary calculations, deductions, and pay slips with precision and security."
              delay="0.2s"
            />
            <FeatureCard 
              icon={<Users className="text-emerald-600" />}
              title="Employee Directory"
              description="Maintain a centralized, easy-to-manage database of all your company's talent."
              delay="0.3s"
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 bg-white border-t border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-emerald-600 w-5 h-5" />
            <span className="font-display font-bold text-slate-900">HRMS</span>
          </div>
          
          <div className="flex gap-8 text-sm text-slate-500">
            <a href="#" className="hover:text-emerald-600 transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Contact Us</a>
          </div>
          
          <p className="text-sm text-slate-400">
            © {new Date().getFullYear()} HRMS. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, delay }: { icon: React.ReactNode, title: string, description: string, delay: string }) {
  return (
    <div 
      className="glass-card p-8 rounded-2xl hover:border-emerald-200 transition-all duration-300 group hover:-translate-y-1 animate-fade-in-up"
      style={{ animationDelay: delay }}
    >
      <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-xl font-display font-bold text-slate-900 mb-4">{title}</h3>
      <p className="text-slate-600 leading-relaxed text-sm">
        {description}
      </p>
    </div>
  );
}

