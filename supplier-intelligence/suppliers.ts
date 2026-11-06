/**
 * Supplier Intelligence - Comparison Engine
 */

import {
  SupplierData,
  SupplierSkuOffer,
  RankedSupplierOffer,
  SupplierComparisonResult,
  SupplierPreference,
} from "./types.js";

/**
 * Validates a single supplier object and its offers
 */
export function validateSupplierData(supplier: SupplierData): void {
  if (!supplier || typeof supplier !== "object") {
    throw new Error("Invalid supplier: must be an object");
  }
  if (!supplier.id || typeof supplier.id !== "string" || supplier.id.trim() === "") {
    throw new Error("Invalid supplier: id must be a non-empty string");
  }
  if (!supplier.name || typeof supplier.name !== "string" || supplier.name.trim() === "") {
    throw new Error("Invalid supplier: name must be a non-empty string");
  }
  if (
    typeof supplier.reliability !== "number" ||
    !Number.isFinite(supplier.reliability) ||
    supplier.reliability < 0 ||
    supplier.reliability > 100
  ) {
    throw new Error(`Invalid supplier ${supplier.name}: reliability must be a number between 0 and 100`);
  }
  if (!Array.isArray(supplier.offers)) {
    throw new Error(`Invalid supplier ${supplier.name}: offers must be an array`);
  }

  for (const offer of supplier.offers) {
    validateSupplierOffer(offer, supplier.name);
  }
}

/**
 * Validates an individual SKU offer
 */
export function validateSupplierOffer(offer: SupplierSkuOffer, supplierName = "Supplier"): void {
  if (!offer || typeof offer !== "object") {
    throw new Error(`Invalid offer for ${supplierName}: must be an object`);
  }
  if (!offer.sku || typeof offer.sku !== "string" || offer.sku.trim() === "") {
    throw new Error(`Invalid offer for ${supplierName}: sku must be a non-empty string`);
  }
  if (typeof offer.unitPrice !== "number" || !Number.isFinite(offer.unitPrice) || offer.unitPrice <= 0) {
    throw new Error(`Invalid offer for ${supplierName} (SKU: ${offer.sku}): unitPrice must be a positive number`);
  }
  if (
    typeof offer.leadTimeDays !== "number" ||
    !Number.isFinite(offer.leadTimeDays) ||
    offer.leadTimeDays < 0
  ) {
    throw new Error(`Invalid offer for ${supplierName} (SKU: ${offer.sku}): leadTimeDays must be a non-negative number`);
  }
  if (typeof offer.moq !== "number" || !Number.isFinite(offer.moq) || offer.moq < 0) {
    throw new Error(`Invalid offer for ${supplierName} (SKU: ${offer.sku}): moq must be a non-negative number`);
  }
}

/**
 * Compares supplier offers for a specific SKU based on price, delivery time, and reliability
 */
