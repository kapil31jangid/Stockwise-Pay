export interface ProductRecord {
  sku: string;
  name: string;
  category: string;
  currentStock: number;
  safetyStock: number;
  unitCost: number;
  sellingPrice: number;
  salesHistory: number[];
  preferredVendorId?: string;
  updatedAt: string;
}

export interface SupplierRecord {
  id: string;
  name: string;
  contactEmail: string;
  contactPhone: string;
  location: string;
  estimatedLeadTimeDays: number;
  reliabilityScore: number;
  paymentTerms: string;
  specialties: string[];
  createdAt: string;
}

export interface SupplierOfferRecord {
  id: string;
  sku: string;
  supplierId: string;
  unitPrice: number;
  shippingCost: number;
  moq: number;
  leadTimeDays: number;
  bulkDiscountNote?: string;
  quoteCurrency: string;
}

export interface PurchasePlanRecord {
  id: string;
  name: string;
  purchasingBudget: number;
  calculatedTotal: number;
  currentVersion: number;
  planStatus: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  selectedItems: any[];
  deferredItems: any[];
  scenarioMode: 'balanced' | 'aggressive' | 'conservative';
  createdByUserId?: string; // Track plan creator for resource-level authorization
  createdAt: string;
  updatedAt: string;
}

export interface PlanVersionRecord {
  id: string;
  planId: string;
  versionNumber: number;
  budget: number;
  calculatedTotal: number;
  itemsSnapshot: any[];
  deferredSnapshot: any[];
  changeReason?: string;
  createdAt: string;
}

export interface ApprovalRecord {
  id: string;
  purchasePlanId: string;
  approvedVersion: number;
  approverName: string;
  approverRole: string;
  status: 'approved' | 'rejected' | 'invalidated';
  decisionNotes?: string;
  timestamp: string;
}

export interface PaymentRecord {
  id: string;
  purchasePlanId: string;
  planVersion: number;
  paypalOrderId: string;
  paypalCaptureId?: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  verifiedStatus: 'CREATED' | 'APPROVED' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  payerEmail?: string;
  rawPaypalResponse?: any;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  previousStatus?: string;
  newStatus?: string;
  details?: any;
  createdAt: string;
}

export interface BudgetConfigRecord {
  id: string;
  monthlyBudget: number;
  spentAmount: number;
  allocatedAmount: number;
  updatedAt: string;
}

export const SEED_PRODUCTS: ProductRecord[] = [
  {
    sku: 'HP101',
    name: 'Wireless Noise-Canceling Headphones',
    category: 'Audio',
    currentStock: 14,
    safetyStock: 25,
    unitCost: 14.50,
    sellingPrice: 39.99,
    salesHistory: [2, 3, 2, 4, 3, 2, 5, 3, 4, 2, 3, 4, 3, 4],
    preferredVendorId: 'SUP001',
    updatedAt: new Date().toISOString()
  },
  {
    sku: 'KB201',
    name: 'RGB Mechanical Gaming Keyboard',
    category: 'Peripherals',
    currentStock: 15,
    safetyStock: 30,
    unitCost: 22.00,
    sellingPrice: 59.99,
    salesHistory: [3, 4, 3, 5, 4, 3, 6, 4, 5, 4, 3, 5, 4, 6],
    preferredVendorId: 'SUP002',
    updatedAt: new Date().toISOString()
  },
  {
    sku: 'CB301',
    name: 'Braided 100W USB-C to USB-C Cable (2m)',
    category: 'Accessories',
    currentStock: 150,
    safetyStock: 40,
    unitCost: 2.10,
    sellingPrice: 8.99,
    salesHistory: [5, 6, 7, 5, 6, 7, 8, 6, 7, 5, 6, 7, 6, 7],
    preferredVendorId: 'SUP001',
    updatedAt: new Date().toISOString()
  },
  {
    sku: 'MO401',
    name: 'Ergonomic Wireless Optical Mouse',
    category: 'Peripherals',
    currentStock: 8,
    safetyStock: 20,
    unitCost: 8.40,
    sellingPrice: 24.99,
    salesHistory: [2, 3, 2, 3, 4, 3, 3, 2, 3, 4, 3, 2, 4, 3],
    preferredVendorId: 'SUP003',
    updatedAt: new Date().toISOString()
  },
  {
    sku: 'PB501',
    name: '20,000mAh Fast-Charging Power Bank',
    category: 'Accessories',
    currentStock: 5,
    safetyStock: 18,
    unitCost: 12.80,
    sellingPrice: 34.99,
    salesHistory: [3, 2, 3, 4, 3, 3, 4, 3, 4, 3, 2, 4, 3, 4],
    preferredVendorId: 'SUP002',
    updatedAt: new Date().toISOString()
  },
  {
    sku: 'SSD601',
    name: '1TB NVMe M.2 High-Speed SSD',
    category: 'Components',
    currentStock: 6,
    safetyStock: 15,
    unitCost: 48.00,
    sellingPrice: 89.99,
    salesHistory: [1, 2, 1, 2, 2, 1, 3, 2, 2, 1, 2, 3, 2, 2],
    preferredVendorId: 'SUP004',
    updatedAt: new Date().toISOString()
  }
];

