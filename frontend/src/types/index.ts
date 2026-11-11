export type StockStatus = "in_stock" | "low_stock" | "critical" | "out_of_stock";

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: "Chargers & Cables" | "Audio" | "Power & Batteries" | "Wearables" | "Accessories" | "Storage";
  currentStock: number;
  reorderPoint: number;
  targetStock: number;
  unitCost: number;
  retailPrice: number;
  salesVelocityPerWeek: number;
  supplierId: string;
  supplierName: string;
  status: StockStatus;
  lastRestocked: string;
}

export interface SupplierOffer {
  productId: string;
  sku?: string;
  unitPrice: number;
  moq: number;
  leadTimeDays: number;
  bulkDiscount?: string;
}

export interface Supplier {
  id: string;
  name: string;
  rating: number;
  leadTimeDays: number;
  moq: number;
  paymentTerms: string;
  location: string;
  reliability: number;
  contactEmail: string;
  contactPhone: string;
  categorySpecialties: string[];
  offers: SupplierOffer[];
}

export interface PurchasePlanItem {
  id?: string;
  productId: string;
  productName: string;
  sku: string;
  category?: string;
  currentStock: number;
  recommendedQty: number;
  recommendedQuantity?: number;
  selectedQty: number;
  quantity?: number;
  unitCost: number;
  supplierId?: string;
  selectedSupplierId?: string;
  supplierName?: string;
  selectedSupplierName?: string;
  leadTimeDays?: number;
  subtotal: number;
  isSelected?: boolean;
  riskLevel?: string;
  daysUntilStockout?: number;
}

export interface PurchasePlan {
  id: string;
  title: string;
  createdAt: string;
  totalAmount: number;
  itemCount: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "paid" | "shipped";
  budget: number;
  items: PurchasePlanItem[];
  notes?: string;
  approvalNotes?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface AIRecommendation {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  action: "URGENT_RESTOCK" | "PREDICTIVE_ORDER" | "SUPPLIER_SWITCH" | "BULK_SAVING";
  urgency: "critical" | "high" | "medium" | "low";
  explanation: string;
  metricHighlights: {
    label: string;
    value: string;
    positive?: boolean;
  }[];
  recommendedQty: number;
  projectedRunoutDays: number;
  costSavings: number;
  suggestedSupplier: string;
  unitCost: number;
  totalEstimatedCost: number;
  status: "pending_review" | "approved" | "dismissed";
  simulationImpact: {
    stockoutRiskBefore: number;
    stockoutRiskAfter: number;
    estimatedMargin: number;
    weeklyDemandTrend: string;
  };
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  planTitle: string;
  supplierName: string;
  amount: number;
  currency: string;
  date: string;
  method: "PayPal Sandbox" | "PayPal Pay in 4" | "PayPal Business" | "Dev Simulator";
  status: "completed" | "processing" | "pending_capture" | "refunded";
  paypalTransactionId: string;
  invoiceNumber: string;
  itemSummary: string;
}

export interface BudgetConfig {
  monthlyBudget: number;
  spentThisMonth: number;
  allocatedPending: number;
}

