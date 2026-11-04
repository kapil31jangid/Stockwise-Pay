"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Building2,
  Truck,
  Star,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  ChevronRight,
  TrendingDown,
  MapPin,
  ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/services/api";
import { Supplier, InventoryItem, SupplierOffer } from "@/types";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("item-1");
  const [searchSupplier, setSearchSupplier] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [supData, invData] = await Promise.all([
      api.getSuppliers(),
      api.getInventory(),
    ]);
    setSuppliers(supData);
    setInventory(invData);
  };

  // Find selected product for comparison matrix
  const selectedProduct = inventory.find((p) => p.id === selectedProductId) || inventory[0];

  // Compute offers for the selected product across all suppliers
  const productOffers = suppliers
    .map((sup) => {
      const offer = sup.offers.find((o) => o.productId === selectedProductId);
      if (!offer) return null;
      return {
        supplier: sup,
        offer,
      };
    })
    .filter(Boolean) as { supplier: Supplier; offer: SupplierOffer }[];

  // Find lowest price and fastest lead time
  const lowestPrice = productOffers.length
    ? Math.min(...productOffers.map((o) => o.offer.unitPrice))
    : 0;
  const fastestDelivery = productOffers.length
    ? Math.min(...productOffers.map((o) => o.offer.leadTimeDays))
    : 0;

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchSupplier.toLowerCase()) ||
      s.location.toLowerCase().includes(searchSupplier.toLowerCase()) ||
      s.categorySpecialties.some((c) => c.toLowerCase().includes(searchSupplier.toLowerCase()))
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Suppliers & Live Price Comparison
            </h2>
            <p className="text-xs text-slate-500">
              Benchmark electronics distributor wholesale tiers, delivery lead times, and PayPal terms
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>5 PayPal Verified Vendors</span>
            </span>
          </div>
        </div>

        {/* 3 Overview Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            title="Verified Suppliers"
            value={suppliers.length}
            subtitle="Tier-1 electronics distributors"
            change="100% active"
            isPositive={true}
            icon={Building2}
            iconBgColor="bg-blue-50"
            iconColor="text-blue-600"
          />

          <MetricCard
            title="Fastest Delivery Window"
            value="48 Hours"
            subtitle="Domestic hubs (Chicago / Dallas)"
            badge="Rapid Restock"
            badgeVariant="success"
            icon={Truck}
            iconBgColor="bg-emerald-50"
            iconColor="text-emerald-600"
          />

          <MetricCard
            title="Avg Vendor Reliability"
            value="98.2%"
            subtitle="On-time fulfillment rate"
            change="+0.8% this quarter"
            isPositive={true}
            icon={CheckCircle2}
            iconBgColor="bg-slate-100"
            iconColor="text-slate-800"
          />
        </div>

        {/* FEATURE 1: Interactive Price & Delivery Comparison Matrix */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Cross-Supplier Price & Lead Time Benchmark
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Select an electronics product to analyze wholesale rates, minimums, and shipping speed
              </p>
            </div>

            {/* Product Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Compare Product:
              </span>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-2xs max-w-xs"
              >
                {inventory.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.sku})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Comparison Details */}
          {selectedProduct && (
            <div className="p-4 bg-blue-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-800 text-sm">{selectedProduct.name}</span>
                <span className="font-mono text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {selectedProduct.sku}
                </span>
                <Badge variant="navy" size="sm">
                  {selectedProduct.category}
                </Badge>
              </div>

              <div className="flex items-center gap-4 text-slate-600">
                <span>
                  Store Retail Price: <strong>${selectedProduct.retailPrice.toFixed(2)}</strong>
                </span>
                <span>
                  Current Stock:{" "}
                  <strong
                    className={
                      selectedProduct.currentStock <= selectedProduct.reorderPoint
                        ? "text-rose-600"
                        : "text-slate-800"
                    }
                  >
                    {selectedProduct.currentStock} units
                  </strong>
                </span>
              </div>
            </div>
          )}

          {/* Comparison Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3 px-5">Supplier Name & Depot</th>
                  <th className="py-3 px-4">Wholesale Unit Price</th>
                  <th className="py-3 px-4">Est. Margin @ Retail</th>
                  <th className="py-3 px-4">Delivery Lead Time</th>
                  <th className="py-3 px-4">Minimum Order (MOQ)</th>
                  <th className="py-3 px-4">Bulk Incentive Tier</th>
                  <th className="py-3 px-4">Fulfillment Rating</th>
                  <th className="py-3 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {productOffers.map(({ supplier, offer }) => {
                  const isBestPrice = offer.unitPrice === lowestPrice;
                  const isFastest = offer.leadTimeDays === fastestDelivery;
                  const unitMargin = selectedProduct
                    ? Math.round(
                        ((selectedProduct.retailPrice - offer.unitPrice) /
                          selectedProduct.retailPrice) *
                          100
                      )
                    : 0;

                  return (
                    <tr
                      key={supplier.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isBestPrice ? "bg-emerald-50/30" : ""
                      }`}
                    >
                      {/* Supplier info */}
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{supplier.name}</span>
                          {supplier.rating >= 4.9 && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{supplier.location}</span>
                        </div>
                      </td>

                      {/* Unit Price */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900">
                            ${offer.unitPrice.toFixed(2)}
                          </span>
                          {isBestPrice && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Lowest Price
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Margin */}
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800">{unitMargin}% margin</span>
                      </td>

                      {/* Delivery lead time */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold text-slate-900">
                            {offer.leadTimeDays} days
                          </span>
                          {isFastest && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                              Fastest
                            </span>
                          )}
                        </div>
                      </td>

                      {/* MOQ */}
                      <td className="py-3.5 px-4">
                        <span className="text-slate-700 font-medium">{offer.moq} units</span>
                      </td>

                      {/* Bulk discount */}
                      <td className="py-3.5 px-4">
                        {offer.bulkDiscount ? (
                          <span className="text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                            {offer.bulkDiscount}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Standard</span>
                        )}
                      </td>

                      {/* Reliability */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{supplier.reliability}%</div>
                        <div className="text-[10px] text-slate-400">Score {supplier.rating}/5.0</div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-5 text-right">
                        <Link
                          href={`/planner`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-2xs"
                        >
                          <span>Plan Restock</span>
                          <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {productOffers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      No supplier offers on file for this SKU yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* FEATURE 2: Supplier Directory Grid */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">Verified Electronics Distributors</h3>
              <p className="text-xs text-slate-500">
                Detailed profile, terms, and active catalog breadth
              </p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Filter suppliers by name or city..."
                value={searchSupplier}
                onChange={(e) => setSearchSupplier(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSuppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-all card-hover"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{supplier.name}</h4>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>{supplier.location}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shrink-0">
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      <span>{supplier.rating}</span>
                    </div>
                  </div>

                  {/* Specialties tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {supplier.categorySpecialties.map((cat, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>

                  {/* Key specs */}
                  <div className="space-y-2 text-xs border-t border-slate-100 pt-3 text-slate-600">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Avg Lead Time:</span>
                      <span className="font-semibold text-slate-900">
                        {supplier.leadTimeDays} business days
                      </span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Min Order Qty (MOQ):</span>
                      <span className="font-semibold text-slate-900">{supplier.moq} units</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Payment Terms:</span>
                      <span className="font-semibold text-blue-700">{supplier.paymentTerms}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-slate-400">Reliability Score:</span>
                      <span className="font-semibold text-emerald-600">
                        {supplier.reliability}% fulfillment
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer contact info */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate max-w-[170px]" title={supplier.contactEmail}>
                    {supplier.contactEmail}
                  </span>
                  <Link
                    href="/planner"
                    className="font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                  >
                    <span>Restock</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
