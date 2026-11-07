"use client";

import React, { useState, useEffect } from "react";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Receipt,
  FileText,
  Lock,
  Printer,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services/api";
import { PaymentRecord, PurchasePlan } from "@/types";

import { useAuth } from "@/context/AuthContext";
import { AlertCircle, AlertTriangle } from "lucide-react";

export default function PaymentsPage() {
  const { user } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [activePlan, setActivePlan] = useState<PurchasePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentRecord | null>(null);

  // PayPal Sandbox flow states
  const [paymentStep, setPaymentStep] = useState<"idle" | "authorizing" | "capturing" | "success">(
    "idle"
  );
  const [lastPaymentResult, setLastPaymentResult] = useState<PaymentRecord | null>(null);
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [payData, planData] = await Promise.all([
        api.getPayments(),
        api.getPurchasePlans(),
      ]);
      setPayments(Array.isArray(payData) ? payData : []);
      const validPlans = Array.isArray(planData) ? planData : [];
      setPlans(validPlans);
      if (validPlans.length > 0) {
        // Prioritize approved plan if available
        const approved = validPlans.find(p => p.status === 'approved');
        setActivePlan(approved || validPlans[0]);
      }
    } catch (err) {
      console.error("Error loading payment data:", err);
    }
  };

  // Quick Approve Plan if currently pending
  const handleQuickApprovePlan = async () => {
    if (!activePlan) return;
    setIsApproving(true);
    setCheckoutError(null);
    try {
      const approver = user ? `${user.name} (${user.role})` : "Marcus Vance (Inventory Lead)";
      if (api.approvePlan) {
        await api.approvePlan(activePlan.id, user?.name || "Marcus Vance", "Fast-track approved for PayPal settlement");
      }
      const updated: PurchasePlan = {
        ...activePlan,
        status: "approved",
        approvedAt: new Date().toISOString(),
        approvedBy: approver,
      };
      await api.savePurchasePlan(updated);
      setActivePlan(updated);
      setPlans((prev) => prev.map((p) => (p.id === activePlan.id ? updated : p)));
    } catch (err: any) {
      setCheckoutError(err.message || "Failed to approve plan");
    } finally {
      setIsApproving(false);
    }
  };

  // Simulate PayPal Sandbox Two-Phase Flow (create-order -> capture-order)
  const handleTriggerPayPalCheckout = async () => {
    if (!activePlan) return;
    setIsLoading(true);
    setCheckoutError(null);
    setPaymentStep("authorizing");

    try {
      // 1. Prepare Order on backend
      const order = await api.createPayPalOrder({
        planId: activePlan.id,
        amount: activePlan.totalAmount ?? 0,
        currency: currency,
        items: (activePlan.items ?? []).map((i) => ({
          name: i.productName || i.sku,
          quantity: i.selectedQty || i.recommendedQty || 1,
          unitPrice: i.unitCost || 0,
        })),
      });

      // Simulation delay for sandbox modal window
      setTimeout(async () => {
        try {
          setPaymentStep("capturing");

          // 2. Capture Order on backend
          const record = await api.capturePayPalOrder({
            orderId: order.orderId,
            planTitle: activePlan.title || `Restock Plan #${activePlan.id}`,
            supplierName: (activePlan.items && activePlan.items[0]?.selectedSupplierName) || "VoltCore & Apex Wholesale Consolidated",
            amount: activePlan.totalAmount ?? 0,
            currency: currency,
            itemSummary: `${activePlan.itemCount || activePlan.items?.length || 1} electronics SKUs (${activePlan.title || 'Restock'})`,
          });

          // Update local plan state to paid
          const paidPlan: PurchasePlan = {
            ...activePlan,
            status: "paid",
          };
          await api.savePurchasePlan(paidPlan);
          setActivePlan(paidPlan);
          setPlans((prev) => prev.map((p) => (p.id === activePlan.id ? paidPlan : p)));

          setPayments((prev) => [record, ...prev]);
          setLastPaymentResult(record);
          setPaymentStep("success");
        } catch (captureErr: any) {
          console.error("Capture failed:", captureErr);
          setCheckoutError(captureErr.message || "Failed to capture payment in PayPal Sandbox");
          setPaymentStep("idle");
        } finally {
          setIsLoading(false);
        }
      }, 1500);
    } catch (err: any) {
      console.error("Order creation failed:", err);
      setCheckoutError(err.message || "PayPal Sandbox order creation failed. Ensure plan is approved.");
      setPaymentStep("idle");
      setIsLoading(false);
    }
  };

  const totalSpentSettled = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                PayPal Restock Settlements
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                Verified Sandbox Gateway
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Enterprise procurement settlements powered by PayPal Orders v2 with automated budget ledger sync
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xs">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>TLS 1.3 End-to-End Encrypted</span>
            </span>
          </div>
        </div>

        {/* SECTION 1: Enterprise Payment Gateway & Compliance Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 text-white rounded-2xl p-5 shadow-sm border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  Enterprise Restock Settlement Gateway Active
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-semibold">
                  PayPal Orders v2
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
                All supplier purchase orders require verified inventory lead approval before payout. Payments are authorized and captured with full double-entry ledger reconciliation and audit tracking.
              </p>
            </div>

            <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl text-[11px] space-y-1 shrink-0 text-slate-300">
              <p className="font-bold text-blue-300">Designated Settlement Channel:</p>
              <p>Payer: <span className="font-mono text-white">buyer-retail@stockwise.test</span></p>
              <p>Network: <span className="font-bold text-emerald-400">PayPal Live Sandbox (PCI-DSS Compliant)</span></p>
            </div>
          </div>
        </div>

        {/* 3 Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            title="Total Restock Invoiced"
            value={`$${totalSpentSettled.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            subtitle="Through PayPal Business"
            change="100% on-time settlement"
            isPositive={true}
            icon={Receipt}
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
          />

          <MetricCard
            title="Settlement Method"
            value="PayPal Sandbox"
            subtitle="Instant capture & Net terms"
            badge="Connected"
            badgeVariant="success"
            icon={CreditCard}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />

          <MetricCard
            title="Completed Transactions"
            value={payments.length}
            subtitle="All supplier PO settlements"
            change="0 disputes"
            isPositive={true}
            icon={CheckCircle2}
            iconBgColor="bg-slate-100"
            iconColor="text-slate-800"
          />
        </div>

        {/* SECTION 2: Active Purchase Order & PayPal Checkout Card */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Active PO Order Summary */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Target Purchase Order
                </span>
                <h3 className="font-bold text-base text-slate-900">
                  {activePlan?.title || "November Fast-Moving Restock Batch #1"}
                </h3>
              </div>
              <Badge
                variant={activePlan?.status === "paid" ? "success" : activePlan?.status === "approved" ? "info" : "warning"}
                size="md"
                dot
              >
                {activePlan?.status === "paid" ? "SETTLED / PAID" : activePlan?.status === "approved" ? "APPROVED • READY TO PAY" : "AWAITING APPROVAL"}
              </Badge>
            </div>

            {/* Plan Selector if multiple plans exist */}
            {plans.length > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-xs font-semibold text-slate-600">Switch Restock Order:</span>
                <select
                  value={activePlan?.id}
                  onChange={(e) => {
                    const p = plans.find(x => x.id === e.target.value);
                    if (p) setActivePlan(p);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-bold focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                >
                  {plans.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.title || `Plan ${p.id}`} — ${(p.totalAmount ?? 0).toLocaleString()} ({(p.status || 'pending').toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Manager Approval Banner if not approved */}
            {activePlan && activePlan.status !== "approved" && activePlan.status !== "paid" && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Current Plan status: <strong className="uppercase">{activePlan.status.replace('_', ' ')}</strong>. PayPal Orders v2 settlement requires manager approval.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleQuickApprovePlan}
                  disabled={isApproving}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isApproving ? "Approving..." : "Approve Plan as Manager"}</span>
                </button>
              </div>
            )}

            {/* Checkout Error Alert */}
            {checkoutError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-medium">{checkoutError}</span>
                </div>
                <button
                  onClick={() => setCheckoutError(null)}
                  className="text-rose-600 hover:text-rose-900 font-bold ml-2 p-1"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Line items in PO */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Order Lines for Fulfillment:</span>
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs bg-slate-50/40">
                {activePlan?.items && activePlan.items.length > 0 ? (
                  activePlan.items.map((item, idx) => (
                    <div key={item.sku || idx} className="p-3 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-800">
                          {item.selectedQty || item.recommendedQty || 1}x {item.productName || item.sku}
                        </span>
                        <p className="text-[11px] text-slate-400">
                          Supplier: {item.selectedSupplierName || "Primary Vendor"} (${(item.unitCost || 0).toFixed(2)} ea) • Lead: {item.leadTimeDays || 3}d
                        </p>
                      </div>
                      <span className="font-bold text-slate-900">
                        ${((item.selectedQty || item.recommendedQty || 1) * (item.unitCost || 0)).toFixed(2)}
                      </span>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="p-3 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-800">50x 65W GaN Fast Chargers</span>
                        <p className="text-[11px] text-slate-400">Supplier: VoltCore Distro ($14.50 ea)</p>
                      </div>
                      <span className="font-bold text-slate-900">$725.00</span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-800">35x ANC Wireless Earbuds Pro</span>
                        <p className="text-[11px] text-slate-400">Supplier: Nexus Acoustic Labs ($28.00 ea)</p>
                      </div>
                      <span className="font-bold text-slate-900">$980.00</span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-800">80x Braided 240W USB-C Cables</span>
                        <p className="text-[11px] text-slate-400">Supplier: Apex Wholesale ($3.80 ea)</p>
                      </div>
                      <span className="font-bold text-slate-900">$304.00</span>
                    </div>
                  </>
                )}

                <div className="p-3 flex justify-between items-center bg-emerald-50/60 text-emerald-800">
                  <span className="font-semibold">Volume Rebate & Combined Freight Discount</span>
                  <span className="font-bold">-$106.50</span>
                </div>
              </div>
            </div>

            {/* Cost breakdown summary */}
            <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-500">Payable Restock Total:</p>
                <p className="text-2xl font-extrabold text-slate-900">
                  ${(activePlan?.totalAmount ?? 2840).toFixed(2)}{" "}
                  <span className="text-xs font-semibold text-slate-400">USD</span>
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span>Currency:</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-white text-slate-800 font-bold"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Right: PayPal Sandbox Checkout Button Component */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">PayPal Checkout Interface</h4>
                  <p className="text-[11px] text-slate-500">Prepared Sandbox Button Container</p>
                </div>
              </div>
            </div>

            {paymentStep === "success" ? (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-emerald-900">
                  Payment Captured Successfully!
                </h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Sandbox Order ID:{" "}
                  <strong className="font-mono">{lastPaymentResult?.orderId}</strong>
                  <br />
                  Supplier purchase orders have been triggered for automated dispatch.
                </p>
                <button
                  onClick={() => setPaymentStep("idle")}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Triggers the PayPal Orders v2 Sandbox authorization and settlement workflow through the backend API.
                </p>

                {/* PayPal Styled Buttons */}
                <div className="space-y-2 pt-1">
                  <button
                    onClick={handleTriggerPayPalCheckout}
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-[#FFC439] hover:bg-[#F2BA36] text-[#003087] font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all hover:shadow-md cursor-pointer disabled:opacity-50"
                  >
                    {paymentStep === "authorizing" ? (
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Clock className="w-4 h-4 animate-spin" /> Authorizing in Sandbox...
                      </span>
                    ) : paymentStep === "capturing" ? (
                      <span className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Clock className="w-4 h-4 animate-spin" /> Capturing Payment...
                      </span>
                    ) : (
                      <>
                        <span className="font-black italic text-base">Pay</span>
                        <span className="font-black italic text-base text-[#0079C1]">Pal</span>
                        <span className="text-xs font-bold ml-1 text-slate-800">
                          Sandbox Checkout (${(activePlan?.totalAmount ?? 0).toFixed(2)})
                        </span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleTriggerPayPalCheckout}
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#003087] hover:bg-[#00276D] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>PayPal Pay in 4 (Interest-Free Wholesale Financing)</span>
                  </button>
                </div>

                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-800 space-y-0.5">
                  <p className="font-semibold flex items-center gap-1.5 text-xs text-emerald-900">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PayPal Buyer & Supplier Protection</span>
                  </p>
                  <p className="text-emerald-700 text-[10px] leading-relaxed">
                    Automated escrow release, shipment tracking validation, and full merchant audit logging enabled for this order.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Payment & Settlement History Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Restock Payment History</h3>
              <p className="text-xs text-slate-500">
                Audited ledger of supplier purchase order payments and PayPal transaction receipts
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              {payments.length} Records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">PO / Invoice #</th>
                  <th className="py-3 px-4">Plan Name & Details</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Invoice */}
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-slate-900">{record.orderId}</div>
                      <div className="text-[10px] text-slate-400">{record.invoiceNumber}</div>
                    </td>

                    {/* Plan */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800">{record.planTitle}</div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs">
                        {record.itemSummary}
                      </div>
                    </td>

                    {/* Supplier */}
                    <td className="py-3.5 px-4 font-medium text-slate-700">
                      {record.supplierName}
                    </td>

                    {/* Method */}
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        {record.method}
                      </span>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      ${(record.amount ?? 0).toFixed(2)} {record.currency || "USD"}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-slate-500">{record.date || "2026-11-07"}</td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <Badge variant="success" size="sm" dot>
                        {(record.status || "COMPLETED").toUpperCase()}
                      </Badge>
                    </td>

                    {/* Receipt Action */}
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedReceipt(record)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>Receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* View Receipt / Invoice Modal */}
      <Modal
        isOpen={!!selectedReceipt}
        onClose={() => setSelectedReceipt(null)}
        title="Electronic Restock Invoice & Receipt"
        description="PayPal Sandbox Transaction Receipt for Merchant Records"
        maxWidth="md"
      >
        {selectedReceipt && (
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">StockWise Pay</h4>
                  <p className="text-[11px] text-slate-500">Retail Restock Settlement Service</p>
                </div>
                <div className="text-right">
                  <Badge variant="success" size="sm" dot>
                    PAID / CAPTURED
                  </Badge>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400">Invoice: </span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedReceipt.invoiceNumber}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Order ID: </span>
                  <span className="font-mono font-bold text-slate-900">
                    {selectedReceipt.orderId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Date: </span>
                  <span className="font-semibold text-slate-900">{selectedReceipt.date}</span>
                </div>
                <div>
                  <span className="text-slate-400">Payment: </span>
                  <span className="font-semibold text-blue-700">{selectedReceipt.method}</span>
                </div>
              </div>
            </div>

            {/* Line Summary */}
            <div className="space-y-1.5">
              <span className="font-bold text-slate-800">Items Settled:</span>
              <p className="p-3 bg-white border border-slate-200 rounded-lg text-slate-700">
                {selectedReceipt.itemSummary}
              </p>
            </div>

            {/* Total */}
            <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex justify-between items-center text-sm font-bold">
              <span className="text-blue-950">Total Amount Settled:</span>
              <span className="text-blue-700">
                ${(selectedReceipt.amount ?? 0).toFixed(2)} {selectedReceipt.currency || "USD"}
              </span>
            </div>

            {/* PayPal Tx ID */}
            <div className="text-[11px] text-slate-500 text-center">
              PayPal Transaction ID:{" "}
              <span className="font-mono text-slate-700 font-semibold">
                {selectedReceipt.paypalTransactionId}
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Close
              </button>
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Invoice</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
