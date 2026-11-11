

# StockWise Pay — Supplier Intelligence & Budget Optimization Module

Authored for **Member 4's** Supplier Comparison, Budget Optimization, and AI Agent responsibilities, consuming **Member 2's** `intelligence/` report outputs without modifying Member 2's code.

---

## 📦 Key Functions

### 1. `compare_suppliers(sku, suppliers, quantity?, preference?)`
Compares wholesale offers across distributors for a specific product SKU.
- Identifies **Lowest Price**, **Fastest Lead Time**, and **Most Reliable Supplier**.
- Computes multi-criteria score weighted by preference (`"CHEAPEST"`, `"FASTEST"`, `"MOST_RELIABLE"`, or `"BALANCED"`).
- Evaluates minimum order quantity (MOQ) compatibility.

### 2. `optimize_budget(inventoryReport, suppliers, availableBudget, options?)`
Deterministic knapsack restocking optimizer driven by Member 2's JSON report.
- **Strict Prioritization**: Prioritizes `HIGH` stockout risk before `MEDIUM`/`LOW`, and sorts by fewest `daysUntilStockout` first.
- **Deterministic Budget Enforcement**: Total allocated spend is mathematically guaranteed to **never exceed `availableBudget`**.
- **Partial Restock Support**: If the remaining budget cannot fund the full recommended quantity, it calculates the maximum units affordable (respecting supplier MOQ).

### 3. `simulate_purchase_plan(historyOrPrevious, newBudget, inventoryReport, suppliers, options?)`
Enables scenario simulation when the store manager changes the available budget cap.
- Immutably preserves previous versions in `history`.
- Computes deterministic deltas from the previous version (`budgetDelta`, `allocatedCostDelta`, `unitsOrderedDelta`, `itemsFundedDelta`).

### 4. `explain_purchase_plan(planOrResult)`
Prepares transparent, auditable structured explanations for store managers reviewing the plan.
- Summarizes total spend, remaining cash capital, and high-risk threats mitigated.
- Emits line-by-line justifications detailing why each supplier was selected and why any items were excluded or partially funded.
- Supplies actionable review checkpoints and warnings.

---

## 🛠️ Usage Example

```typescript
import {
  compare_suppliers,
  optimize_budget,
  simulate_purchase_plan,
  explain_purchase_plan,
  DEMO_SUPPLIERS,
  DEMO_MEMBER2_INVENTORY_REPORT,
} from "./index.js";

// 1. Optimize budget based on Member 2's report
const budgetCap = 500.00;
const plan = optimize_budget(DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS, budgetCap);

console.log("Allocated:", plan.allocatedBudget); // <= $500.00
console.log("Remaining:", plan.remainingBudget);

// 2. Generate Manager Review Explanations
const explanations = explain_purchase_plan(plan);
console.log(explanations.summary.overview);

// 3. Simulate What-If with higher budget
const simulated = simulate_purchase_plan(null, 750.00, DEMO_MEMBER2_INVENTORY_REPORT, DEMO_SUPPLIERS);
console.log("New Version:", simulated.currentVersion);
```

---

## 🧪 Testing

```bash
# Run automated tests
npm test
# Or with tsx
npx tsx --test supplier-intelligence.test.ts

# Type-check
npx tsc --noEmit
```

