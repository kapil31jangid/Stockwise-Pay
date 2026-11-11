import {
  InventoryItem,
  Supplier,
  PurchasePlan,
  AIRecommendation,
  PaymentRecord,
  BudgetConfig,
} from "@/types";
import {
  initialInventory,
  initialSuppliers,
  initialPurchasePlans,
  initialAIRecommendations,
  initialPayments,
  initialBudget,
} from "./mockData";

const isProduction = process.env.NODE_ENV === "production";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (isProduction ? "" : "http://localhost:5000/api");

if (isProduction && !process.env.NEXT_PUBLIC_API_URL) {
  console.warn("⚠️ Production warning: NEXT_PUBLIC_API_URL is not set. All business requests will fail closed.");
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);

  if (typeof window !== "undefined") {
    let token = "";
    try {
      const storedToken = localStorage.getItem("stockwise_jwt_token");
      if (storedToken && storedToken.split(".").length === 3) {
        token = storedToken;
      }
    } catch {}

    if (!token && typeof document !== "undefined") {
      const match = document.cookie.match(/stockwise_token=([^;]+)/);
      if (match && match[1] && match[1].split(".").length === 3) {
        token = match[1];
      }
    }

    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      try {
        localStorage.setItem("stockwise_auth_user", "logged_out");
        localStorage.removeItem("stockwise_jwt_token");
        document.cookie = "stockwise_token=; path=/; max-age=0; SameSite=Lax";
      } catch {}
      window.location.replace("/login");
    }
    const errorText = await res.text();
    throw new Error(errorText || `API error ${res.status}`);
  }
  const json = await res.json();
  return (json && json.data !== undefined ? json.data : json) as T;
}

// Storage Keys for standalone offline development only
const STORAGE_KEYS = {
  INVENTORY: "stockwise_inventory_v1",
  SUPPLIERS: "stockwise_suppliers_v1",
  PLANS: "stockwise_plans_v1",
  RECOMMENDATIONS: "stockwise_recs_v1",
  PAYMENTS: "stockwise_payments_v1",
  BUDGET: "stockwise_budget_v1",
};

function getStoredData<T>(key: string, fallback: T): T {
  if (isProduction) {
    throw new Error(`Production error: Backend API request failed. LocalStorage business-data fallback is strictly disabled in production.`);
  }
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`Failed to read ${key} from localStorage`, e);
    return fallback;
  }
}

function setStoredData<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn(`Failed to write ${key} to localStorage`, e);
  }
}

