"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck, ArrowLeft, Lock, Mail, User } from "lucide-react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { setWorkspaceDataFromLogin } from "@/contexts/WorkspaceContext";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [ssoVerifying, setSsoVerifying] = useState(false);
  const ssoAttempted = useRef(false);

  // Check if already authenticated or if we need to clear session for SSO
  useEffect(() => {
    const ssoToken = searchParams.get("token");

    // If a new SSO token is present, we must clear the old session FIRST
    if (ssoToken && !ssoAttempted.current) {
      const currentToken = auth.getToken();
      // Only logout if there is actually something to clear
      if (currentToken) {
        console.log("SSO Token detected in URL. Clearing existing local sessions to prioritize new login.");
        auth.logout();
      }
      setChecking(false);
      return;
    }

    const token = auth.getToken();
    const user = auth.getUser();

    if (token && user) {
      // Already authenticated, redirect to dashboard
      const dashboardPath = auth.getRoleBasedPath(user.role);
      router.replace(dashboardPath);
    } else {
      setChecking(false);
    }
  }, [router, searchParams]);

  // SSO: when URL has ?token=..., verify with backend and log in
  useEffect(() => {
    if (checking || ssoAttempted.current) return;
    const ssoToken = searchParams.get("token");
    if (!ssoToken) return;

    ssoAttempted.current = true;
    setSsoVerifying(true);
    setError("");

    api
      .ssoLogin(ssoToken)
      .then((response) => {
        if (response.success && response.data) {
          auth.setToken(response.data.token);
          auth.setUser(response.data.user);
          if (response.data.user.role !== "super_admin") {
            setWorkspaceDataFromLogin({
              workspaces: response.data.workspaces || [],
              activeWorkspace: response.data.activeWorkspace || response.data.workspaces?.[0],
            });
          }
          const dashboardPath = auth.getRoleBasedPath(response.data.user.role);
          // Remove token from URL before redirect
          router.replace(dashboardPath);
        } else {
          setError(response.message || "SSO login failed.");
          setSsoVerifying(false);
          router.replace("/login", { scroll: false });
        }
      })
      .catch((err) => {
        setError("SSO verification failed. Please sign in with your credentials.");
        setSsoVerifying(false);
        router.replace("/login", { scroll: false });
      });
  }, [checking, searchParams, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.login(identifier, password);

      if (response.success && response.data) {
        // Store token and user data
        auth.setToken(response.data.token);
        auth.setUser(response.data.user);

        // Navigate based on role
        const dashboardPath = auth.getRoleBasedPath(response.data.user.role);
        router.push(dashboardPath);
      } else {
        setError(response.message || "Login failed. Please check your credentials.");
      }
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      console.error("Login error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking authentication
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
          <p className="text-slate-600 font-light">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show verifying state when logging in via SSO token
  if (ssoVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
          <p className="text-slate-600 font-light">Verifying SSO token...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Left Side: Branding (Hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-emerald-950 items-center justify-center overflow-hidden">
        <div className="relative z-10 p-12 max-w-xl text-white">
          <div className="mb-8 p-3 w-fit bg-white/10 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
          <h1 className="text-5xl font-display font-bold leading-tight mb-6">
            Elevating your <span className="text-emerald-400">Workforce</span> Experience.
          </h1>
          <p className="text-xl text-emerald-100/70 font-light leading-relaxed">
            Access your unified workspace to manage payroll, attendance, and employee relationships with enterprise-level security.
          </p>
          
          <div className="mt-12 flex gap-4">
            <div className="flex -space-x-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-10 h-10 rounded-full border-2 border-emerald-900 bg-emerald-800 flex items-center justify-center text-[10px] font-bold">
                  U{i}
                </div>
              ))}
            </div>
            <p className="text-sm text-emerald-200/50 flex items-center">
              Trusted by 500+ departments
            </p>
          </div>
        </div>

        {/* Decorative elements */}
        <div className="absolute bottom-10 right-10 opacity-10">
          <svg className="w-40 h-40 text-white" viewBox="0 0 200 200" fill="currentColor">
            <path d="M40 40h120v120H40z" opacity=".2"/>
            <path d="M60 60h80v80H60z" opacity=".4"/>
          </svg>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
        {/* Mobile-only background decorative elements */}
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl lg:hidden"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl lg:hidden"></div>

        <div className="w-full max-w-md relative z-10">
          {/* Back button */}
          <Link
            href="/"
            className="group inline-flex items-center text-slate-500 hover:text-emerald-600 mb-8 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Go Back
          </Link>

          {/* Small Screen Branding Header (Hidden on large screens) */}
          <div className="lg:hidden flex flex-col items-center mb-10 animate-fade-in-up">
            <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
              <ShieldCheck className="text-white w-7 h-7" />
            </div>
            <h1 className="text-xl font-display font-bold text-slate-900">
              <span className="text-emerald-600">HRMS</span>
            </h1>
          </div>

          <div className="animate-fade-in-up">
            <div className="mb-10 text-center lg:text-left">
              <h2 className="text-3xl font-display font-bold text-slate-900 mb-2">
                Welcome back
              </h2>
              <p className="text-slate-500">
                Please enter your credentials to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Identifier Field */}
              <div className="space-y-2">
                <label
                  htmlFor="identifier"
                  className="text-sm font-medium text-slate-700 ml-1"
                >
                  Email or Employee ID
                </label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans text-slate-900 placeholder:text-slate-400 shadow-sm"
                    placeholder="john.doe@company.com"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label
                    htmlFor="password"
                    className="text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-12 pr-12 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans text-slate-900 placeholder:text-slate-400 shadow-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none p-1"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-shake">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-600"></div>
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    "Sign In to Dashboard"
                  )}
                </div>
                {/* Shine effect on hover */}
                <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white/10 opacity-40 group-hover:animate-shine" />
              </button>
            </form>

            <div className="mt-12 text-center">
              <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                Enterprise HRMS Platform
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent"></div>
          <p className="text-slate-600 font-light">Loading...</p>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

