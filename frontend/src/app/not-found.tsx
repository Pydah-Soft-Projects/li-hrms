"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import NotFoundNatureScene from "@/components/NotFoundNatureScene";

export default function NotFound() {
  const router = useRouter();

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#96e6a1] text-slate-900">
      {/* Crisp inline SVG — no img scaling, no backdrop blur */}
      <div className="absolute inset-0">
        <NotFoundNatureScene />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-end px-4 pb-12 pt-10 sm:px-6 sm:pb-16 sm:pt-14 lg:px-8">
        <div className="w-full">
          <div className="mx-auto max-w-xl p-5 sm:p-7">
            <div className="flex flex-col items-center text-center">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#1b5e20] drop-shadow-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-600 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]" />
                Page not found
                <span className="nf-dots" aria-hidden>
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>

              <div className="mt-4 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => router.back()}
                  aria-label="Go back"
                  title="Go back"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-[#1b5e20] shadow-md shadow-emerald-900/10 transition-all hover:bg-white active:scale-[0.98]"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <Link
                  href="/dashboard"
                  aria-label="Go to dashboard"
                  title="Dashboard"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2e7d32] text-white shadow-md shadow-emerald-900/20 transition-all hover:bg-[#1b5e20] active:scale-[0.98]"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 12l9-9 9 9M4 10v10a1 1 0 001 1h5m4 0h5a1 1 0 001-1V10"
                    />
                  </svg>
                </Link>

                <Link
                  href="/login"
                  aria-label="Go to login"
                  title="Login"
                  className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/90 text-[#1b5e20] shadow-md shadow-emerald-900/10 transition-all hover:bg-white active:scale-[0.98]"
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3"
                    />
                  </svg>
                </Link>
              </div>

              <p className="mt-6 text-[10px] font-semibold uppercase tracking-widest text-[#1b5e20]/70">
                LI-HRMS
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