export const api = {
  // --- INVENTORY API ---
  async getInventory(): Promise<InventoryItem[]> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/inventory`);
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      return list.map((item: any, idx: number) => {
        const unitCost = Number(item.unitCost || 10);
        const retailPrice = Number(item.retailPrice ?? item.sellingPrice ?? (unitCost * 2));
        const currentStock = Number(item.currentStock ?? 0);
        const reorderPoint = Number(item.reorderPoint ?? item.safetyStock ?? 15);
        const targetStock = Number(item.targetStock || (reorderPoint * 2) || 50);
        const salesVelocityPerWeek = Number(item.salesVelocityPerWeek ?? (item.averageDailyDemand ? Math.round(item.averageDailyDemand * 7) : 10));

        let status = item.status;
        if (!status) {
          if (currentStock === 0) status = "out_of_stock";
          else if (currentStock <= reorderPoint * 0.5) status = "critical";
          else if (currentStock <= reorderPoint) status = "low_stock";
          else status = "in_stock";
        }

        return {
          id: item.id || `item-${item.sku ? item.sku.toLowerCase() : idx}`,
          sku: item.sku || `SKU-${idx + 1}`,
          name: item.name || "Electronics Product",
          category: item.category || "Accessories",
          currentStock,
          reorderPoint,
          targetStock,
          unitCost,
          retailPrice,
          salesVelocityPerWeek,
          supplierName: item.supplierName || "Apex Wholesale Direct",
          supplierId: item.supplierId || item.preferredVendorId || "sup-1",
          status,
          lastRestocked: item.lastRestocked || "2026-11-01",
        };
      });
    }
    return getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
  },

  async addInventoryItem(item: Omit<InventoryItem, "id">): Promise<InventoryItem> {
    const newItem: InventoryItem = {
      ...item,
      id: `item-${Date.now()}`,
    };
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newItem.sku,
          name: newItem.name,
          category: newItem.category,
          currentStock: newItem.currentStock,
          safetyStock: newItem.reorderPoint,
          unitCost: newItem.unitCost,
          sellingPrice: newItem.retailPrice,
          preferredVendorId: newItem.supplierId,
        }),
      });
      return {
        ...newItem,
        id: res.sku ? `item-${res.sku.toLowerCase()}` : newItem.id,
        retailPrice: Number(res.sellingPrice ?? newItem.retailPrice),
        reorderPoint: Number(res.safetyStock ?? newItem.reorderPoint),
      };
    }
    const current = getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
    const updated = [newItem, ...current];
    setStoredData(STORAGE_KEYS.INVENTORY, updated);
    return newItem;
  },

  async importInventoryBatch(items: Omit<InventoryItem, "id">[]): Promise<InventoryItem[]> {
    const newItems: InventoryItem[] = items.map((it, idx) => ({
      ...it,
      id: `item-csv-${Date.now()}-${idx}`,
    }));
    if (API_BASE_URL) {
      const payload = newItems.map((it) => ({
        sku: it.sku,
        name: it.name,
        category: it.category,
        currentStock: it.currentStock,
        safetyStock: it.reorderPoint,
        unitCost: it.unitCost,
        sellingPrice: it.retailPrice,
        preferredVendorId: it.supplierId,
      }));
      await fetchJson<any>(`${API_BASE_URL}/inventory/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return await this.getInventory();
    }
    const current = getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
    const updated = [...newItems, ...current];
    setStoredData(STORAGE_KEYS.INVENTORY, updated);
    return updated;
  },

  async updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem> {
    if (API_BASE_URL) {
      const sku = updates.sku || id.replace(/^item-/, "").toUpperCase();
      const payload: any = { ...updates };
      if (updates.retailPrice !== undefined) payload.sellingPrice = updates.retailPrice;
      if (updates.reorderPoint !== undefined) payload.safetyStock = updates.reorderPoint;
      const res = await fetchJson<any>(`${API_BASE_URL}/inventory/${sku}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return {
        id,
        sku: res.sku || sku,
        name: res.name || updates.name || "Item",
        category: res.category || updates.category || "Accessories",
        currentStock: Number(res.currentStock ?? updates.currentStock ?? 0),
        reorderPoint: Number(res.safetyStock ?? updates.reorderPoint ?? 15),
        targetStock: Number(updates.targetStock || 50),
        unitCost: Number(res.unitCost ?? updates.unitCost ?? 10),
        retailPrice: Number(res.sellingPrice ?? updates.retailPrice ?? 25),
        salesVelocityPerWeek: Number(updates.salesVelocityPerWeek || 10),
        supplierName: updates.supplierName || "Apex Wholesale",
        supplierId: res.preferredVendorId || updates.supplierId || "SUP001",
        status: updates.status || "in_stock",
        lastRestocked: updates.lastRestocked || new Date().toISOString().split("T")[0],
      };
    }
    const current = getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
    const updated = current.map((i) => (i.id === id ? { ...i, ...updates } : i));
    setStoredData(STORAGE_KEYS.INVENTORY, updated);
    const found = updated.find((i) => i.id === id);
    if (!found) throw new Error("Item not found");
    return found;
  },

  // --- SUPPLIERS API ---
  async getSuppliers(): Promise<Supplier[]> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/suppliers`);
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      return list.map((s: any, idx: number) => ({
        id: s.id || `sup-${idx + 1}`,
        name: s.name || `Supplier #${idx + 1}`,
        rating: Number(s.rating || (s.reliabilityScore ? s.reliabilityScore / 20 : 4.8)),
        leadTimeDays: Number(s.leadTimeDays || s.estimatedLeadTimeDays || 3),
        moq: Number(s.moq || 20),
        paymentTerms: s.paymentTerms || "Net 30 / PayPal",
        location: s.location || "US Domestic Hub",
        reliability: Number(s.reliability || s.reliabilityScore || 98.0),
        contactEmail: s.contactEmail || "orders@supplier.com",
        contactPhone: s.contactPhone || "+1 (800) 555-0100",
        categorySpecialties: Array.isArray(s.categorySpecialties) ? s.categorySpecialties : Array.isArray(s.specialties) ? s.specialties : ["Electronics"],
        offers: Array.isArray(s.offers) ? s.offers.map((o: any) => ({
          productId: o.productId || `item-${o.sku ? o.sku.toLowerCase() : '1'}`,
          sku: o.sku,
          unitPrice: Number(o.unitPrice ?? o.unitCost ?? 10),
          moq: Number(o.moq ?? o.minOrderQty ?? 20),
          leadTimeDays: Number(o.leadTimeDays || s.leadTimeDays || s.estimatedLeadTimeDays || 3),
          bulkDiscount: o.bulkDiscount || o.bulkDiscountNote || undefined,
        })) : [],
      }));
    }
    return getStoredData(STORAGE_KEYS.SUPPLIERS, initialSuppliers);
  },

  // --- PURCHASE PLANNER API ---
  async getPurchasePlans(): Promise<PurchasePlan[]> {
    let raw: any[] = [];
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/plans`);
      // The API returns a `{ success, data }` envelope.  Keep accepting a
      // bare array for backwards compatibility, but never silently discard
      // the authoritative plans when the envelope is used.
      raw = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    } else {
      raw = getStoredData(STORAGE_KEYS.PLANS, initialPurchasePlans);
    }
    return raw.map((p: any, pIdx: number) => ({
      id: p.id || `PLAN-${pIdx}`,
      title: p.title || p.name || `Restock Plan #${pIdx + 1}`,
      createdAt: p.createdAt ? (p.createdAt.includes('T') ? p.createdAt.split('T')[0] : p.createdAt) : '2026-11-07',
      totalAmount: Number(p.totalAmount ?? p.calculatedTotal ?? 0),
      itemCount: Number(p.itemCount ?? (p.items || p.selectedItems || []).length),
      status: (p.status || p.planStatus || 'pending_approval') as any,
      budget: Number(p.budget ?? p.purchasingBudget ?? 2000),
      items: (p.items || p.selectedItems || []).map((i: any, iIdx: number) => {
        const qty = Number(i.selectedQty || i.recommendedQuantity || i.quantity || i.recommendedQty || 1);
        const unitCost = Number(i.unitCost || 0);
        return {
          id: i.id || `item-${iIdx}`,
          productId: i.productId || i.sku || `prod-${iIdx}`,
          sku: i.sku || 'SKU',
          productName: i.productName || i.name || i.sku || 'Item',
          category: i.category || 'Accessories',
          currentStock: Number(i.currentStock || 10),
          recommendedQty: qty,
          recommendedQuantity: qty,
          selectedQty: qty,
          quantity: qty,
          unitCost: unitCost,
          subtotal: Number(i.subtotal || (unitCost * qty)),
          isSelected: i.isSelected !== undefined ? i.isSelected : true,
          supplierName: i.supplierName || i.selectedSupplierName || 'Primary Supplier',
          selectedSupplierName: i.selectedSupplierName || i.supplierName || 'Primary Supplier',
          supplierId: i.supplierId || i.selectedSupplierId || 'SUP001',
          selectedSupplierId: i.selectedSupplierId || i.supplierId || 'SUP001',
          leadTimeDays: Number(i.leadTimeDays || 3),
          riskLevel: i.riskLevel || 'MEDIUM',
          daysUntilStockout: Number(i.daysUntilStockout || 5)
        };
      }),
      notes: p.notes,
      approvalNotes: p.approvalNotes,
      approvedAt: p.approvedAt,
      approvedBy: p.approvedBy
    }));
  },

  async savePurchasePlan(plan: PurchasePlan): Promise<PurchasePlan> {
    if (API_BASE_URL) {
      return fetchJson<PurchasePlan>(`${API_BASE_URL}/plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
    }
    const current = getStoredData(STORAGE_KEYS.PLANS, initialPurchasePlans);
    const index = current.findIndex((p) => p.id === plan.id);
    let updated: PurchasePlan[];
    if (index >= 0) {
      updated = [...current];
      updated[index] = plan;
    } else {
      updated = [plan, ...current];
    }
    setStoredData(STORAGE_KEYS.PLANS, updated);
    return plan;
  },

  async getPurchasePlan(id: string): Promise<PurchasePlan | null> {
    if (API_BASE_URL) {
      const p = await fetchJson<any>(`${API_BASE_URL}/plans/${id}`);
      if (!p) return null;
      return {
        id: p.id,
        title: p.name || p.title || `Plan ${p.id}`,
        createdAt: p.createdAt ? (p.createdAt.includes('T') ? p.createdAt.split('T')[0] : p.createdAt) : '2026-11-07',
        totalAmount: Number(p.calculatedTotal ?? p.totalAmount ?? 0),
        itemCount: Number(p.selectedItems?.length ?? p.itemCount ?? 0),
        status: (p.planStatus || p.status || 'pending_approval') as any,
        budget: Number(p.purchasingBudget ?? p.budget ?? 2000),
        items: (p.selectedItems || p.items || []).map((i: any, iIdx: number) => ({
          id: i.id || `item-${iIdx}`,
          productId: i.productId || i.sku || `prod-${iIdx}`,
          sku: i.sku,
          productName: i.productName || i.sku,
          category: i.category || 'Accessories',
          currentStock: Number(i.currentStock || 10),
          recommendedQty: Number(i.recommendedQuantity || i.quantity || 1),
          recommendedQuantity: Number(i.recommendedQuantity || i.quantity || 1),
          selectedQty: Number(i.recommendedQuantity || i.quantity || 1),
          quantity: Number(i.recommendedQuantity || i.quantity || 1),
          unitCost: Number(i.unitCost || 0),
          subtotal: Number(i.subtotal || 0),
          isSelected: true,
          supplierName: i.supplierName || 'Primary Supplier',
          selectedSupplierName: i.supplierName || 'Primary Supplier',
          supplierId: i.supplierId || 'SUP001',
          selectedSupplierId: i.supplierId || 'SUP001',
          leadTimeDays: Number(i.leadTimeDays || 3),
          riskLevel: i.riskLevel || 'MEDIUM',
          daysUntilStockout: Number(i.daysUntilStockout || 5)
        })),
        notes: p.notes,
        approvalNotes: p.approval?.decisionNotes,
        approvedAt: p.approval?.timestamp,
        approvedBy: p.approval?.approverName
      };
    }
    const plans = await this.getPurchasePlans();
    return plans.find(p => p.id === id) || null;
  },

  async approvePlan(planId: string, approverName: string = 'Marcus Vance', notes?: string, approverRole: string = 'Inventory Lead') {
    if (API_BASE_URL) {
      return await fetchJson<any>(`${API_BASE_URL}/plans/${planId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approverName, approverRole, notes }),
      });
    }
  },

  // --- AI RECOMMENDATIONS API ---
  async getAIRecommendations(): Promise<AIRecommendation[]> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/agent`);
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      return list.map((r: any, idx: number) => ({
        id: r.id || `rec-${idx}`,
        productId: r.productId || `prod-${idx}`,
        productName: r.productName || "Electronics Item",
        sku: r.sku || "SKU",
        action: r.action || "URGENT_RESTOCK",
        urgency: r.urgency || "high",
        explanation: r.explanation || "Restocking recommended based on sales runway.",
        metricHighlights: Array.isArray(r.metricHighlights) ? r.metricHighlights : [],
        recommendedQty: Number(r.recommendedQty || 20),
        projectedRunoutDays: Number(r.projectedRunoutDays || 3),
        costSavings: Number(r.costSavings || 0),
        suggestedSupplier: r.suggestedSupplier || "Apex Wholesale Direct",
        unitCost: Number(r.unitCost || 10),
        totalEstimatedCost: Number(r.totalEstimatedCost || 200),
        status: r.status || "pending_review",
        simulationImpact: r.simulationImpact || {
          stockoutRiskBefore: 90,
          stockoutRiskAfter: 5,
          estimatedMargin: 58.0,
          weeklyDemandTrend: "+25% surge",
        },
      }));
    }
    return getStoredData(STORAGE_KEYS.RECOMMENDATIONS, initialAIRecommendations);
  },

  async updateRecommendationStatus(
    id: string,
    status: "approved" | "dismissed" | "pending_review"
  ): Promise<AIRecommendation> {
    if (API_BASE_URL) {
      return await fetchJson<AIRecommendation>(`${API_BASE_URL}/ai-recommendations/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    }
    const current = getStoredData(STORAGE_KEYS.RECOMMENDATIONS, initialAIRecommendations);
    const updated = current.map((r) => (r.id === id ? { ...r, status } : r));
    setStoredData(STORAGE_KEYS.RECOMMENDATIONS, updated);
    const found = updated.find((r) => r.id === id);
    if (!found) throw new Error("Recommendation not found");
    return found;
  },

  // --- BUDGET API ---
  async getBudget(): Promise<BudgetConfig> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/budget`);
      return {
        monthlyBudget: Number(res.monthlyBudget ?? 5000),
        spentThisMonth: Number(res.spentThisMonth ?? res.spentAmount ?? 0),
        allocatedPending: Number(res.allocatedPending ?? res.allocatedAmount ?? 0),
      };
    }
    return getStoredData(STORAGE_KEYS.BUDGET, initialBudget);
  },

  async updateBudget(updates: Partial<BudgetConfig>): Promise<BudgetConfig> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return {
        monthlyBudget: Number(res.monthlyBudget ?? 5000),
        spentThisMonth: Number(res.spentThisMonth ?? res.spentAmount ?? 0),
        allocatedPending: Number(res.allocatedPending ?? res.allocatedAmount ?? 0),
      };
    }
    const current = getStoredData(STORAGE_KEYS.BUDGET, initialBudget);
    const updated = { ...current, ...updates };
    setStoredData(STORAGE_KEYS.BUDGET, updated);
    return updated;
  },

  // --- PAYMENTS & PAYPAL SANDBOX API ---
  async getPayments(): Promise<PaymentRecord[]> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/paypal/payments`);
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      return list.map((p: any, idx: number) => ({
        id: p.id || `pay-${idx}`,
        orderId: p.paypalOrderId || p.orderId || `ORD-${p.id || idx}`,
        planTitle: p.planTitle || (p.purchasePlanId ? `Restock Plan (${p.purchasePlanId})` : "Restock Order"),
        supplierName: p.supplierName || "Consolidated Supplier Network",
        amount: Number(p.amount ?? 0),
        currency: p.currency || "USD",
        date: p.createdAt ? (p.createdAt.includes('T') ? p.createdAt.replace('T', ' ').substring(0, 16) : p.createdAt) : (p.date || "2026-11-07 12:00"),
        method: p.paymentMethod || p.method || "PayPal Sandbox",
        status: (p.verifiedStatus || p.status || "completed").toLowerCase(),
        paypalTransactionId: p.paypalCaptureId || p.paypalTransactionId || `CAP-${p.id || idx}`,
        invoiceNumber: p.invoiceNumber || `INV-SW-${10000 + idx}`,
        itemSummary: p.itemSummary || `${p.purchasePlanId || 'Restock'} - Electronics Batch`,
      }));
    }
    return getStoredData(STORAGE_KEYS.PAYMENTS, initialPayments);
  },

  async createPayPalOrder(orderPayload: {
    planId: string;
    amount: number;
    currency: string;
    items: { name: string; quantity: number; unitPrice: number }[];
  }): Promise<{
    orderId: string;
    approvalUrl: string;
    status: string;
    amount: number;
    currency: string;
    isMock?: boolean;
  }> {
    if (API_BASE_URL) {
      return fetchJson<{
        orderId: string;
        approvalUrl: string;
        status: string;
        amount: number;
        currency: string;
        isMock?: boolean;
      }>(`${API_BASE_URL}/paypal/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: orderPayload.planId }),
      });
    }
    throw new Error("PayPal backend is not configured. Set NEXT_PUBLIC_API_URL before starting checkout.");
  },

  async capturePayPalOrder(capturePayload: {
    orderId: string;
    planTitle: string;
    supplierName: string;
    amount: number;
    currency: string;
    itemSummary: string;
  }): Promise<PaymentRecord> {
    if (API_BASE_URL) {
      const res = await fetchJson<any>(`${API_BASE_URL}/paypal/orders/${capturePayload.orderId}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      return {
        id: res.id || `pay-${Date.now()}`,
        orderId: res.orderId || capturePayload.orderId,
        planTitle: capturePayload.planTitle,
        supplierName: capturePayload.supplierName,
        amount: Number(res.amount ?? capturePayload.amount),
        currency: capturePayload.currency,
        date: new Date().toISOString().replace("T", " ").substring(0, 16),
        method: res.isMock ? "Dev Simulator" : "PayPal Sandbox",
        status: (res.status || "completed").toLowerCase(),
        paypalTransactionId: res.captureId || `CAP-${Date.now()}`,
        invoiceNumber: `INV-SW-${Math.floor(10000 + Math.random() * 90000)}`,
        itemSummary: capturePayload.itemSummary,
      };
    }

    throw new Error("PayPal backend is not configured. Payment capture cannot be simulated from the browser.");
  },

  resetToDefaults(): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(initialInventory));
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(initialSuppliers));
    localStorage.setItem(STORAGE_KEYS.PLANS, JSON.stringify(initialPurchasePlans));
    localStorage.setItem(STORAGE_KEYS.RECOMMENDATIONS, JSON.stringify(initialAIRecommendations));
    localStorage.setItem(STORAGE_KEYS.PAYMENTS, JSON.stringify(initialPayments));
    localStorage.setItem(STORAGE_KEYS.BUDGET, JSON.stringify(initialBudget));
  },
};