export const SEED_SUPPLIERS: SupplierRecord[] = [
  {
    id: 'SUP001',
    name: 'VoltCore Distribution',
    contactEmail: 'orders@voltcore.dist',
    contactPhone: '+1-555-019-2831',
    location: 'Chicago, IL (US Domestic)',
    estimatedLeadTimeDays: 2,
    reliabilityScore: 98.6,
    paymentTerms: 'Net 30 / PayPal',
    specialties: ['Audio', 'Fast Domestic Delivery', 'Accessories'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'SUP002',
    name: 'Apex Electronics Wholesale',
    contactEmail: 'sales@apexwholesale.com',
    contactPhone: '+1-555-014-9922',
    location: 'Dallas, TX (US Domestic)',
    estimatedLeadTimeDays: 3,
    reliabilityScore: 99.2,
    paymentTerms: 'Immediate PayPal / Net 15',
    specialties: ['Peripherals', 'High Reliability', 'Tier-1 Certified'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'SUP003',
    name: 'Shenzhen Precision Micro Ltd',
    contactEmail: 'export@shenzhenmicro.cn',
    contactPhone: '+86-755-8392-1002',
    location: 'Shenzhen, Guangdong (Direct Factory)',
    estimatedLeadTimeDays: 8,
    reliabilityScore: 96.8,
    paymentTerms: 'PayPal Goods & Services',
    specialties: ['Lowest Factory Cost', 'Bulk Micro-components'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'SUP004',
    name: 'SiliconWave Global Components',
    contactEmail: 'procure@siliconwave.io',
    contactPhone: '+1-555-017-4820',
    location: 'San Jose, CA',
    estimatedLeadTimeDays: 4,
    reliabilityScore: 97.5,
    paymentTerms: 'Net 30 / PayPal Sandbox',
    specialties: ['Storage', 'Memory', 'Components'],
    createdAt: new Date().toISOString()
  }
];

export const SEED_OFFERS: SupplierOfferRecord[] = [
  { id: 'OFF001', sku: 'HP101', supplierId: 'SUP001', unitPrice: 15.20, shippingCost: 15.00, moq: 10, leadTimeDays: 2, bulkDiscountNote: '5% off > 50 units', quoteCurrency: 'USD' },
  { id: 'OFF002', sku: 'HP101', supplierId: 'SUP002', unitPrice: 16.00, shippingCost: 10.00, moq: 15, leadTimeDays: 3, bulkDiscountNote: 'Free shipping on orders > $300', quoteCurrency: 'USD' },
  { id: 'OFF003', sku: 'HP101', supplierId: 'SUP003', unitPrice: 12.80, shippingCost: 35.00, moq: 25, leadTimeDays: 8, bulkDiscountNote: '10% factory rebate > 100 units', quoteCurrency: 'USD' },

  { id: 'OFF004', sku: 'KB201', supplierId: 'SUP001', unitPrice: 24.00, shippingCost: 20.00, moq: 5, leadTimeDays: 2, bulkDiscountNote: '3% discount > 20 units', quoteCurrency: 'USD' },
  { id: 'OFF005', sku: 'KB201', supplierId: 'SUP002', unitPrice: 22.00, shippingCost: 15.00, moq: 10, leadTimeDays: 3, bulkDiscountNote: 'Preferred partner volume pricing', quoteCurrency: 'USD' },
  { id: 'OFF006', sku: 'KB201', supplierId: 'SUP003', unitPrice: 18.50, shippingCost: 40.00, moq: 20, leadTimeDays: 9, bulkDiscountNote: 'Wholesale factory direct', quoteCurrency: 'USD' },

  { id: 'OFF007', sku: 'CB301', supplierId: 'SUP001', unitPrice: 2.10, shippingCost: 5.00, moq: 50, leadTimeDays: 2, quoteCurrency: 'USD' },
  { id: 'OFF008', sku: 'CB301', supplierId: 'SUP002', unitPrice: 2.30, shippingCost: 0.00, moq: 30, leadTimeDays: 3, quoteCurrency: 'USD' },
  { id: 'OFF009', sku: 'CB301', supplierId: 'SUP003', unitPrice: 1.40, shippingCost: 25.00, moq: 100, leadTimeDays: 8, quoteCurrency: 'USD' },

  { id: 'OFF010', sku: 'MO401', supplierId: 'SUP001', unitPrice: 9.10, shippingCost: 12.00, moq: 10, leadTimeDays: 2, quoteCurrency: 'USD' },
  { id: 'OFF011', sku: 'MO401', supplierId: 'SUP002', unitPrice: 8.40, shippingCost: 10.00, moq: 15, leadTimeDays: 3, quoteCurrency: 'USD' },

  { id: 'OFF012', sku: 'PB501', supplierId: 'SUP002', unitPrice: 12.80, shippingCost: 15.00, moq: 10, leadTimeDays: 3, quoteCurrency: 'USD' },
  { id: 'OFF013', sku: 'PB501', supplierId: 'SUP003', unitPrice: 10.20, shippingCost: 30.00, moq: 25, leadTimeDays: 8, quoteCurrency: 'USD' },

  { id: 'OFF014', sku: 'SSD601', supplierId: 'SUP004', unitPrice: 48.00, shippingCost: 15.00, moq: 5, leadTimeDays: 4, quoteCurrency: 'USD' }
];

export const INITIAL_BUDGET: BudgetConfigRecord = {
  id: 'default',
  monthlyBudget: 5000.00,
  spentAmount: 1200.00,
  allocatedAmount: 1850.00,
  updatedAt: new Date().toISOString()
};

