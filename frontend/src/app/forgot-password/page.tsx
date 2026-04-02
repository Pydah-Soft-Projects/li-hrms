"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, AlertCircle, Phone, User as UserIcon, Building2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

type Step = "IDENTIFY" | "VERIFY" | "SUCCESS";

interface UserInfo {
  name: string;
  department: string;
  email?: string;
  phone?: string;
  hasEmail: boolean;
  hasPhone: boolean;
}

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>("IDENTIFY");
  const [identifier, setIdentifier] = useState("");
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleIdentify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await api.verifyIdentifier(identifier);
      if (response.success && response.data) {
        setUserInfo(response.data);
        setStep("VERIFY");
      } else {
        setError(response.message || "Account not found. Please check your credentials.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await api.forgotPassword(identifier);
      if (response.success) {
        setSuccessMessage(response.message || "Password reset instructions have been sent successfully.");
        setStep("SUCCESS");
      } else {
        setError(response.message || "Failed to reset password.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case "IDENTIFY":
        return (
          <form onSubmit={handleIdentify} className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1.5">
                Email, Username or Employee No
              </label>
              <div className="relative">
                <input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all pr-12"
                  placeholder="Enter your registered identifier"
                  disabled={loading}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                  <UserIcon className="w-5 h-5" />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !identifier}
              className="w-full py-3.5 px-4 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : "Continue"}
            </button>
          </form>
        );

      case "VERIFY":
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center text-green-600">
                  <UserIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{userInfo?.name}</h3>
                  <div className="flex items-center text-sm text-gray-500 gap-1.5">
                    <Building2 className="w-3.5 h-3.5" />
                    {userInfo?.department}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sending reset credentials to:</p>
                {userInfo?.hasEmail && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Mail className="w-4 h-4 text-green-500" />
                    <span>{userInfo?.email}</span>
                  </div>
                )}
                {userInfo?.hasPhone && (
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <Phone className="w-4 h-4 text-green-500" />
                    <span>{userInfo?.phone}</span>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleReset}
                disabled={loading}
                className="w-full py-3.5 px-4 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : "Reset and Send Credentials"}
              </button>
              
              <button
                onClick={() => setStep("IDENTIFY")}
                disabled={loading}
                className="w-full py-3.5 px-4 bg-white text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Not me? Try again
              </button>
            </div>
          </div>
        );

      case "SUCCESS":
        return (
          <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-green-50 border border-green-100 text-green-700 px-6 py-8 rounded-2xl text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg mb-2">Reset Successful!</h3>
              <p className="text-sm text-green-600 leading-relaxed">
                {successMessage}
              </p>
            </div>
            
            <Link
              href="/login"
              className="block w-full py-3.5 px-4 bg-gray-900 text-white text-center font-semibold rounded-xl hover:bg-black transition-all shadow-lg"
            >
              Return to Login
            </Link>
          </div>
        );
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-6 py-12">
      <div className="relative z-10 w-full max-w-md">
        <Link
          href="/login"
          className="inline-flex items-center text-green-600 hover:text-green-700 mb-8 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Login
        </Link>

        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg text-white">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Forgot Password?
            </h1>
            <p className="text-gray-500 text-sm">
              {step === "IDENTIFY" ? "Enter your details to find your account." : 
               step === "VERIFY" ? "Please verify this is your account." : ""}
            </p>
          </div>

          {renderStep()}

          <div className="mt-8 pt-6 border-t border-gray-50 text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
              HRMS Security Protocol • Pydah College
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
