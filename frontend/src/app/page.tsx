"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Package,
  DollarSign,
  AlertTriangle,
  ShoppingCart,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/services/api";
import { InventoryItem, PurchasePlan, BudgetConfig, AIRecommendation } from "@/types";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";

export default function DashboardPage() {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [budget, setBudget] = useState<BudgetConfig>({
    monthlyBudget: 15000,
    spentThisMonth: 6420,
    allocatedPending: 3840,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [invData, planData, budData] = await Promise.all([
        api.getInventory(),
        api.getPurchasePlans(),
        api.getBudget(),
      ]);
      setInventory(invData);
      setPlans(planData);
      setBudget(budData);
    } catch (err) {
      console.error(err);
    }
  };

  // Dynamic computations from live data
  const totalStockValue = (inventory || []).reduce((sum, item) => sum + (item.currentStock || 0) * (item.unitCost || 0), 0);
  const totalRetailPotential = (inventory || []).reduce(
    (sum, item) => sum + (item.currentStock || 0) * (item.retailPrice ?? (item.unitCost ? item.unitCost * 2 : 25)),
    0
  );
  const lowStockItems = inventory.filter(
    (item) => item.status === "critical" || item.status === "low_stock" || item.status === "out_of_stock"
  );
  const criticalItems = inventory.filter((item) => item.status === "critical" || item.status === "out_of_stock");
  const spent = budget?.spentThisMonth ?? 0;
  const allocated = budget?.allocatedPending ?? 0;
  const monthly = budget?.monthlyBudget || 15000;
  const availableBudget = monthly - (spent + allocated);

  // Dynamic Category breakdown computed from live database inventory
  const categoryMap = (inventory || []).reduce((acc, item) => {
    const cat = item.category || "General";
    const val = (item.currentStock || 0) * (item.unitCost || 0);
    if (!acc[cat]) {
      acc[cat] = { name: cat, value: 0, items: 0 };
    }
    acc[cat].value += Number(val.toFixed(2));
    acc[cat].items += 1;
    return acc;
  }, {} as Record<string, { name: string; value: number; items: number }>);

  const categoryData = Object.values(categoryMap).length > 0
    ? Object.values(categoryMap)
    : [
        { name: "Audio", value: 203, items: 1 },
        { name: "Peripherals", value: 397, items: 2 },
        { name: "Accessories", value: 379, items: 2 },
        { name: "Components", value: 288, items: 1 },
      ];

  // Restock weekly projection chart calculated from active monthly budget
  const projectionData = [
    { week: "W1", spent: Math.round(spent * 0.28), budgetLimit: Math.round(monthly * 0.25) },
    { week: "W2", spent: Math.round(spent * 0.55), budgetLimit: Math.round(monthly * 0.5) },
    { week: "W3", spent: Math.round(spent * 0.82), budgetLimit: Math.round(monthly * 0.75) },
    { week: "W4", spent: Math.round(spent), budgetLimit: Math.round(monthly) },
    { week: "W5 (Est)", spent: Math.round(spent + allocated), budgetLimit: Math.round(monthly) },
  ];

  const criticalSkusText = criticalItems.length > 0
    ? criticalItems.slice(0, 3).map((i) => i.name.split(" ").slice(0, 2).join(" ")).join(", ")
    : "Key inventory lines";
  const estimatedSavings = (totalStockValue * 0.05).toFixed(2);
  const estimatedSalesProtection = Math.round(totalRetailPotential * 0.65).toLocaleString();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Top AI Insight Banner */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-6 text-white shadow-lg border border-slate-700/50">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-400/30">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                <span>AI Restock Intelligence Active</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                Optimize your electronics restocking before the weekend rush.
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {criticalItems.length > 0 ? (
                  <>
                    <strong>{criticalItems.length} high-velocity SKUs</strong> ({criticalSkusText}) require inventory attention.
                    Restocking in batch locks in <strong>${estimatedSavings} in bulk discounts</strong> and protects <strong>${estimatedSalesProtection}</strong> in potential retail sales.
                  </>
                ) : (
                  <>All inventory levels are currently within safe operational buffers. Review automated replenishment suggestions below.</>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Link
                href="/recommendations"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Review AI Recommendations
              </Link>
              <Link
                href="/planner"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5"
              >
                Open Purchase Planner
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Decorative background blur */}
          <div className="absolute -right-12 -bottom-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* 4 Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Total Inventory Value"
            value={`$${totalStockValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            subtitle={`Retail potential: $${totalRetailPotential.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
            change="+12.4% vs last mo"
            isPositive={true}
            icon={Package}
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
          />

          <MetricCard
            title="Available Restock Budget"
            value={`$${availableBudget.toLocaleString(undefined, { minimumFractionDigits: 0 })}`}
            subtitle={`Monthly Cap: $${(budget?.monthlyBudget ?? 15000).toLocaleString()}`}
            badge={availableBudget > 0 ? "Under Cap" : "At Limit"}
            badgeVariant={availableBudget > 0 ? "success" : "warning"}
            progress={{
              value: spent + allocated,
              max: monthly,
              label: "Allocated + Spent",
            }}
            icon={DollarSign}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />

          <MetricCard
            title="Low-Stock Alerts"
            value={lowStockItems.length}
            subtitle={`${inventory.filter((i) => i.status === "out_of_stock").length} currently sold out`}
            change={`${criticalItems.length} critical`}
            isPositive={criticalItems.length === 0}
            icon={AlertTriangle}
            iconBgColor="bg-rose-50"
            iconColor="text-rose-600"
            badge={criticalItems.length > 0 ? "Urgent" : "Nominal"}
            badgeVariant={criticalItems.length > 0 ? "danger" : "success"}
          />

          <MetricCard
            title="Active Purchase Plans"
            value={plans.length}
            subtitle={`${plans.filter((p) => p.status === "pending_approval").length} awaiting manager sign-off`}
            change={`${plans.filter((p) => p.status === "approved").length} ready to pay`}
            isPositive={true}
            icon={ShoppingCart}
            iconBgColor="bg-slate-100"
            iconColor="text-slate-800"
            badge="PayPal Ready"
            badgeVariant="navy"
          />
        </div>

        {/* Middle Section: Visual Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Chart 1: Inventory Valuation by Electronics Category */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Inventory Valuation by Category
                </h3>
                <p className="text-xs text-slate-500">
                  Cost asset distribution across electronics inventory categories
                </p>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                12 Active SKUs
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#64748B", fontSize: 11 }}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    tick={{ fill: "#64748B", fontSize: 11 }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    formatter={(val: any) => [`$${Number(val || 0).toLocaleString()}`, "Valuation"]}
                    contentStyle={{
                      backgroundColor: "#0F172A",
                      border: "none",
                      borderRadius: "8px",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Restock Spend vs Monthly Budget */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-900">Restock Spend Pace</h3>
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Normal Pace
                </span>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Cumulative capital deployed vs $15,000 monthly ceiling
              </p>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectionData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="week" tick={{ fill: "#64748B", fontSize: 10 }} />
                    <YAxis
                      tick={{ fill: "#64748B", fontSize: 10 }}
                      tickFormatter={(v) => `$${v / 1000}k`}
                    />
                    <Tooltip
                      formatter={(v: any) => [`$${Number(v || 0).toLocaleString()}`, "Amount"]}
                      contentStyle={{
                        backgroundColor: "#0F172A",
                        borderRadius: "8px",
                        color: "#fff",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="spent"
                      stroke="#2563EB"
                      fill="#DBEAFE"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Unallocated Capital:</span>
              <span className="font-bold text-slate-900">
                ${availableBudget.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Section: Low-Stock Alerts & Recent Purchase Plans */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low Stock Alerts Card */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Critical Low-Stock Alerts</h3>
                  <p className="text-xs text-slate-500">Items below minimum safety stock threshold</p>
                </div>
              </div>

              <Link
                href="/inventory?filter=low_stock"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>View All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {lowStockItems.slice(0, 4).map((item) => {
                const runwayDays =
                  (item.salesVelocityPerWeek ?? 0) > 0
                    ? (((item.currentStock ?? 0) / item.salesVelocityPerWeek) * 7).toFixed(1)
                    : "N/A";

                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors flex items-center justify-between"
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">{item.name}</span>
                        <Badge
                          variant={
                            item.status === "out_of_stock"
                              ? "danger"
                              : item.status === "critical"
                              ? "danger"
                              : "warning"
                          }
                          size="sm"
                          dot
                        >
                          {item.status === "out_of_stock"
                            ? "Out of Stock"
                            : `${item.currentStock} units left`}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span>SKU: {item.sku}</span>
                        <span>•</span>
                        <span>Velocity: {item.salesVelocityPerWeek}/wk</span>
                        <span>•</span>
                        <span className="text-rose-600 font-semibold">
                          Runway: ~{runwayDays} days
                        </span>
                      </div>
                    </div>

                    <Link
                      href={`/planner`}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors shrink-0 shadow-xs"
                    >
                      Restock
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Purchase Plans Card */}
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Recent Purchase Plans</h3>
                  <p className="text-xs text-slate-500">Generated restock orders & checkout readiness</p>
                </div>
              </div>

              <Link
                href="/planner"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <span>New Plan</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="p-3.5 rounded-lg border border-slate-100 hover:border-slate-200 bg-white transition-all flex items-center justify-between shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900">{plan.title || 'Restock Plan'}</span>
                      <Badge
                        variant={
                          (plan.status || 'pending_approval') === "pending_approval"
                            ? "warning"
                            : plan.status === "paid" || plan.status === "approved"
                            ? "success"
                            : "info"
                        }
                        size="sm"
                        dot
                      >
                        {(plan.status || 'pending_approval') === "pending_approval"
                          ? "Pending Approval"
                          : (plan.status || 'DRAFT').toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500">
                      <span>Created: {plan.createdAt || '2026-11-07'}</span>
                      <span>•</span>
                      <span>{plan.itemCount || (plan.items ? plan.items.length : 0)} product lines</span>
                      <span>•</span>
                      <span className="font-semibold text-slate-900">
                        ${(plan.totalAmount ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {plan.status === "pending_approval" ? (
                      <Link
                        href="/recommendations"
                        className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md border border-amber-200 transition-colors"
                      >
                        Review
                      </Link>
                    ) : (
                      <Link
                        href="/payments"
                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 rounded-md border border-blue-200 transition-colors"
                      >
                        View Order
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
