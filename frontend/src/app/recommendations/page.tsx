"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Check,
  History,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services/api";
import { AIRecommendation, PurchasePlan } from "@/types";

type SimulationMode = "balanced" | "aggressive" | "conservative";

export default function AIRecommendationsPage() {
  const router = useRouter();
  const [recommendations, setRecommendations] = useState<AIRecommendation[]>([]);
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [simulationMode, setSimulationMode] = useState<SimulationMode>("balanced");

  // Approval/Rejection Modals
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [managerNotes, setManagerNotes] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"pending" | "approved" | "rejected">(
    "pending"
  );
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [recData, planData] = await Promise.all([
      api.getAIRecommendations(),
      api.getPurchasePlans(),
    ]);
    setRecommendations(recData);
    setPlans(planData);

    const pending = planData.find((p) => p.status === "pending_approval");
    if (pending) {
      setApprovalStatus("pending");
    } else if (planData[0]?.status === "approved") {
      setApprovalStatus("approved");
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Toggle individual recommendation item status
  const handleUpdateItemStatus = async (
    id: string,
    status: "approved" | "dismissed" | "pending_review"
  ) => {
    const updated = await api.updateRecommendationStatus(id, status);
    setRecommendations((prev) => prev.map((r) => (r.id === id ? updated : r)));
    showToast(
      status === "approved"
        ? "Recommendation included in final purchase batch!"
        : "Recommendation excluded."
    );
  };

  // Simulation mode multipliers
  const simulationConfig = {
    balanced: {
      label: "Balanced Restock (Recommended)",
      stockoutReduction: "92% → 6%",
      projectedMargin: "61.4%",
      capitalNeeded: "$2,840.00",
      turnoverDays: "18 days",
      riskLabel: "Low Stockout Risk",
    },
    aggressive: {
      label: "Aggressive Weekend Surge (+25% buffer)",
      stockoutReduction: "92% → 1%",
      projectedMargin: "64.2%",
      capitalNeeded: "$3,550.00",
      turnoverDays: "24 days",
      riskLabel: "Zero Stockout Risk",
    },
    conservative: {
      label: "Conservative Cash-Flow (Strict Minimums)",
      stockoutReduction: "92% → 19%",
      projectedMargin: "58.0%",
      capitalNeeded: "$1,890.00",
      turnoverDays: "11 days",
      riskLabel: "Higher Stockout Risk",
    },
  };

  // Manager Approve Plan
  const handleConfirmApproval = async () => {
    if (plans.length > 0) {
      const targetPlan = plans[0];
      const approvedPlan: PurchasePlan = {
        ...targetPlan,
        status: "approved",
        approvedAt: new Date().toISOString().replace("T", " ").substring(0, 16),
        approvedBy: "Marcus Vance (Store Manager)",
        approvalNotes: managerNotes || "Approved as simulated. Fast-tracked to PayPal checkout.",
      };
      await api.savePurchasePlan(approvedPlan);
      setApprovalStatus("approved");
      setIsApproveModalOpen(false);
      showToast("Purchase Plan APPROVED! Redirecting to PayPal Settlement...");
      setTimeout(() => router.push("/payments"), 1200);
    }
  };

  // Manager Reject Plan
  const handleConfirmRejection = async () => {
    if (plans.length > 0) {
      const targetPlan = plans[0];
      const rejectedPlan: PurchasePlan = {
        ...targetPlan,
        status: "rejected",
        notes: `Manager Feedback: ${managerNotes || "Revision requested on quantities"}`,
      };
      await api.savePurchasePlan(rejectedPlan);
      setApprovalStatus("rejected");
      setIsRejectModalOpen(false);
      showToast("Plan returned to Purchase Planner for adjustments.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast */}
        {toast && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{toast}</span>
            </div>
            <button onClick={() => setToast(null)} className="text-emerald-700 hover:text-emerald-900">
              ✕
            </button>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                AI Restock Recommendations & Simulation
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs">
                DeepSeek / Gemini Engine
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Explainable AI reasoning, cash-flow impact simulations, and manager governance workflow
            </p>
          </div>

          {/* Manager Action Buttons */}
          <div className="flex items-center gap-2.5">
            {approvalStatus === "approved" ? (
              <Link
                href="/payments"
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2 shadow-xs transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Plan Approved • Proceed to PayPal</span>
              </Link>
            ) : approvalStatus === "rejected" ? (
              <button
                onClick={() => setApprovalStatus("pending")}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Reset Approval Status
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsRejectModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <XCircle className="w-4 h-4 text-rose-500" />
                  <span>Reject / Revise</span>
                </button>

                <button
                  onClick={() => setIsApproveModalOpen(true)}
                  className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve Restock Plan</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* FEATURE 1: Simulation Mode Switcher & Projected Metrics */}
        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md border border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Inventory Scenario Simulation Engine
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Simulate your inventory turnover and stockout risk under varying retailer policies
              </p>
            </div>

            {/* Mode Toggle Buttons */}
            <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setSimulationMode("balanced")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  simulationMode === "balanced"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Balanced (Default)
              </button>
              <button
                onClick={() => setSimulationMode("aggressive")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  simulationMode === "aggressive"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Aggressive (+25%)
              </button>
              <button
                onClick={() => setSimulationMode("conservative")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  simulationMode === "conservative"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Conservative Cash
              </button>
            </div>
          </div>

          {/* Simulated Impact Stat Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Stockout Risk Reduction
              </span>
              <div className="text-xl font-extrabold text-emerald-400 mt-1">
                {simulationConfig[simulationMode].stockoutReduction}
              </div>
              <span className="text-[11px] text-slate-400">
                {simulationConfig[simulationMode].riskLabel}
              </span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Projected Gross Margin
              </span>
              <div className="text-xl font-extrabold text-blue-400 mt-1">
                {simulationConfig[simulationMode].projectedMargin}
              </div>
              <span className="text-[11px] text-slate-400">Avg across 5 items</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Capital Required
              </span>
              <div className="text-xl font-extrabold text-white mt-1">
                {simulationConfig[simulationMode].capitalNeeded}
              </div>
              <span className="text-[11px] text-slate-400">Under $3,500 plan cap</span>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Inventory Turnover Velocity
              </span>
              <div className="text-xl font-extrabold text-amber-300 mt-1">
                {simulationConfig[simulationMode].turnoverDays}
              </div>
              <span className="text-[11px] text-slate-400">Estimated sell-through</span>
            </div>
          </div>
        </div>

        {/* FEATURE 2: Detailed AI Reasoning & Explanation Cards */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-900">
              Generated Restock Rationale ({recommendations.length} items)
            </h3>
            <span className="text-xs text-slate-500">
              Transparent algorithmic explanations based on sales telemetry & supplier lead time
            </span>
          </div>

          <div className="space-y-4">
            {recommendations.map((rec) => {
              const isApproved = rec.status === "approved";
              const isDismissed = rec.status === "dismissed";

              return (
                <div
                  key={rec.id}
                  className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
                    isDismissed
                      ? "opacity-50 border-slate-200"
                      : isApproved
                      ? "border-emerald-300 bg-emerald-50/15"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Left: Product & Action Info */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">
                          {rec.productName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {rec.sku}
                        </span>

                        <Badge
                          variant={
                            rec.action === "URGENT_RESTOCK"
                              ? "danger"
                              : rec.action === "BULK_SAVING"
                              ? "success"
                              : "info"
                          }
                          size="sm"
                        >
                          {rec.action.replace("_", " ")}
                        </Badge>

                        <Badge
                          variant={
                            rec.urgency === "critical"
                              ? "danger"
                              : rec.urgency === "high"
                              ? "warning"
                              : "default"
                          }
                          size="sm"
                          dot
                        >
                          {rec.urgency.toUpperCase()} PRIORITY
                        </Badge>
                      </div>

                      {/* Natural Language AI Explanation */}
                      <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <strong className="text-blue-600 font-semibold">AI Rationale: </strong>
                        {rec.explanation}
                      </p>

                      {/* Metric Highlights Pills */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {rec.metricHighlights.map((m, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 text-[11px] font-medium"
                          >
                            <span className="text-slate-500">{m.label}:</span>
                            <span
                              className={`font-bold ${
                                m.positive === true
                                  ? "text-emerald-700"
                                  : m.positive === false
                                  ? "text-rose-700"
                                  : "text-slate-900"
                              }`}
                            >
                              {m.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Quantity, Pricing & Per-Item Manager Decision */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-end justify-between gap-3 shrink-0 lg:w-60 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-5">
                      <div className="text-right space-y-1 w-full">
                        <div className="text-xs text-slate-500">
                          Recommended:{" "}
                          <strong className="text-slate-900">{rec.recommendedQty} units</strong>
                        </div>
                        <div className="text-base font-extrabold text-blue-600">
                          ${rec.totalEstimatedCost.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Supplier: <strong>{rec.suggestedSupplier}</strong>
                        </div>
                      </div>

                      {/* Item Toggle Actions */}
                      <div className="flex items-center gap-2 pt-2 w-full justify-end">
                        {isDismissed ? (
                          <button
                            onClick={() => handleUpdateItemStatus(rec.id, "pending_review")}
                            className="text-xs text-slate-600 hover:underline"
                          >
                            Undo Exclusion
                          </button>
                        ) : isApproved ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                            <Check className="w-3.5 h-3.5" /> Included in Order
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleUpdateItemStatus(rec.id, "dismissed")}
                              className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Exclude from this batch"
                            >
                              Exclude
                            </button>
                            <button
                              onClick={() => handleUpdateItemStatus(rec.id, "approved")}
                              className="px-3 py-1 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1"
                            >
                              <Check className="w-3 h-3" />
                              <span>Include</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Manager Decision Audit Box */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-bold text-slate-900">Manager Sign-off Log</h4>
            </div>
            <span className="text-xs text-slate-400">Authenticated user: Marcus Vance</span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">
                  Batch #1 Simulation Review (Status:{" "}
                  <strong
                    className={
                      approvalStatus === "approved"
                        ? "text-emerald-600 uppercase"
                        : approvalStatus === "rejected"
                        ? "text-rose-600 uppercase"
                        : "text-amber-600 uppercase"
                    }
                  >
                    {approvalStatus}
                  </strong>
                  )
                </p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Working capital risk: Low | Target delivery window: 48-96h
                </p>
              </div>

              <div className="text-right">
                <span className="text-slate-400 text-[11px]">Today at 00:45</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Approve Plan Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title="Approve Restock Purchase Plan"
        description="Authorizing order will forward the total amount ($2,840.00) to PayPal Sandbox settlement."
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Confirmation & Governance Check
            </p>
            <p className="text-[11px]">
              - Total Order: <strong>$2,840.00</strong> (Under $3,500 target budget)
              <br />
              - Suppliers: VoltCore Electronics, Nexus Acoustic Labs, Apex Direct
              <br />- Settlement: Ready for PayPal Sandbox authentication
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Manager Approval Note (Optional):
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Approved. Proceed with immediate weekend dispatch."
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setIsApproveModalOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmApproval}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Sign & Proceed to PayPal</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Plan Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject or Request Revision"
        description="Provide feedback to refine quantities, budget, or supplier selection"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Revision Feedback / Instructions *
            </label>
            <textarea
              rows={3}
              required
              placeholder="e.g. Reduce gaming headset quantity from 25 to 15, and switch cables to Shenzhen Direct."
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              className="w-full p-2.5 text-xs rounded-xl border border-slate-300 text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setIsRejectModalOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRejection}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
            >
              Confirm Revision Request
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
