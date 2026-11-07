"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Sparkles,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Truck,
  SlidersHorizontal,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services/api";
import {
  PurchasePlan,
  PurchasePlanItem,
  Supplier,
  InventoryItem,
  BudgetConfig,
} from "@/types";

export default function PurchasePlannerPage() {
  const [plans, setPlans] = useState<PurchasePlan[]>([]);
  const [currentPlan, setCurrentPlan] = useState<PurchasePlan | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [budget, setBudget] = useState<BudgetConfig>({
    monthlyBudget: 15000,
    spentThisMonth: 6420,
    allocatedPending: 3840,
  });

  // Editable Plan Budget state
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [planBudgetInput, setPlanBudgetInput] = useState("3500");

  // Add Item Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");

  // Notification Toast
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [planData, supData, invData, budData] = await Promise.all([
      api.getPurchasePlans(),
      api.getSuppliers(),
      api.getInventory(),
      api.getBudget(),
    ]);

    setPlans(planData);
    setSuppliers(supData);
    setInventory(invData);
    setBudget(budData);

    // Pick active or first plan
    if (planData.length > 0) {
      setCurrentPlan(planData[0]);
      setPlanBudgetInput(planData[0].budget.toString());
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Toggle selection
  const handleToggleSelect = (index: number) => {
    if (!currentPlan) return;
    const updatedItems = [...currentPlan.items];
    updatedItems[index].isSelected = !updatedItems[index].isSelected;
    recalculatePlan(updatedItems);
  };

  // Change quantity
  const handleQuantityChange = (index: number, newQty: number) => {
    if (!currentPlan || newQty < 1) return;
    const updatedItems = [...currentPlan.items];
    updatedItems[index].selectedQty = newQty;
    updatedItems[index].subtotal = Number((newQty * updatedItems[index].unitCost).toFixed(2));
    recalculatePlan(updatedItems);
  };

  // Change supplier for an item
  const handleSupplierChange = (index: number, newSupplierId: string) => {
    if (!currentPlan) return;
    const updatedItems = [...currentPlan.items];
    const targetItem = updatedItems[index];
    const sup = suppliers.find((s) => s.id === newSupplierId);
    if (!sup) return;

    // Check if supplier has custom offer price for this product
    const offer = (sup.offers || []).find((o) => o.productId === targetItem.productId || o.sku === targetItem.sku);
    const unitCost = offer ? offer.unitPrice : targetItem.unitCost;
    const leadTimeDays = offer ? offer.leadTimeDays : sup.leadTimeDays;

    updatedItems[index] = {
      ...targetItem,
      selectedSupplierId: sup.id,
      selectedSupplierName: sup.name,
      unitCost,
      leadTimeDays,
      subtotal: Number((targetItem.selectedQty * unitCost).toFixed(2)),
    };

    recalculatePlan(updatedItems);
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    if (!currentPlan) return;
    const updatedItems = currentPlan.items.filter((_, i) => i !== index);
    recalculatePlan(updatedItems);
    showToast("Product line removed from purchase batch.");
  };

  // Recalculate and update current plan
  const recalculatePlan = async (items: PurchasePlanItem[]) => {
    if (!currentPlan) return;
    const selectedItems = items.filter((i) => i.isSelected);
    const totalAmount = selectedItems.reduce((sum, i) => sum + i.subtotal, 0);

    const updatedPlan: PurchasePlan = {
      ...currentPlan,
      items,
      itemCount: selectedItems.length,
      totalAmount: Number(totalAmount.toFixed(2)),
      budget: parseFloat(planBudgetInput) || currentPlan.budget,
    };

    setCurrentPlan(updatedPlan);
    await api.savePurchasePlan(updatedPlan);
  };

  // Save budget changes
  const handleSavePlanBudget = async () => {
    if (!currentPlan) return;
    const parsed = parseFloat(planBudgetInput);
    if (isNaN(parsed) || parsed <= 0) return;

    const updatedPlan: PurchasePlan = {
      ...currentPlan,
      budget: parsed,
    };
    setCurrentPlan(updatedPlan);
    setIsEditingBudget(false);
    await api.savePurchasePlan(updatedPlan);
    showToast(`Batch target budget set to $${parsed.toLocaleString()}`);
  };

  // Add Item to Plan from Catalog
  const handleAddItemToPlan = async () => {
    if (!currentPlan || !selectedCatalogId) return;
    const invItem = inventory.find((i) => i.id === selectedCatalogId);
    if (!invItem) return;

    // Default supplier
    const sup = suppliers.find((s) => s.id === invItem.supplierId) || suppliers[0];
    const qty = Math.max(10, invItem.targetStock - invItem.currentStock);

    const newItem: PurchasePlanItem = {
      productId: invItem.id,
      productName: invItem.name,
      sku: invItem.sku,
      category: invItem.category,
      currentStock: invItem.currentStock,
      recommendedQty: qty,
      selectedQty: qty,
      unitCost: invItem.unitCost,
      selectedSupplierId: sup?.id || "SUP001",
      selectedSupplierName: sup?.name || "VoltCore Distribution",
      leadTimeDays: sup?.leadTimeDays || 3,
      subtotal: Number((qty * invItem.unitCost).toFixed(2)),
      isSelected: true,
    };

    const updatedItems = [newItem, ...currentPlan.items];
    await recalculatePlan(updatedItems);
    setIsAddModalOpen(false);
    setSelectedCatalogId("");
    showToast(`Added ${invItem.name} to purchase plan.`);
  };

  // Calculations
  const selectedItems = currentPlan?.items.filter((i) => i.isSelected) || [];
  const subtotal = selectedItems.reduce((sum, i) => sum + i.subtotal, 0);
  const volumeDiscount = subtotal > 2000 ? Number((subtotal * 0.05).toFixed(2)) : 0;
  const estimatedShipping = subtotal > 1500 ? 0 : 45.0;
  const grandTotal = Number((subtotal - volumeDiscount + estimatedShipping).toFixed(2));
  const planBudget = currentPlan?.budget || 3500;
  const remainingBudget = planBudget - grandTotal;
  const isOverBudget = remainingBudget < 0;

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

        {/* Page Title & Plan Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                Purchase Order Planner
              </h2>
              {currentPlan && (
                <Badge variant={(currentPlan.status || 'pending_approval') === "pending_approval" ? "warning" : "info"} size="sm" dot>
                  {(currentPlan.status || "pending_approval").replace("_", " ").toUpperCase()}
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Fine-tune replenishment quantities, switch suppliers for best margins, and enforce budget caps
            </p>
            {plans.length > 1 && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Selected Plan:</span>
                <select
                  value={currentPlan?.id}
                  onChange={(e) => {
                    const p = plans.find((x) => x.id === e.target.value);
                    if (p) {
                      setCurrentPlan(p);
                      setPlanBudgetInput(p.budget.toString());
                    }
                  }}
                  className="px-2 py-1 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-800 shadow-2xs"
                >
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (${p.totalAmount.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>Add Catalog Item</span>
            </button>

            <Link
              href="/recommendations"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Simulate AI Plan</span>
            </Link>
          </div>
        </div>

        {/* FEATURE: Editable Budget & Real-time Allocation Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 divide-y md:divide-y-0 md:divide-x divide-slate-100">
            {/* Column 1: Editable Plan Target Budget */}
            <div className="space-y-1.5 pr-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Target Restock Budget
                </span>
                {!isEditingBudget ? (
                  <button
                    onClick={() => setIsEditingBudget(true)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>Edit</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSavePlanBudget}
                    className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800"
                  >
                    Save
                  </button>
                )}
              </div>

              {!isEditingBudget ? (
                <div className="text-2xl font-extrabold text-slate-900">
                  ${planBudget.toLocaleString()}
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-slate-400">$</span>
                  <input
                    type="number"
                    value={planBudgetInput}
                    onChange={(e) => setPlanBudgetInput(e.target.value)}
                    className="w-28 px-2 py-1 text-sm font-bold rounded-lg border border-blue-400 focus:outline-hidden text-slate-900"
                  />
                  <button
                    onClick={handleSavePlanBudget}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded-md font-bold"
                  >
                    OK
                  </button>
                </div>
              )}
              <p className="text-[11px] text-slate-500">Cap assigned for Batch #1</p>
            </div>

            {/* Column 2: Total Planned Spend */}
            <div className="space-y-1.5 md:pl-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Planned Order
              </span>
              <div className="text-2xl font-extrabold text-blue-600">
                ${grandTotal.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500">
                {selectedItems.length} active product lines
              </p>
            </div>

            {/* Column 3: Remaining Budget Balance */}
            <div className="space-y-1.5 md:pl-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Remaining Budget
              </span>
              <div
                className={`text-2xl font-extrabold ${
                  isOverBudget ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                ${remainingBudget.toLocaleString()}
              </div>
              <p className="text-[11px] text-slate-500">
                {isOverBudget ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Over budget ceiling!
                  </span>
                ) : (
                  "Safely within working capital cap"
                )}
              </p>
            </div>

            {/* Column 4: Monthly Store Context */}
            <div className="space-y-1.5 md:pl-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Monthly Store Ceiling
              </span>
              <div className="text-2xl font-extrabold text-slate-900">
                ${budget.monthlyBudget.toLocaleString()}
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.round(
                        (((budget?.spentThisMonth ?? 0) + grandTotal) / (budget?.monthlyBudget || 15000)) * 100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Layout: Items Table (2/3) + Order Summary & PayPal Checkout Action (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Table Section */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900">Purchase Batch Product Lines</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  {selectedItems.length} selected
                </span>
              </div>
              <span className="text-xs text-slate-500">All prices in USD ($)</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-3 text-center">Include</th>
                    <th className="py-3 px-3">Product / SKU</th>
                    <th className="py-3 px-3">Current Stock</th>
                    <th className="py-3 px-3">Quantity</th>
                    <th className="py-3 px-3">Selected Supplier</th>
                    <th className="py-3 px-3">Unit Cost</th>
                    <th className="py-3 px-3">Line Total</th>
                    <th className="py-3 px-3 text-right">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentPlan?.items.map((item, idx) => (
                    <tr
                      key={item.productId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        !item.isSelected ? "opacity-50 bg-slate-50/30" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={item.isSelected}
                          onChange={() => handleToggleSelect(idx)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* Product */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900">{item.productName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.sku}</div>
                      </td>

                      {/* Current Stock */}
                      <td className="py-3 px-3">
                        <span
                          className={`font-semibold ${
                            item.currentStock <= 10 ? "text-rose-600" : "text-slate-700"
                          }`}
                        >
                          {item.currentStock} units
                        </span>
                      </td>

                      {/* Quantity Input */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, item.selectedQty - 5)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={item.selectedQty}
                            onChange={(e) =>
                              handleQuantityChange(idx, parseInt(e.target.value, 10) || 1)
                            }
                            className="w-14 text-center py-1 text-xs font-bold rounded border border-slate-200 text-slate-900 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(idx, item.selectedQty + 5)}
                            className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Supplier Dropdown */}
                      <td className="py-3 px-3 min-w-[150px]">
                        <select
                          value={item.selectedSupplierId}
                          onChange={(e) => handleSupplierChange(idx, e.target.value)}
                          className="w-full px-2 py-1 text-xs rounded border border-slate-200 bg-white text-slate-800 font-medium focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        >
                          {suppliers.map((sup) => (
                            <option key={sup.id} value={sup.id}>
                              {sup.name} ({sup.leadTimeDays}d)
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Unit Cost */}
                      <td className="py-3 px-3 font-medium text-slate-700">
                        ${item.unitCost.toFixed(2)}
                      </td>

                      {/* Line Subtotal */}
                      <td className="py-3 px-3 font-bold text-slate-900">
                        ${item.subtotal.toFixed(2)}
                      </td>

                      {/* Remove Button */}
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}

                  {currentPlan?.items.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        No product lines in this plan yet. Click &quot;Add Catalog Item&quot; to begin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Summary & Checkout Action Card */}
          <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Restock Financial Summary</h3>
              <p className="text-xs text-slate-500">Live order breakdown & vendor terms</p>
            </div>

            <div className="space-y-2.5 text-xs border-t border-slate-100 pt-4">
              <div className="flex justify-between text-slate-600">
                <span>Selected Items Subtotal:</span>
                <span className="font-semibold text-slate-900">${subtotal.toFixed(2)}</span>
              </div>

              {volumeDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Wholesale Volume Rebate (5%):</span>
                  </span>
                  <span className="font-semibold">-${volumeDiscount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-600">
                <span className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  <span>Freight & Expedited Logistics:</span>
                </span>
                <span className="font-semibold text-slate-900">
                  {estimatedShipping === 0 ? "FREE" : `$${estimatedShipping.toFixed(2)}`}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
                <span className="text-sm font-bold text-slate-900">Grand Total:</span>
                <span className="text-xl font-extrabold text-blue-600">
                  ${grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Budget status box */}
            <div
              className={`p-3 rounded-xl border text-xs ${
                isOverBudget
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                {isOverBudget ? (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Over Plan Budget by ${Math.abs(remainingBudget).toFixed(2)}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Within Restock Budget</span>
                  </>
                )}
              </div>
              <p className="text-[11px] opacity-90">
                {isOverBudget
                  ? "Adjust quantities or edit the target budget above to keep working capital protected."
                  : `$${remainingBudget.toFixed(2)} cash headroom remaining in this order.`}
              </p>
            </div>

            {/* Checkout & Action Buttons */}
            <div className="space-y-2 pt-2">
              <Link
                href="/payments"
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <CreditCard className="w-4 h-4" />
                <span>Proceed to PayPal Checkout</span>
              </Link>

              <Link
                href="/recommendations"
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span>Simulate AI Approval Plan</span>
              </Link>
            </div>

            <div className="pt-2 text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              <span>Prepared for PayPal Sandbox Testing</span>
            </div>
          </div>
        </div>
      </div>

      {/* Add Catalog Item Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Catalog Item to Purchase Plan"
        description="Select an existing electronics product to replenish"
        maxWidth="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Product:
            </label>
            <select
              value={selectedCatalogId}
              onChange={(e) => setSelectedCatalogId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-900"
            >
              <option value="">-- Choose an electronics product --</option>
              {inventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (Stock: {item.currentStock} | ${item.unitCost.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleAddItemToPlan}
              disabled={!selectedCatalogId}
              className={`px-4 py-1.5 text-xs font-bold text-white rounded-lg shadow-xs ${
                selectedCatalogId
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-slate-300 cursor-not-allowed"
              }`}
            >
              Add to Plan
            </button>
          </div>
        </div>
      </Modal>
    </DashboardLayout>
  );
}
