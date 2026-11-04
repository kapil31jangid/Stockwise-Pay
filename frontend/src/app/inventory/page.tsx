"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Package,
  Upload,
  Search,
  Plus,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Download,
  X,
  ShoppingCart,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/services/api";
import { InventoryItem, StockStatus } from "@/types";

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"stock-asc" | "stock-desc" | "name" | "margin">("stock-asc");

  // CSV Modal State
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Omit<InventoryItem, "id">[]>([]);
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add Product Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({
    name: "",
    sku: "",
    category: "Chargers & Cables",
    currentStock: 20,
    reorderPoint: 15,
    targetStock: 50,
    unitCost: 10,
    retailPrice: 25,
    salesVelocityPerWeek: 10,
    supplierName: "Apex Wholesale Direct",
    supplierId: "sup-1",
  });

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    const data = await api.getInventory();
    setItems(data);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // CSV Template download
  const handleDownloadTemplate = () => {
    const headers = "SKU,Name,Category,CurrentStock,ReorderPoint,TargetStock,UnitCost,RetailPrice,SalesVelocityPerWeek,SupplierName\n";
    const sample = "EL-ACC-99,Braided Audio Splitter 3.5mm,Accessories,15,10,40,4.20,14.99,8,Apex Wholesale Direct\nEL-CHG-55,100W GaN Travel Adapter,Chargers & Cables,6,20,50,22.00,49.99,14,VoltCore Electronics Distro";
    const blob = new Blob([headers + sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "stockwise_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle CSV Upload & Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        if (lines.length < 2) {
          setCsvError("CSV file must contain a header row and at least one item row.");
          return;
        }

        const rows: Omit<InventoryItem, "id">[] = [];
        // skip header row
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          if (cols.length >= 7) {
            const currentStock = parseInt(cols[3], 10) || 0;
            const reorderPoint = parseInt(cols[4], 10) || 15;
            const targetStock = parseInt(cols[5], 10) || 50;
            const unitCost = parseFloat(cols[6]) || 10;
            const retailPrice = parseFloat(cols[7]) || unitCost * 2;
            const salesVelocity = parseInt(cols[8], 10) || 10;

            let status: StockStatus = "in_stock";
            if (currentStock === 0) status = "out_of_stock";
            else if (currentStock <= reorderPoint * 0.5) status = "critical";
            else if (currentStock <= reorderPoint) status = "low_stock";

            rows.push({
              sku: cols[0] || `SKU-${Date.now()}-${i}`,
              name: cols[1] || "Electronics Accessory",
              category: (cols[2] as any) || "Accessories",
              currentStock,
              reorderPoint,
              targetStock,
              unitCost,
              retailPrice,
              salesVelocityPerWeek: salesVelocity,
              supplierName: cols[9] || "Apex Wholesale Direct",
              supplierId: "sup-1",
              status,
              lastRestocked: new Date().toISOString().split("T")[0],
            });
          }
        }

        if (rows.length === 0) {
          setCsvError("No valid rows could be parsed. Check column formatting.");
        } else {
          setCsvError(null);
          setCsvPreview(rows);
        }
      } catch (err: any) {
        setCsvError("Error reading file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (csvPreview.length === 0) return;
    const updated = await api.importInventoryBatch(csvPreview);
    setItems(updated);
    setIsCsvModalOpen(false);
    setCsvPreview([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast(`Successfully imported ${csvPreview.length} inventory products via CSV!`);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.name || !newItem.sku) return;

    const currentStock = Number(newItem.currentStock) || 0;
    const reorderPoint = Number(newItem.reorderPoint) || 15;

    let status: StockStatus = "in_stock";
    if (currentStock === 0) status = "out_of_stock";
    else if (currentStock <= reorderPoint * 0.5) status = "critical";
    else if (currentStock <= reorderPoint) status = "low_stock";

    const itemToAdd: Omit<InventoryItem, "id"> = {
      sku: newItem.sku!,
      name: newItem.name!,
      category: (newItem.category as any) || "Accessories",
      currentStock,
      reorderPoint,
      targetStock: Number(newItem.targetStock) || 50,
      unitCost: Number(newItem.unitCost) || 10,
      retailPrice: Number(newItem.retailPrice) || 25,
      salesVelocityPerWeek: Number(newItem.salesVelocityPerWeek) || 8,
      supplierName: newItem.supplierName || "Apex Wholesale Direct",
      supplierId: newItem.supplierId || "sup-1",
      status,
      lastRestocked: new Date().toISOString().split("T")[0],
    };

    const added = await api.addInventoryItem(itemToAdd);
    setItems([added, ...items]);
    setIsAddModalOpen(false);
    showToast(`Product ${added.name} successfully added to catalog.`);
  };

  // Filtered and sorted products
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        const matchesSearch =
          item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.supplierName.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesCategory =
          categoryFilter === "all" || item.category === categoryFilter;

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "low_stock" &&
            (item.status === "low_stock" || item.status === "critical" || item.status === "out_of_stock")) ||
          (statusFilter === "critical" && item.status === "critical") ||
          (statusFilter === "out_of_stock" && item.status === "out_of_stock") ||
          (statusFilter === "in_stock" && item.status === "in_stock");

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === "stock-asc") return a.currentStock - b.currentStock;
        if (sortBy === "stock-desc") return b.currentStock - a.currentStock;
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "margin") {
          const marginA = (a.retailPrice - a.unitCost) / a.retailPrice;
          const marginB = (b.retailPrice - b.unitCost) / b.retailPrice;
          return marginB - marginA;
        }
        return 0;
      });
  }, [items, searchQuery, categoryFilter, statusFilter, sortBy]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-emerald-600 hover:text-emerald-900">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Page Header with Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Electronics Inventory Catalog
            </h2>
            <p className="text-xs text-slate-500">
              Track stock depletion rates, reorder thresholds, and import bulk stocklists via CSV
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsCsvModalOpen(true)}
              className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 shadow-2xs flex items-center gap-2 transition-colors"
            >
              <Upload className="w-4 h-4 text-slate-500" />
              <span>Import CSV</span>
            </button>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {/* Filter and Search Bar Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
            {/* Search Input */}
            <div className="lg:col-span-5 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by product name, SKU, or supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent text-slate-900"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="lg:col-span-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Categories ({items.length})</option>
                <option value="Chargers & Cables">Chargers & Cables</option>
                <option value="Audio">Audio & Acoustics</option>
                <option value="Power & Batteries">Power & Batteries</option>
                <option value="Wearables">Wearables</option>
                <option value="Storage">Storage & Memory</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="lg:col-span-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="low_stock">Low / Critical</option>
                <option value="critical">Critical Only</option>
                <option value="out_of_stock">Out of Stock</option>
                <option value="in_stock">Healthy (In Stock)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="lg:col-span-2">
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="stock-asc">Lowest Stock First</option>
                <option value="stock-desc">Highest Stock First</option>
                <option value="name">Product Name (A-Z)</option>
                <option value="margin">Highest Margin %</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>
              Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> electronics SKUs
            </span>

            {(searchQuery || categoryFilter !== "all" || statusFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setCategoryFilter("all");
                  setStatusFilter("all");
                }}
                className="text-blue-600 hover:text-blue-800 text-xs font-semibold hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Product Table Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-3.5 px-4">SKU / Product Name</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Stock Level & Safety Target</th>
                  <th className="py-3.5 px-4">Sales Rate</th>
                  <th className="py-3.5 px-4">Cost / Retail</th>
                  <th className="py-3.5 px-4">Margin</th>
                  <th className="py-3.5 px-4">Preferred Supplier</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const marginPct = Math.round(
                    ((item.retailPrice - item.unitCost) / item.retailPrice) * 100
                  );
                  const stockPct = Math.min(
                    100,
                    Math.round((item.currentStock / item.targetStock) * 100)
                  );

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Name & SKU */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">{item.sku}</div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700">
                          {item.category}
                        </span>
                      </td>

                      {/* Stock Level Bar */}
                      <td className="py-3.5 px-4 min-w-[160px]">
                        <div className="flex justify-between text-[11px] mb-1 font-semibold">
                          <span
                            className={
                              item.currentStock === 0
                                ? "text-rose-600 font-bold"
                                : item.currentStock <= item.reorderPoint
                                ? "text-amber-600 font-bold"
                                : "text-slate-800"
                            }
                          >
                            {item.currentStock} units
                          </span>
                          <span className="text-slate-400 text-[10px]">
                            Target: {item.targetStock} (Min: {item.reorderPoint})
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.currentStock === 0
                                ? "bg-rose-500"
                                : item.currentStock <= item.reorderPoint
                                ? "bg-amber-400"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${stockPct}%` }}
                          />
                        </div>
                      </td>

                      {/* Velocity */}
                      <td className="py-3.5 px-4 text-slate-600">
                        <div className="font-medium">{item.salesVelocityPerWeek} / wk</div>
                        <div className="text-[10px] text-slate-400">
                          Runway: ~
                          {item.salesVelocityPerWeek > 0
                            ? ((item.currentStock / item.salesVelocityPerWeek) * 7).toFixed(1)
                            : 0}{" "}
                          days
                        </div>
                      </td>

                      {/* Cost / Retail */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">
                          ${item.retailPrice.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Cost: ${item.unitCost.toFixed(2)}
                        </div>
                      </td>

                      {/* Margin */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`font-semibold ${
                            marginPct >= 60
                              ? "text-emerald-600"
                              : marginPct >= 40
                              ? "text-blue-600"
                              : "text-slate-600"
                          }`}
                        >
                          {marginPct}%
                        </span>
                      </td>

                      {/* Supplier */}
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-medium text-slate-800">{item.supplierName}</div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            item.status === "out_of_stock"
                              ? "danger"
                              : item.status === "critical"
                              ? "danger"
                              : item.status === "low_stock"
                              ? "warning"
                              : "success"
                          }
                          size="sm"
                          dot
                        >
                          {item.status === "out_of_stock"
                            ? "Out of Stock"
                            : item.status === "critical"
                            ? "Critical Low"
                            : item.status === "low_stock"
                            ? "Low Stock"
                            : "In Stock"}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href="/planner"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                          title="Restock this product in Purchase Planner"
                        >
                          <ShoppingCart className="w-3 h-3" />
                          <span>Restock</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Package className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                      <p className="font-semibold text-slate-700">No electronics items found</p>
                      <p className="text-xs text-slate-500">
                        Try adjusting your search query or reset filters.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CSV Import Modal */}
      <Modal
        isOpen={isCsvModalOpen}
        onClose={() => {
          setIsCsvModalOpen(false);
          setCsvPreview([]);
          setCsvError(null);
        }}
        title="Import Electronics Inventory via CSV"
        description="Upload your distributor spreadsheet or retail inventory export (.csv)"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          {/* Download sample helper */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-blue-800">
              <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Need the required CSV column format? Download our electronics template.</span>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 flex items-center gap-1 shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Template
            </button>
          </div>

          {/* Upload Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/20 transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">
              Click to browse or drag & drop CSV file
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Supports standard UTF-8 CSV exports with columns: SKU, Name, Category, CurrentStock, UnitCost, RetailPrice
            </p>
          </div>

          {csvError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{csvError}</span>
            </div>
          )}

          {/* Preview Table */}
          {csvPreview.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Previewing {csvPreview.length} items ready to import
                </span>
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Ready for catalog
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-100 text-[10px] uppercase text-slate-600 sticky top-0">
                    <tr>
                      <th className="p-2">SKU</th>
                      <th className="p-2">Name</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Stock</th>
                      <th className="p-2">Unit Cost</th>
                      <th className="p-2">Retail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {csvPreview.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-600">{item.sku}</td>
                        <td className="p-2 font-semibold text-slate-800">{item.name}</td>
                        <td className="p-2 text-slate-600">{item.category}</td>
                        <td className="p-2 font-semibold">{item.currentStock}</td>
                        <td className="p-2 text-slate-600">${item.unitCost}</td>
                        <td className="p-2 text-slate-600">${item.retailPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              onClick={() => {
                setIsCsvModalOpen(false);
                setCsvPreview([]);
                setCsvError(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={csvPreview.length === 0}
              className={`px-4 py-2 text-xs font-semibold text-white rounded-xl shadow-xs transition-all ${
                csvPreview.length > 0
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-slate-300 cursor-not-allowed"
              }`}
            >
              Import {csvPreview.length} Items to Inventory
            </button>
          </div>
        </div>
      </Modal>

      {/* Add Single Product Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Single Electronics Product"
        description="Enter product specifications and initial inventory levels"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Product Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. 100W GaN 4-Port Fast Desktop Charger"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SKU *</label>
              <input
                type="text"
                required
                placeholder="e.g. EL-CHG-99"
                value={newItem.sku}
                onChange={(e) => setNewItem({ ...newItem, sku: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 text-slate-900 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
              <select
                value={newItem.category}
                onChange={(e: any) => setNewItem({ ...newItem, category: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white text-slate-900"
              >
                <option value="Chargers & Cables">Chargers & Cables</option>
                <option value="Audio">Audio & Acoustics</option>
                <option value="Power & Batteries">Power & Batteries</option>
                <option value="Wearables">Wearables</option>
                <option value="Storage">Storage & Memory</option>
                <option value="Accessories">Accessories</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Stock Units
              </label>
              <input
                type="number"
                min="0"
                value={newItem.currentStock}
                onChange={(e) =>
                  setNewItem({ ...newItem, currentStock: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reorder Threshold (Min)
              </label>
              <input
                type="number"
                min="1"
                value={newItem.reorderPoint}
                onChange={(e) =>
                  setNewItem({ ...newItem, reorderPoint: parseInt(e.target.value, 10) })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit Wholesale Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={newItem.unitCost}
                onChange={(e) =>
                  setNewItem({ ...newItem, unitCost: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Retail Selling Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={newItem.retailPrice}
                onChange={(e) =>
                  setNewItem({ ...newItem, retailPrice: parseFloat(e.target.value) })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 text-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs"
            >
              Add Product
            </button>
          </div>
        </form>
      </Modal>
    </DashboardLayout>
  );
}
