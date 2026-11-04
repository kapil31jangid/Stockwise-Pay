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

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [activePlan, setActivePlan] = useState<PurchasePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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
    const [payData, planData] = await Promise.all([
      api.getPayments(),
      api.getPurchasePlans(),
    ]);
    setPayments(payData);
    if (planData.length > 0) {
      setActivePlan(planData[0]);
    }
  };

  // Simulate PayPal Sandbox Two-Phase Flow (create-order -> capture-order)
  const handleTriggerPayPalCheckout = async () => {
    if (!activePlan) return;
    setIsLoading(true);
    setPaymentStep("authorizing");

    try {
      // 1. Prepare Order on backend
      const order = await api.createPayPalOrder({
        planId: activePlan.id,
        amount: activePlan.totalAmount,
        currency: currency,
        items: activePlan.items.map((i) => ({
          name: i.productName,
          quantity: i.selectedQty,
          unitPrice: i.unitCost,
        })),
      });

      // Simulation delay for sandbox modal window
      setTimeout(async () => {
        setPaymentStep("capturing");

        // 2. Capture Order on backend
        const record = await api.capturePayPalOrder({
          orderId: order.orderId,
          planTitle: activePlan.title,
          supplierName: "VoltCore & Apex Wholesale Consolidated",
          amount: activePlan.totalAmount,
          currency: currency,
          itemSummary: `${activePlan.itemCount} electronics SKUs (November Restock Batch #1)`,
        });

        // Update local plan state to paid
        await api.savePurchasePlan({
          ...activePlan,
          status: "paid",
        });

        setPayments((prev) => [record, ...prev]);
        setLastPaymentResult(record);
        setPaymentStep("success");
        setIsLoading(false);
      }, 1500);
    } catch (err) {
      console.error(err);
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
                PayPal Sandbox Restock Settlements
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                Sandbox Environment
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Structured for direct Node.js + Express backend settlement with PayPal REST APIs v2
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xs">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              <span>TLS 1.3 End-to-End Encrypted</span>
            </span>
          </div>
        </div>

        {/* SECTION 1: Backend & Sandbox Readiness Banner */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-blue-800/80">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">
                  PayPal Developer Sandbox Architecture Ready
                </h3>
              </div>
              <p className="text-xs text-blue-100/90 leading-relaxed max-w-3xl">
                Ready for Node.js Express server (`/api/paypal/create-order` & `/api/paypal/capture-order`).
                No live charges will occur. Use provided mock credentials or inject your Client ID via{" "}
                <code className="text-blue-200 font-mono bg-blue-950/80 px-1.5 py-0.5 rounded">
                  NEXT_PUBLIC_PAYPAL_CLIENT_ID
                </code>
                .
              </p>
            </div>

            <div className="p-3 bg-blue-950/90 border border-blue-700/60 rounded-xl text-[11px] space-y-1 shrink-0 text-slate-200">
              <p className="font-bold text-blue-300">Sandbox Test Account:</p>
              <p>Email: <span className="font-mono text-white">buyer-retail@stockwise.test</span></p>
              <p>Mode: <span className="font-bold text-emerald-400">Sandbox (Simulated)</span></p>
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
                variant={activePlan?.status === "paid" ? "success" : "warning"}
                size="md"
                dot
              >
                {activePlan?.status === "paid" ? "SETTLED / PAID" : "AWAITING PAYMENT"}
              </Badge>
            </div>

            {/* Line items in PO */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700">Order Lines for Fulfillment:</span>
              <div className="border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs bg-slate-50/40">
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

                <div className="p-3 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-slate-800">25x Wireless Gaming Headsets</span>
                    <p className="text-[11px] text-slate-400">Supplier: Nexus Acoustic Labs ($29.50 ea)</p>
                  </div>
                  <span className="font-bold text-slate-900">$737.50</span>
                </div>

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
                  ${activePlan?.totalAmount.toFixed(2) || "2,840.00"}{" "}
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
                  Clicking the button below simulates the full PayPal Sandbox authorization and capture handshake with the backend.
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
                          Sandbox Checkout (${activePlan?.totalAmount.toFixed(2) || "2,840.00"})
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

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 space-y-1">
                  <p className="font-semibold text-slate-700">Developer Integration Note:</p>
                  <p>
                    When deploying your Node.js + Express backend, configure{" "}
                    <code>app.post(&apos;/api/paypal/create-order&apos;)</code> to interface with the PayPal
                    Orders v2 REST API.
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
                      ${record.amount.toFixed(2)} {record.currency}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-slate-500">{record.date}</td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <Badge variant="success" size="sm" dot>
                        {record.status.toUpperCase()}
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
                ${selectedReceipt.amount.toFixed(2)} {selectedReceipt.currency}
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
