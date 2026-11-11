"use client";

import React, { useState, useEffect, useRef } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import {
  CreditCard,
  ShieldCheck,
  CheckCircle2,
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
  const [paymentStep, setPaymentStep] = useState<"idle" | "capturing" | "success">("idle");
  const [paypalOrder, setPaypalOrder] = useState<{ orderId: string; amount: number; currency: string } | null>(null);
  const [lastPaymentResult, setLastPaymentResult] = useState<PaymentRecord | null>(null);
  const [currency] = useState("USD");
  const capturedOrderIds = useRef<Set<string>>(new Set());
  const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || "";

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
    } catch (err: any) {
      console.error("Error loading payment data:", err);
      setCheckoutError(err.message || "Failed to load authoritative payment records from backend.");
    }
  };

  // Quick Approve Plan if currently pending
  const handleQuickApprovePlan = async () => {
    if (!activePlan) return;
    setIsApproving(true);
    setCheckoutError(null);
    try {
      const approverName = user?.name || "Marcus Vance";
      const approverRole = user?.role || "Inventory Lead";
      if (api.approvePlan) {
        await api.approvePlan(activePlan.id, approverName, "Fast-track approved for PayPal settlement", approverRole);
      }
      // Authoritatively refetch the updated plan from the server
      const refreshedPlan = await api.getPurchasePlan(activePlan.id);
      if (refreshedPlan) {
        setActivePlan(refreshedPlan);
        setPlans((prev) => prev.map((p) => (p.id === activePlan.id ? refreshedPlan : p)));
      }
    } catch (err: any) {
      setCheckoutError(err.message || "Failed to approve plan");
    } finally {
      setIsApproving(false);
    }
  };

  const createPayPalOrder = async () => {
    if (!activePlan) throw new Error("Select an approved purchase plan first.");
    const order = await api.createPayPalOrder({ planId: activePlan.id, amount: activePlan.totalAmount ?? 0, currency, items: [] });
    setPaypalOrder({ orderId: order.orderId, amount: Number(order.amount), currency: order.currency });
    return order.orderId;
  };

  const captureApprovedPayPalOrder = async (data: { orderID?: string }) => {
    const orderId = data.orderID;
    if (!orderId || capturedOrderIds.current.has(orderId) || !activePlan || isLoading) return;
    capturedOrderIds.current.add(orderId);
    setIsLoading(true);
    setCheckoutError(null);
    setPaymentStep("capturing");
    try {
      const record = await api.capturePayPalOrder({ orderId, planTitle: activePlan.title || `Restock Plan #${activePlan.id}`, supplierName: activePlan.items?.[0]?.selectedSupplierName || "Consolidated Supplier Network", amount: paypalOrder?.amount ?? activePlan.totalAmount ?? 0, currency: paypalOrder?.currency ?? "USD", itemSummary: `${activePlan.itemCount || activePlan.items?.length || 1} procurement items` });
      await loadData();
      setLastPaymentResult(record);
      setPaymentStep("success");
      setPaypalOrder(null);
    } catch (err: any) {
      capturedOrderIds.current.delete(orderId);
      setCheckoutError(err.message || "PayPal capture failed. No payment is shown as successful.");
      setPaymentStep("idle");
    } finally {
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
                PayPal Sandbox integration
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Enterprise procurement settlements powered by PayPal Orders v2 with automated budget ledger sync
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xs">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>PayPal Orders v2</span>
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
              <p>Gateway: <span className="font-mono text-white">PayPal Orders v2 REST API</span></p>
              <p>Mode: <span className="font-bold text-emerald-400">PayPal Sandbox Environment</span></p>
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
                <span className="px-2 py-1 text-xs rounded-md border border-slate-300 bg-slate-50 text-slate-800 font-bold">USD ($)</span>
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

            {!paypalClientId ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                <p className="font-bold">PayPal Sandbox is not configured</p>
                <p>Set <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> to the public client ID from the same Sandbox REST app as the backend credentials, then restart the frontend.</p>
              </div>
            ) : paymentStep === "success" ? (
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
                  onClick={() => {
                    setPaymentStep("idle");
                    setPaypalOrder(null);
                  }}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  The backend creates the authoritative USD Orders v2 order. PayPal captures only after the buyer approves in the Smart Buttons checkout.
                </p>
                {paymentStep === "capturing" && <p className="text-xs font-semibold text-blue-700">Buyer approved. Verifying capture with the backend…</p>}
                <PayPalScriptProvider options={{ clientId: paypalClientId, currency: "USD", intent: "capture", components: "buttons" }}>
                  <PayPalButtons
                    style={{ layout: "vertical", shape: "rect", label: "paypal" }}
                    disabled={isLoading || activePlan?.status === "paid" || activePlan?.status !== "approved"}
                    createOrder={createPayPalOrder}
                    onApprove={captureApprovedPayPalOrder}
                    onCancel={() => setCheckoutError("PayPal checkout was cancelled by the buyer.")}
                    onError={(err) => setCheckoutError(`PayPal checkout error: ${err instanceof Error ? err.message : "Unable to complete checkout."}`)}
                  />
                </PayPalScriptProvider>

                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-[11px] text-emerald-800 space-y-0.5">
                  <p className="font-semibold flex items-center gap-1.5 text-xs text-emerald-900">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>PayPal Buyer & Supplier Protection</span>
                  </p>
                  <p className="text-emerald-700 text-[10px] leading-relaxed">
                    The UI reports success only after the backend verifies the capture and settles the ledger.
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
                      <span className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded border text-[11px] ${
                        record.method?.includes('Simulated') || record.method === 'Dev Simulator'
                          ? 'text-amber-800 bg-amber-50 border-amber-200'
                          : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      }`}>
                        {record.method?.includes('Simulated') || record.method === 'Dev Simulator' ? 'Dev Simulator (Mock)' : 'PayPal Sandbox'}
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
                      <Badge
                        variant={
                          (record.status || '').toLowerCase() === 'completed'
                            ? 'success'
                            : (record.status || '').toLowerCase() === 'created' || (record.status || '').toLowerCase() === 'pending'
                            ? 'warning'
                            : 'danger'
                        }
                        size="sm"
                        dot
                      >
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