export function compare_suppliers(
  sku: string,
  suppliers: SupplierData[],
  quantity = 1,
  preference: SupplierPreference = "BALANCED"
): SupplierComparisonResult {
  if (!sku || typeof sku !== "string" || sku.trim() === "") {
    throw new Error("SKU must be a non-empty string");
  }
  if (!Array.isArray(suppliers)) {
    throw new Error("Suppliers must be an array");
  }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive number");
  }

  const normalizedSku = sku.trim().toUpperCase();

  // Validate all suppliers
  for (const s of suppliers) {
    validateSupplierData(s);
  }

  // Find all offers matching the target SKU
  const matchedOffers: Array<{ supplier: SupplierData; offer: SupplierSkuOffer }> = [];
  for (const supplier of suppliers) {
    for (const offer of supplier.offers) {
      if (offer.sku.trim().toUpperCase() === normalizedSku) {
        matchedOffers.push({ supplier, offer });
      }
    }
  }

  if (matchedOffers.length === 0) {
    return {
      sku: normalizedSku,
      requestedQuantity: quantity,
      offersCount: 0,
      allOffers: [],
    };
  }

  // Find min and max bounds for normalization
  const minPrice = Math.min(...matchedOffers.map((m) => m.offer.unitPrice));
  const maxPrice = Math.max(...matchedOffers.map((m) => m.offer.unitPrice));
  const minLead = Math.min(...matchedOffers.map((m) => m.offer.leadTimeDays));
  const maxLead = Math.max(...matchedOffers.map((m) => m.offer.leadTimeDays));

  // Determine weights according to preference
  let priceWeight = 0.45;
  let speedWeight = 0.30;
  let relWeight = 0.25;

  if (preference === "CHEAPEST") {
    priceWeight = 0.70;
    speedWeight = 0.15;
    relWeight = 0.15;
  } else if (preference === "FASTEST") {
    priceWeight = 0.20;
    speedWeight = 0.60;
    relWeight = 0.20;
  } else if (preference === "MOST_RELIABLE") {
    priceWeight = 0.20;
    speedWeight = 0.20;
    relWeight = 0.60;
  }

  const rankedOffers: RankedSupplierOffer[] = matchedOffers.map(({ supplier, offer }) => {
    const totalEstimatedCost = Number((offer.unitPrice * quantity).toFixed(2));
    const meetsMoq = quantity >= offer.moq;

    // Price Score: Lower price gives higher score (1.0 = best, 0.0 = worst)
    const priceScore = maxPrice === minPrice ? 1.0 : (maxPrice - offer.unitPrice) / (maxPrice - minPrice);

    // Speed Score: Lower lead time gives higher score
    const speedScore = maxLead === minLead ? 1.0 : (maxLead - offer.leadTimeDays) / (maxLead - minLead);

    // Reliability Score: 0 to 1.0
    const relScore = supplier.reliability / 100.0;

    let compositeScore =
      (priceScore * priceWeight + speedScore * speedWeight + relScore * relWeight) * 100;

    // Small penalty if the order quantity does not satisfy the supplier's MOQ
    if (!meetsMoq) {
      compositeScore = Math.max(0, compositeScore - 15);
    }

    return {
      sku: offer.sku,
      unitPrice: offer.unitPrice,
      leadTimeDays: offer.leadTimeDays,
      moq: offer.moq,
      bulkDiscountNote: offer.bulkDiscountNote,
      supplierId: supplier.id,
      supplierName: supplier.name,
      reliability: supplier.reliability,
      totalEstimatedCost,
      meetsMoq,
      score: Number(compositeScore.toFixed(2)),
    };
  });

  // Sort offers by composite score descending
  rankedOffers.sort((a, b) => b.score - a.score);

  // Identify specific superlative offers
  let bestPriceOffer = rankedOffers[0];
  let fastestDeliveryOffer = rankedOffers[0];
  let mostReliableOffer = rankedOffers[0];

  for (const o of rankedOffers) {
    if (o.unitPrice < bestPriceOffer.unitPrice) {
      bestPriceOffer = o;
    }
    if (o.leadTimeDays < fastestDeliveryOffer.leadTimeDays) {
      fastestDeliveryOffer = o;
    }
    if (o.reliability > mostReliableOffer.reliability) {
      mostReliableOffer = o;
    }
  }

  // Determine top recommended offer based on selected preference
  let recommendedOffer = rankedOffers[0];
  if (preference === "CHEAPEST") {
    recommendedOffer = bestPriceOffer;
  } else if (preference === "FASTEST") {
    recommendedOffer = fastestDeliveryOffer;
  } else if (preference === "MOST_RELIABLE") {
    recommendedOffer = mostReliableOffer;
  }

  return {
    sku: normalizedSku,
    requestedQuantity: quantity,
    offersCount: rankedOffers.length,
    allOffers: rankedOffers,
    bestPriceOffer,
    fastestDeliveryOffer,
    mostReliableOffer,
    recommendedOffer,
  };
}

