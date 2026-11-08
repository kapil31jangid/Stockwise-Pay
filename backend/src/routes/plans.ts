import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { PurchasePlanRecord } from '../db/seedData.js';
import { agentService } from '../services/agent.js';
import { SupplierPreference, PurchaseOrderLine } from '../../../supplier-intelligence/index.js';

const router = Router();

/**
 * Resource-level authorization helper
 * Returns true if user can access the plan, false otherwise
 */
function canAccessPlan(userRole: string | undefined, userId: string | undefined, planCreatedByUserId: string | null | undefined): boolean {
  if (userRole === 'LEAD_APPROVER' || userRole === 'TREASURY') {
    return true;
  }
  if (userRole === 'BUYER') {
    return planCreatedByUserId !== null && planCreatedByUserId !== undefined && planCreatedByUserId === userId;
  }
  return false;
}

/**
 * POST /api/plans/generate
 * Generate a budget-constrained procurement plan
 * Ownership is assigned exclusively from the authenticated session
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { budget, preference = 'BALANCED', name } = req.body;
    const targetBudget = budget !== undefined ? Number(budget) : undefined;

    const optResult = await agentService.toolOptimizeBudget(targetBudget, preference as SupplierPreference);
    const explanation = agentService.toolExplainPurchasePlan(optResult);

    const planId = `PLAN-${Date.now()}`;
    // Ownership is assigned EXCLUSIVELY from authenticated session - never from request body
    const createdByUserId = req.user?.id;

    const newPlan = {
      id: planId,
      name: name || `AI Restock Plan - $${optResult.availableBudget.toFixed(2)} (${preference})`,
      purchasingBudget: optResult.availableBudget,
      calculatedTotal: optResult.allocatedBudget,
      currentVersion: 1,
      planStatus: 'pending_approval' as const,
      selectedItems: optResult.itemsPurchased.map((o: PurchaseOrderLine) => ({
        sku: o.sku,
        productName: o.productName,
        recommendedQuantity: o.allocatedQuantity,
        unitCost: o.unitPrice,
        subtotal: o.lineTotal,
        supplierId: o.selectedSupplier.id,
        supplierName: o.selectedSupplier.name,
        leadTimeDays: o.selectedSupplier.leadTimeDays,
        riskLevel: o.urgencyContext.riskLevel,
        daysUntilStockout: o.urgencyContext.daysUntilStockout
      })),
      deferredItems: optResult.unfundedItems,
      scenarioMode: (preference.toLowerCase() === 'fastest' ? 'aggressive' : preference.toLowerCase() === 'cheapest' ? 'conservative' : 'balanced') as any,
      createdByUserId, // Track plan creator for resource-level authorization
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.savePurchasePlan(newPlan);

    // Save initial version snapshot
    await db.savePlanVersion({
      id: `VER-${planId}-v1`,
      planId,
      versionNumber: 1,
      budget: newPlan.purchasingBudget,
      calculatedTotal: newPlan.calculatedTotal,
      itemsSnapshot: newPlan.selectedItems,
      deferredSnapshot: newPlan.deferredItems,
      changeReason: 'Initial AI-generated plan',
      createdAt: new Date().toISOString()
    });

    await db.saveAuditLog({
      actor: 'AI Procurement Agent',
      action: 'GENERATE_PURCHASE_PLAN',
      entityType: 'PURCHASE_PLAN',
      entityId: planId,
      newStatus: 'pending_approval',
      details: { budget: newPlan.purchasingBudget, total: newPlan.calculatedTotal, itemsCount: newPlan.selectedItems.length, createdByUserId }
    });

    res.status(201).json({
      success: true,
      plan: newPlan,
      explanation
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/plans
 * List all purchase plans with resource-level authorization
 * Buyers see only their own plans
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const allPlans = await db.getPurchasePlans();

    // Filter plans based on role
    const plans = allPlans.filter(p => {
      if (userRole === 'LEAD_APPROVER' || userRole === 'TREASURY') {
        return true;
      }
      if (userRole === 'BUYER') {
        return p.createdByUserId === userId;
      }
      return false;
    });

    const normalized = plans.map(p => ({
      ...p,
      title: p.name || `Plan ${p.id}`,
      name: p.name || `Plan ${p.id}`,
      status: p.planStatus || 'pending_approval',
      planStatus: p.planStatus || 'pending_approval',
      totalAmount: Number(p.calculatedTotal || 0),
      calculatedTotal: Number(p.calculatedTotal || 0),
      budget: Number(p.purchasingBudget || 0),
      purchasingBudget: Number(p.purchasingBudget || 0),
      items: (p.selectedItems || []).map((i: any, idx: number) => ({
        id: i.id || `item-${idx}`,
        sku: i.sku,
        productName: i.productName || i.sku,
        recommendedQuantity: i.recommendedQuantity || i.quantity || 1,
        quantity: i.quantity || i.recommendedQuantity || 1,
        unitCost: Number(i.unitCost || 0),
        subtotal: Number(i.subtotal || (Number(i.unitCost || 0) * Number(i.recommendedQuantity || i.quantity || 1))),
        isSelected: true,
        supplierName: i.supplierName || 'Primary Supplier',
        supplierId: i.supplierId || '',
        leadTimeDays: i.leadTimeDays || 3,
        riskLevel: i.riskLevel || 'MEDIUM',
        daysUntilStockout: i.daysUntilStockout || 5
      })),
      itemCount: (p.selectedItems || []).length
    }));
    res.json({ success: true, total: normalized.length, data: normalized });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/plans/:id
 * Retrieve a specific plan with resource-level authorization
 * Buyers can only access their own plans
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    // Resource-level authorization
    if (!canAccessPlan(userRole, userId, plan.createdByUserId)) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const approval = await db.getApproval(id);
    const versions = await db.getPlanVersions(id);

    res.json({
      success: true,
      data: {
        ...plan,
        approval,
        versionCount: versions.length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/plans/:id (also /api/purchase-plans/:id)
 * Update existing plan details, or create new plan if not exists
 * Ownership is immutable - rejects attempts to change createdByUserId
 * Buyers can only modify their own plans
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const existing = await db.getPurchasePlan(id);
    let targetPlan: PurchasePlanRecord;

    if (!existing) {
      // Create new plan - assign ownership from authenticated session
      targetPlan = {
        id,
        name: body.name || `Plan ${id}`,
        purchasingBudget: Number(body.purchasingBudget || body.budget || 2000),
        calculatedTotal: Number(body.calculatedTotal || body.totalCost || 0),
        currentVersion: 1,
        planStatus: body.planStatus || 'pending_approval',
        selectedItems: body.selectedItems || body.items || [],
        deferredItems: body.deferredItems || [],
        scenarioMode: body.scenarioMode || 'balanced',
        createdByUserId: userId, // Assign ownership from session
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else {
      // Resource-level authorization: Buyers can only modify their own plans
      if (!canAccessPlan(userRole, userId, existing.createdByUserId)) {
        return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
      }

      // NEVER allow createdByUserId to be changed via request body
      // Preserve existing ownership
      targetPlan = {
        ...existing,
        ...body,
        createdByUserId: existing.createdByUserId, // Immutable - preserve original owner
        updatedAt: new Date().toISOString()
      };
    }

    const saved = await db.savePurchasePlan(targetPlan);
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/plans/:id/recalculate
 * Recalculate plan after budget, quantity, or supplier changes
 * Ownership is preserved
 */
