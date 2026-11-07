"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  Bell,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Package,
  LogOut,
} from "lucide-react";
import { api } from "@/services/api";
import { InventoryItem, PurchasePlan } from "@/types";
import { useAuth } from "../../context/AuthContext";

interface NavbarProps {
  onToggleSidebar: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onToggleSidebar }) => {
  const pathname = usePathname();
  const { user, openAuthModal, logout } = useAuth();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [criticalItems, setCriticalItems] = useState<InventoryItem[]>([]);
  const [pendingPlans, setPendingPlans] = useState<PurchasePlan[]>([]);

  useEffect(() => {
    api.getInventory().then((items) => {
      setCriticalItems(items.filter((i) => i.status === "critical" || i.status === "out_of_stock"));
    });
    api.getPurchasePlans().then((plans) => {
      setPendingPlans(plans.filter((p) => p.status === "pending_approval"));
    });
  }, [pathname]);

  const getPageTitle = () => {
    if (pathname === "/") return "Inventory & Restock Dashboard";
    if (pathname.startsWith("/inventory")) return "Inventory Catalog & Stock Levels";
    if (pathname.startsWith("/suppliers")) return "Suppliers Directory & Price Comparison";
    if (pathname.startsWith("/planner")) return "Smart Purchase Planner";
    if (pathname.startsWith("/recommendations")) return "AI Purchase Recommendations & Simulation";
    if (pathname.startsWith("/payments")) return "PayPal Sandbox & Restock Settlements";
    return "StockWise Pay";
  };

  const totalAlerts = criticalItems.length + pendingPlans.length;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-xs border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between">
      {/* Left: Mobile trigger & Page Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
            {getPageTitle()}
          </h1>
          <p className="hidden sm:block text-xs text-slate-500">
            Real-time replenishment and automated working capital optimizer
          </p>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Sandbox Status Badge */}
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
          <span>PayPal Sandbox Mode</span>
        </div>

        {/* Quick Link to AI Recs */}
        <Link
          href="/recommendations"
          className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-400" />
          <span>AI Recs</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </Link>

        {/* Notifications Popover */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {totalAlerts > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                {totalAlerts}
              </span>
            )}
          </button>

          {isNotificationsOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsNotificationsOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-40 overflow-hidden animate-in fade-in zoom-in-95">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">
                    Restock Alerts & Tasks ({totalAlerts})
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">Live Engine</span>
                </div>

                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {criticalItems.length > 0 && (
                    <div className="p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Urgent Depletion Warning
                      </p>
                      <div className="space-y-2">
                        {criticalItems.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            className="p-2 rounded-lg bg-rose-50/60 border border-rose-100 flex items-start justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-slate-900">{item.name}</p>
                              <p className="text-slate-500 text-[11px]">
                                Current:{" "}
                                <strong className="text-rose-600">{item.currentStock} units</strong> |
                                Velocity: {item.salesVelocityPerWeek}/wk
                              </p>
                            </div>
                            <Link
                              href="/planner"
                              onClick={() => setIsNotificationsOpen(false)}
                              className="text-xs font-bold text-blue-600 hover:underline shrink-0 ml-2"
                            >
                              Restock
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pendingPlans.length > 0 && (
                    <div className="p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1 mb-2">
                        <Package className="w-3.5 h-3.5" />
                        Purchase Plan Needing Approval
                      </p>
                      {pendingPlans.map((plan) => (
                        <div
                          key={plan.id}
                          className="p-2 rounded-lg bg-amber-50/60 border border-amber-100 text-xs flex items-center justify-between"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{plan.title || 'Purchase Plan'}</p>
                            <p className="text-slate-500 text-[11px]">
                              Total: ${(plan.totalAmount ?? 0).toLocaleString()} ({plan.itemCount || (plan.items ? plan.items.length : 0)} items)
                            </p>
                          </div>
                          <Link
                            href="/recommendations"
                            onClick={() => setIsNotificationsOpen(false)}
                            className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded hover:bg-amber-200 shrink-0 ml-2"
                          >
                            Review
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}

                  {totalAlerts === 0 && (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                      All inventory levels are healthy!
                    </div>
                  )}
                </div>

                <div className="p-2 bg-slate-50 border-t border-slate-100 text-center">
                  <Link
                    href="/inventory"
                    onClick={() => setIsNotificationsOpen(false)}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    View All Inventory Items &rarr;
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

        {/* User Profile / Auth Trigger */}
        <div className="border-l border-slate-200 pl-2 sm:pl-3 ml-1 flex items-center gap-1 sm:gap-2">
          {user ? (
            <>
              <button
                type="button"
                onClick={openAuthModal}
                className="flex items-center gap-2 p-1 sm:px-2 sm:py-1 rounded-lg hover:bg-slate-100 transition-colors group text-left"
                title="Click to switch persona or view permissions"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                  {user.avatarInitials || "MV"}
                </div>
                <div className="hidden lg:block">
                  <p className="text-xs font-bold text-slate-800 leading-tight group-hover:text-blue-600 transition-colors">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-slate-500 leading-tight">{user.badge || "PRO"}</p>
                </div>
              </button>

              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                title="Sign out & return to Login Screen"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors inline-block"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
