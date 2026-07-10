"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, ShieldCheck, ArrowLeft, Lock, User } from "lucide-react";
import { api } from "@/lib/api";
import { auth } from "@/lib/auth";
import { setWorkspaceDataFromLogin } from "@/contexts/WorkspaceContext";

function SilkBackground() {
  return (
    <>
      <div className="silk-page-bg hero-silk-bg" aria-hidden="true" />
      <div className="silk-page-bg hero-bg-overlay" aria-hidden="true" />
      <div className="silk-page-bg hero-silk-sheen pointer-events-none" aria-hidden="true" />
    </>
  );
}

function LoginLoading({ message }: { message: string }) {
  return (
    <div className="relative min-h-screen bg-[#f0fdf4]">
      <SilkBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="login-glass-card rounded-2xl px-10 py-12 flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
          <p className="text-slate-600 font-light">{message}</p>
        </div>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    const ssoToken = searchParams.get("token");

    if (ssoToken && !ssoAttempted.current) {
      const currentToken = auth.getToken();
      if (currentToken) {
        void auth.logout();
      }
      setChecking(false);
      return;
    }

    const token = auth.getToken();
    const user = auth.getUser();

    if (token && user) {
      const dashboardPath = auth.getRoleBasedPath(user.role);
      router.replace(dashboardPath);
    } else {
      setChecking(false);
    }
  }, [router, searchParams]);

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
          auth.setAuthSession(
            response.data.accessToken || response.data.token,
            response.data.refreshToken
          );
          auth.setUser(response.data.user);
          if (response.data.user.role !== "super_admin") {
            setWorkspaceDataFromLogin({
              workspaces: response.data.workspaces || [],
              activeWorkspace: response.data.activeWorkspace || response.data.workspaces?.[0],
            });
          }
          const dashboardPath = auth.getRoleBasedPath(response.data.user.role);
          router.replace(dashboardPath);
        } else {
          setError(response.message || "SSO login failed.");
          setSsoVerifying(false);
          router.replace("/login", { scroll: false });
        }
      })
      .catch(() => {
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
        auth.setAuthSession(
          response.data.accessToken || response.data.token,
          response.data.refreshToken
        );
        auth.setUser(response.data.user);

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

  if (checking) {
    return <LoginLoading message="Authenticating..." />;
  }

  if (ssoVerifying) {
    return <LoginLoading message="Verifying SSO token..." />;
  }

  return (
    <div className="relative min-h-screen bg-[#f0fdf4] text-slate-900 overflow-x-hidden">
      <SilkBackground />

      <header className="fixed top-0 left-0 right-0 z-50 bg-white/20 backdrop-blur-xl border-b border-white/20 h-20 shadow-sm">
        <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between w-full">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg border border-white/20">
              <ShieldCheck className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-display font-bold tracking-tight text-slate-900">
              <span className="text-emerald-600">HRMS</span>
            </span>
          </Link>

          <Link
            href="/"
            className="group inline-flex items-center text-sm font-medium text-slate-600 hover:text-emerald-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Home
          </Link>
        </div>
      </header>

      <main className="relative z-10 min-h-screen pt-28 pb-12 px-6 flex items-center justify-center">
        <div className="w-full max-w-5xl grid lg:grid-cols-[1fr_420px] gap-10 lg:gap-16 items-center">
          <div className="hidden lg:block animate-fade-in-up">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700/80 mb-4">
              Secure Access
            </p>
            <h1 className="text-4xl xl:text-5xl font-display font-bold leading-tight text-slate-900 mb-6">
              Welcome back to your{" "}
              <span className="text-gradient">workforce hub</span>
            </h1>
            <p className="text-lg text-slate-600 font-light leading-relaxed max-w-md">
              Sign in to manage payroll, attendance, leaves, and employee records — all in one elegant workspace.
            </p>

            <div className="mt-10 flex items-center gap-4">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-9 h-9 rounded-full border-2 border-white/80 bg-emerald-600/90 flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                  >
                    U{i}
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-500">Trusted by 500+ departments</p>
            </div>
          </div>

          <div className="w-full max-w-md mx-auto lg:max-w-none animate-fade-in-up">
            <div className="login-glass-card rounded-2xl p-8 sm:p-10">
              <div className="lg:hidden flex flex-col items-center mb-8">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg border border-white/20 mb-3">
                  <ShieldCheck className="text-white w-7 h-7" />
                </div>
                <span className="text-lg font-display font-bold text-slate-900">
                  <span className="text-emerald-600">HRMS</span> Sign In
                </span>
              </div>

              <div className="mb-8 text-center lg:text-left">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2">
                  Sign in
                </h2>
                <p className="text-slate-500 text-sm sm:text-base">
                  Enter your credentials to access your dashboard
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="identifier" className="text-sm font-medium text-slate-700 ml-1">
                    Username / Employee No / Email
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
                      className="login-input w-full pl-12 pr-4 py-3.5 rounded-xl focus:outline-none transition-all font-sans text-slate-900 placeholder:text-slate-400"
                      placeholder="username, EMP001, or email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center px-1">
                    <label htmlFor="password" className="text-sm font-medium text-slate-700">
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
                      className="login-input w-full pl-12 pr-12 py-3.5 rounded-xl focus:outline-none transition-all font-sans text-slate-900 placeholder:text-slate-400"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors focus:outline-none p-1"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50/90 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-center gap-3 animate-shake backdrop-blur-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full py-3.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-xl hover:shadow-emerald-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                >
                  {!loading && <div className="shimmer-btn-overlay" />}
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
                </button>
              </form>

              <p className="mt-8 text-center text-[11px] text-slate-400 uppercase tracking-widest font-semibold">
                Enterprise HRMS Platform
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoading message="Loading..." />}>
      <LoginContent />
    </Suspense>
  );
}
