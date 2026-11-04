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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Storage Keys for persistent mock state
const STORAGE_KEYS = {
  INVENTORY: "stockwise_inventory_v1",
  SUPPLIERS: "stockwise_suppliers_v1",
  PLANS: "stockwise_plans_v1",
  RECOMMENDATIONS: "stockwise_recs_v1",
  PAYMENTS: "stockwise_payments_v1",
  BUDGET: "stockwise_budget_v1",
};

function getStoredData<T>(key: string, fallback: T): T {
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
      const res = await fetch(`${API_BASE_URL}/inventory`);
      if (!res.ok) throw new Error("Failed to fetch inventory from server");
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
  },

  async addInventoryItem(item: Omit<InventoryItem, "id">): Promise<InventoryItem> {
    const newItem: InventoryItem = {
      ...item,
      id: `item-${Date.now()}`,
    };
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/inventory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      return res.json();
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
      const res = await fetch(`${API_BASE_URL}/inventory/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItems),
      });
      return res.json();
    }
    const current = getStoredData(STORAGE_KEYS.INVENTORY, initialInventory);
    const updated = [...newItems, ...current];
    setStoredData(STORAGE_KEYS.INVENTORY, updated);
    return updated;
  },

  async updateInventoryItem(id: string, updates: Partial<InventoryItem>): Promise<InventoryItem> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return res.json();
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
      const res = await fetch(`${API_BASE_URL}/suppliers`);
      if (!res.ok) throw new Error("Failed to fetch suppliers");
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.SUPPLIERS, initialSuppliers);
  },

  // --- PURCHASE PLANNER API ---
  async getPurchasePlans(): Promise<PurchasePlan[]> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/purchase-plans`);
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.PLANS, initialPurchasePlans);
  },

  async savePurchasePlan(plan: PurchasePlan): Promise<PurchasePlan> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/purchase-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plan),
      });
      return res.json();
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

  // --- AI RECOMMENDATIONS API ---
  async getAIRecommendations(): Promise<AIRecommendation[]> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/ai-recommendations`);
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.RECOMMENDATIONS, initialAIRecommendations);
  },

  async updateRecommendationStatus(
    id: string,
    status: "approved" | "dismissed" | "pending_review"
  ): Promise<AIRecommendation> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/ai-recommendations/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      return res.json();
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
      const res = await fetch(`${API_BASE_URL}/budget`);
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.BUDGET, initialBudget);
  },

  async updateBudget(updates: Partial<BudgetConfig>): Promise<BudgetConfig> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/budget`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return res.json();
    }
    const current = getStoredData(STORAGE_KEYS.BUDGET, initialBudget);
    const updated = { ...current, ...updates };
    setStoredData(STORAGE_KEYS.BUDGET, updated);
    return updated;
  },

  // --- PAYMENTS & PAYPAL SANDBOX API ---
  async getPayments(): Promise<PaymentRecord[]> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/payments`);
      return res.json();
    }
    return getStoredData(STORAGE_KEYS.PAYMENTS, initialPayments);
  },

  /**
   * Prepares or creates a PayPal Sandbox Order (Ready for Node.js Express backend integration)
   * Express equivalent: POST /api/paypal/create-order
   */
  async createPayPalOrder(orderPayload: {
    planId: string;
    amount: number;
    currency: string;
    items: { name: string; quantity: number; unitPrice: number }[];
  }): Promise<{ orderId: string; approvalUrl: string; status: string }> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/paypal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload),
      });
      return res.json();
    }
    // Simulation / Sandbox mock readiness response
    return {
      orderId: `PAYPAL-SANDBOX-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
      approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=EC-${Date.now()}`,
      status: "CREATED",
    };
  },

  /**
   * Captures approved PayPal Sandbox Order
   * Express equivalent: POST /api/paypal/capture-order
   */
  async capturePayPalOrder(capturePayload: {
    orderId: string;
    planTitle: string;
    supplierName: string;
    amount: number;
    currency: string;
    itemSummary: string;
  }): Promise<PaymentRecord> {
    if (API_BASE_URL) {
      const res = await fetch(`${API_BASE_URL}/paypal/capture-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capturePayload),
      });
      return res.json();
    }

    const newRecord: PaymentRecord = {
      id: `pay-${Date.now()}`,
      orderId: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      planTitle: capturePayload.planTitle,
      supplierName: capturePayload.supplierName,
      amount: capturePayload.amount,
      currency: capturePayload.currency,
      date: new Date().toISOString().replace("T", " ").substring(0, 16),
      method: "PayPal Sandbox",
      status: "completed",
      paypalTransactionId: `SANDBOX-${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
      invoiceNumber: `INV-SW-${Math.floor(10000 + Math.random() * 90000)}`,
      itemSummary: capturePayload.itemSummary,
    };

    const current = getStoredData(STORAGE_KEYS.PAYMENTS, initialPayments);
    const updated = [newRecord, ...current];
    setStoredData(STORAGE_KEYS.PAYMENTS, updated);

    // Also update budget spent
    const budget = getStoredData(STORAGE_KEYS.BUDGET, initialBudget);
    const updatedBudget: BudgetConfig = {
      ...budget,
      spentThisMonth: budget.spentThisMonth + capturePayload.amount,
      allocatedPending: Math.max(0, budget.allocatedPending - capturePayload.amount),
    };
    setStoredData(STORAGE_KEYS.BUDGET, updatedBudget);

    return newRecord;
  },

  // Reset demo data helper
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

