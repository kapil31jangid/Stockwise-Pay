"use client";

import React, { useState } from "react";
import { Modal } from "../ui/Modal";
import { useAuth, PRESET_USERS } from "../../context/AuthContext";
import { ShieldCheck, UserCheck, KeyRound, LogOut, Check, ArrowRight } from "lucide-react";

export const AuthModal: React.FC = () => {
  const { user, isAuthModalOpen, closeAuthModal, switchAccount, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"preset" | "custom">("preset");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setIsSubmitting(true);
    try {
      await login(emailInput, passwordInput);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title="StockWise Access & Authentication"
      description="Manage role-based access for procurement approvals, budget adjustments, and PayPal checkout."
      maxWidth="md"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("preset")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "preset"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Switch Team Persona
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("custom")}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === "custom"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Custom Sign In
          </button>
        </div>

        {activeTab === "preset" ? (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500 font-medium">
              Select an authorized retail role to simulate approval permissions:
            </p>
            {PRESET_USERS.map((u) => {
              const isCurrent = user?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => switchAccount(u.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${
                    isCurrent
                      ? "border-blue-600 bg-blue-50/60 ring-1 ring-blue-600"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shrink-0">
                      {u.avatarInitials}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{u.name}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                          {u.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{u.role} • {u.department}</p>
                    </div>
                  </div>
                  {isCurrent ? (
                    <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  ) : (
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={handleCustomLogin} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Work Email Address
              </label>
              <input
                type="email"
                placeholder="you@stockwisepay.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password / Passkey
              </label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {isSubmitting ? "Authenticating..." : "Sign In with Credentials"}
            </button>
          </form>
        )}

        {/* Current Session Banner & Logout */}
        {user && (
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-[11px] text-slate-600">
                Active Session: <strong className="text-slate-900">{user.name}</strong> ({user.role})
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50"
            >
              <LogOut className="w-3 h-3" />
              Log Out
            </button>
          </div>
        )}

        <div className="pt-2 text-center border-t border-slate-100">
          <a
            href="/login"
            onClick={closeAuthModal}
            className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-1"
          >
            <span>Open Dedicated Login Screen with Demo Personas &rarr;</span>
          </a>
        </div>
      </div>
    </Modal>
  );
};