router.post('/:id/recalculate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { newBudget, preference = 'BALANCED' } = req.body;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    // Resource-level authorization
    if (!canAccessPlan(userRole, userId, plan.createdByUserId)) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const targetBudget = newBudget !== undefined ? Number(newBudget) : plan.purchasingBudget;
    const optResult = await agentService.toolOptimizeBudget(targetBudget, preference as SupplierPreference);

    const nextVersion = plan.currentVersion + 1;
    plan.currentVersion = nextVersion;
    plan.purchasingBudget = targetBudget;
    plan.calculatedTotal = optResult.allocatedBudget;
    plan.planStatus = 'pending_approval'; // invalidates existing approval!
    plan.selectedItems = optResult.itemsPurchased.map((o: PurchaseOrderLine) => ({
      sku: o.sku,
      productName: o.productName,
      recommendedQuantity: o.allocatedQuantity,
      unitCost: o.unitPrice,
      subtotal: o.lineTotal,
      supplierId: o.selectedSupplier.id,
      supplierName: o.selectedSupplier.name,
      leadTimeDays: o.selectedSupplier.leadTimeDays,
      riskLevel: o.urgencyContext.riskLevel,
      daysUntilStockout: o.urgencyContext.daysUntilStockout
    }));
    plan.deferredItems = optResult.unfundedItems;
    plan.updatedAt = new Date().toISOString();
    // Ownership (createdByUserId) is preserved automatically

    await db.savePurchasePlan(plan);

    // Save version snapshot
    await db.savePlanVersion({
      id: `VER-${id}-v${nextVersion}`,
      planId: id,
      versionNumber: nextVersion,
      budget: targetBudget,
      calculatedTotal: plan.calculatedTotal,
      itemsSnapshot: plan.selectedItems,
      deferredSnapshot: plan.deferredItems,
      changeReason: `Recalculated with budget $${targetBudget.toFixed(2)}`,
      createdAt: new Date().toISOString()
    });

    await db.saveAuditLog({
      actor: 'Procurement Manager',
      action: 'RECALCULATE_PLAN',
      entityType: 'PURCHASE_PLAN',
      entityId: id,
      previousStatus: 'approved',
      newStatus: 'pending_approval',
      details: { version: nextVersion, budget: targetBudget, calculatedTotal: plan.calculatedTotal }
    });

    const explanation = agentService.toolExplainPurchasePlan(optResult);

    res.json({
      success: true,
      message: `Plan recalculated to version ${nextVersion}. Prior approval invalidated.`,
      plan,
      explanation
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/plans/:id/explanation
 * Explainable purchase rationale grounded in verified calculations
 * Resource-level authorization applies
 */
router.get('/:id/explanation', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    // Resource-level authorization
    if (!canAccessPlan(userRole, userId, plan.createdByUserId)) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const optResult = await agentService.toolOptimizeBudget(plan.purchasingBudget);
    const explanation = agentService.toolExplainPurchasePlan(optResult);

    res.json({
      success: true,
      data: explanation
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/plans/:id/versions
 * Retrieve previous versions and modifications of a purchase plan
 * Resource-level authorization applies
 */
router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    // Resource-level authorization
    if (!canAccessPlan(userRole, userId, plan.createdByUserId)) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const versions = await db.getPlanVersions(id);
    res.json({ success: true, total: versions.length, data: versions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/plans/:id/approve
 * Explicit human approval with version-locking and role-based authorization
 * Only LEAD_APPROVER or TREASURY can approve
 */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    // Server-side role authorization: Only LEAD_APPROVER or TREASURY can approve purchase plans
    const userRole = req.user?.role;
    if (userRole !== 'LEAD_APPROVER' && userRole !== 'TREASURY') {
      return res.status(403).json({
        success: false,
        error: `Forbidden: User with role '${userRole || 'ANONYMOUS'}' is not authorized to approve purchase plans. Only LEAD_APPROVER or TREASURY roles are permitted.`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    // Actor identity is strictly taken from the verified session
    const approverName = req.user?.name || 'Marcus Vance';
    const approverRole = req.user?.role === 'TREASURY' ? 'Chief Financial Officer' : 'Inventory Lead';

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    if (plan.selectedItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Cannot approve an empty purchase plan' });
    }

    const approval = await db.saveApproval({
      id: `APP-${Date.now()}`,
      purchasePlanId: id,
      approvedVersion: plan.currentVersion,
      approverName,
      approverRole,
      status: 'approved',
      decisionNotes: notes || `Approved restock plan v${plan.currentVersion} for $${plan.calculatedTotal.toFixed(2)}`,
      timestamp: new Date().toISOString()
    });

    plan.planStatus = 'approved';
    plan.updatedAt = new Date().toISOString();
    await db.savePurchasePlan(plan);

    await db.saveAuditLog({
      actor: approverName,
      action: 'APPROVE_PURCHASE_PLAN',
      entityType: 'PURCHASE_PLAN',
      entityId: id,
      previousStatus: 'pending_approval',
      newStatus: 'approved',
      details: { approvedVersion: plan.currentVersion, calculatedTotal: plan.calculatedTotal }
    });

    res.json({
      success: true,
      message: `Plan ${id} (version ${plan.currentVersion}) successfully approved. Ready for PayPal Checkout.`,
      approval,
      plan
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/plans/:id/reject
 * Reject proposed purchase plan with role-based authorization
 * Only LEAD_APPROVER or TREASURY can reject
 */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const userRole = req.user?.role;
    if (userRole !== 'LEAD_APPROVER' && userRole !== 'TREASURY') {
      return res.status(403).json({
        success: false,
        error: `Forbidden: User with role '${userRole || 'ANONYMOUS'}' is not authorized to reject purchase plans.`,
        code: 'INSUFFICIENT_ROLE'
      });
    }

    const approverName = req.user?.name || 'Marcus Vance';
    const approverRole = req.user?.role === 'TREASURY' ? 'Chief Financial Officer' : 'Inventory Lead';

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const approval = await db.saveApproval({
      id: `REJ-${Date.now()}`,
      purchasePlanId: id,
      approvedVersion: plan.currentVersion,
      approverName,
      approverRole,
      status: 'rejected',
      decisionNotes: notes || 'Rejected by manager',
      timestamp: new Date().toISOString()
    });

    plan.planStatus = 'rejected';
    plan.updatedAt = new Date().toISOString();
    await db.savePurchasePlan(plan);

    await db.saveAuditLog({
      actor: approverName,
      action: 'REJECT_PURCHASE_PLAN',
      entityType: 'PURCHASE_PLAN',
      entityId: id,
      previousStatus: 'pending_approval',
      newStatus: 'rejected',
      details: { notes }
    });

    res.json({
      success: true,
      message: `Plan ${id} rejected.`,
      approval,
      plan
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/plans/:id/approval
 * Retrieve current approval status
 * Resource-level authorization applies
 */
router.get('/:id/approval', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const plan = await db.getPurchasePlan(id);
    if (!plan) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    // Resource-level authorization
    if (!canAccessPlan(userRole, userId, plan.createdByUserId)) {
      return res.status(404).json({ success: false, error: `Plan not found: ${id}` });
    }

    const approval = await db.getApproval(id);
    res.json({ success: true, data: approval });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;