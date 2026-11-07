"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Building2,
  ShoppingCart,
  Sparkles,
  CreditCard,
  DollarSign,
  Cpu,
  SlidersHorizontal,
  LogOut,
} from "lucide-react";
import { api } from "@/services/api";
import { BudgetConfig } from "@/types";
import { Modal } from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const pathname = usePathname();
  const { user, openAuthModal, logout } = useAuth();
  const [budget, setBudget] = useState<BudgetConfig>({
    monthlyBudget: 15000,
    spentThisMonth: 6420,
    allocatedPending: 3840,
  });
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [newBudgetVal, setNewBudgetVal] = useState("15000");

  useEffect(() => {
    api.getBudget().then(setBudget);
  }, []);

  const navItems = [
    {
      name: "Dashboard",
      href: "/",
      icon: LayoutDashboard,
      badge: null,
    },
    {
      name: "Inventory",
      href: "/inventory",
      icon: Package,
      badge: "Catalog",
    },
    {
      name: "Suppliers",
      href: "/suppliers",
      icon: Building2,
      badge: "Vendors",
    },
    {
      name: "Purchase Planner",
      href: "/planner",
      icon: ShoppingCart,
      badge: "Batches",
    },
    {
      name: "AI Recommendations",
      href: "/recommendations",
      icon: Sparkles,
      badge: "AI Active",
      highlight: true,
    },
    {
      name: "Payments",
      href: "/payments",
      icon: CreditCard,
      badge: "PayPal v2",
    },
  ];

  const spent = budget?.spentThisMonth ?? 0;
  const pending = budget?.allocatedPending ?? 0;
  const monthly = budget?.monthlyBudget || 15000;
  const availableBudget = monthly - (spent + pending);
  const budgetUtilization = Math.round(((spent + pending) / monthly) * 100);

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(newBudgetVal);
    if (!isNaN(parsed) && parsed > 0) {
      const updated = await api.updateBudget({ monthlyBudget: parsed });
      setBudget(updated);
      setIsBudgetModalOpen(false);
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col border-r border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40">
          <Link href="/" className="flex items-center gap-3 group" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white">StockWise</span>
                <span className="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 uppercase">
                  Pay
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium">Electronics Restock AI</p>
            </div>
          </Link>
        </div>

        {/* Store badge info */}
        <div className="px-5 py-3 mx-3 mt-3 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
          <div className="truncate">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Store Context</p>
            <p className="text-xs font-semibold text-slate-200 truncate">Apex Electronics #104</p>
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" title="Online & Connected" />
        </div>

        {/* Main Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Platform Navigation
          </div>

          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onClose}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
                    : "text-slate-300 hover:text-white hover:bg-slate-800/70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? "text-white" : "text-slate-400 group-hover:text-blue-400"
                    }`}
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      item.highlight
                        ? isActive
                          ? "bg-white/20 text-white"
                          : "bg-blue-500/20 text-blue-300 border border-blue-400/30 animate-pulse"
                        : isActive
                        ? "bg-white/15 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Budget Summary Card in Sidebar */}
        <div className="p-3 mx-3 mb-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
              <DollarSign className="w-3.5 h-3.5 text-blue-400" />
              <span>Restock Budget</span>
            </div>
            <button
              onClick={() => {
                setNewBudgetVal((budget?.monthlyBudget ?? 15000).toString());
                setIsBudgetModalOpen(true);
              }}
              className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
              title="Edit monthly budget"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Edit</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline text-xs">
              <span className="text-slate-400 text-[11px]">Available</span>
              <span
                className={`font-bold ${
                  availableBudget >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                ${(availableBudget ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </span>
            </div>

            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  budgetUtilization > 100
                    ? "bg-rose-500"
                    : budgetUtilization > 85
                    ? "bg-amber-400"
                    : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, budgetUtilization || 0))}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-400">
              <span>{budgetUtilization || 0}% utilized</span>
              <span>Total: ${(budget?.monthlyBudget ?? 15000).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* User / Manager Footnote with Auth Modal Trigger */}
        <div className="px-4 py-3 border-t border-slate-800/80 bg-slate-950/50">
          {user ? (
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={openAuthModal}
                className="flex-1 flex items-center gap-2.5 min-w-0 text-left hover:opacity-90 transition-opacity group"
                title="Switch persona or view permissions"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                  {user.avatarInitials || "MV"}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200 truncate group-hover:text-blue-400 transition-colors">
                    {user.name}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{user.badge || "PRO"}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={logout}
                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0"
                title="Sign out & return to Login Screen"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs"
            >
              Sign In to StockWise
            </Link>
          )}
        </div>
      </aside>

      {/* Edit Budget Modal */}
      <Modal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        title="Adjust Monthly Restock Budget"
        description="Set the monthly electronics restocking cap to prevent over-purchasing."
        maxWidth="md"
      >
        <form onSubmit={handleUpdateBudget} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Monthly Budget (USD $)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-slate-400 font-semibold text-sm">$</span>
              <input
                type="number"
                min="500"
                step="100"
                value={newBudgetVal}
                onChange={(e) => setNewBudgetVal(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
                required
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Current Spent: ${(budget?.spentThisMonth ?? 0).toLocaleString()} | In Pending Plans: $
              {(budget?.allocatedPending ?? 0).toLocaleString()}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsBudgetModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors"
            >
              Save Budget
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
};
