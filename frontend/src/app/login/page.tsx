"use client";

import React, { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  Cpu,
  KeyRound,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Lock,
  Building2,
  DollarSign,
  UserCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth, PRESET_USERS } from "@/context/AuthContext";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/";

  const { login, switchAccount, user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleDemoLogin = async (demoUser: typeof PRESET_USERS[0]) => {
    setSelectedDemoId(demoUser.id);
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await login(demoUser.email, "demo-secure-pass");
      window.location.href = redirectUrl;
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to log in with demo account");
      setIsLoading(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg("Please enter your work email address");
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await login(email, password);
      window.location.href = redirectUrl;
    } catch (err: any) {
      setErrorMsg(err.message || "Authentication failed");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="px-6 py-4 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1">
              StockWise <span className="text-blue-400">Pay</span>
            </span>
            <p className="text-[10px] text-slate-400 font-medium">Enterprise Restock & Procurement</p>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          {user ? (
            <>
              <span className="text-xs text-slate-400 hidden sm:inline">Signed in as {user.name}</span>
              <Link
                href="/"
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-xs"
              >
                Go to Dashboard &rarr;
              </Link>
            </>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] text-slate-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Demo Personas Ready</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-12 flex flex-col lg:flex-row items-center justify-center gap-12">
        {/* Left Column: Product Value & Credentials Overview */}
        <div className="w-full lg:w-1/2 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Autonomous Retail Supply Chain Platform</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Predict inventory runout. <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-emerald-400">
              Settle orders with PayPal.
            </span>
          </h1>

          <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
            StockWise Pay links real-time sales telemetry, supplier lead-time optimization, and automated manager-authorized PayPal Sandbox disbursements into a single audit-ready ledger.
          </p>

          {/* 3 Value Pillars */}
          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 mt-0.5">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">AI Demand Forecasting</p>
                <p className="text-[11px] text-slate-400">
                  Continuous runout prediction prevents weekend stockouts with automated batch reorder sizes.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Strict Version-Locked Approvals</p>
                <p className="text-[11px] text-slate-400">
                  Plans modified after sign-off automatically invalidate previous approvals to protect treasury funds.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800/80">
              <div className="w-8 h-8 rounded-lg bg-amber-600/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">PayPal Orders v2 Settlement</p>
                <p className="text-[11px] text-slate-400">
                  Instant two-phase sandbox authorization and capture with automated invoice reconciliation.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sign In & Demo Accounts */}
        <div className="w-full lg:w-1/2 max-w-md">
          <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Sign In to StockWise</h2>
              <p className="text-xs text-slate-400 mt-1">
                Select a verified demo account below for instant evaluation, or use your corporate credentials.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* DEMO ACCOUNTS QUICK-LOGIN */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                <span>Select Demo Persona</span>
                <span className="text-blue-400 font-normal">1-Click Fast Pass</span>
              </div>

              <div className="space-y-2">
                {PRESET_USERS.map((demo) => {
                  const isSelected = selectedDemoId === demo.id || user?.id === demo.id;
                  return (
                    <button
                      key={demo.id}
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleDemoLogin(demo)}
                      className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between group ${
                        isSelected
                          ? "border-blue-500 bg-blue-950/60 ring-1 ring-blue-500/50 shadow-md shadow-blue-900/20"
                          : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                          {demo.avatarInitials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">{demo.name}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                              {demo.badge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">{demo.role}</p>
                        </div>
                      </div>

                      <div className="shrink-0 pl-2">
                        {isSelected && !isLoading ? (
                          <div className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-xs">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-lg bg-slate-800 group-hover:bg-blue-600 text-slate-400 group-hover:text-white flex items-center justify-center transition-colors">
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="bg-slate-900 px-3 text-[11px] text-slate-500 uppercase font-semibold tracking-wider">
                Or Sign In with Email
              </span>
            </div>

            {/* Custom Credentials Form */}
            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Work Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marcus.vance@stockwisepay.com"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Password
                  </label>
                  <span className="text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer">
                    Forgot password?
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 animate-spin" /> Verifying Credentials...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4" /> Sign In to Workspace
                  </span>
                )}
              </button>
            </form>

            {/* Footer Trust Notes */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                PostgreSQL RBAC Active
              </span>
              <span>PayPal Orders v2 Ready</span>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer */}
      <footer className="px-6 py-4 border-t border-slate-900 text-center text-xs text-slate-600">
        &copy; 2026 StockWise Pay Inc. All rights reserved. Built for autonomous retail procurement and verified PayPal settlement.
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}

