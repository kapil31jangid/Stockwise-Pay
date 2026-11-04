import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: string;
  isPositive?: boolean;
  icon: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  badge?: string;
  badgeVariant?: "success" | "warning" | "danger" | "info" | "navy";
  progress?: {
    value: number;
    max: number;
    label?: string;
  };
  onClick?: () => void;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  change,
  isPositive = true,
  icon: Icon,
  iconBgColor = "bg-blue-50",
  iconColor = "text-blue-600",
  badge,
  badgeVariant = "info",
  progress,
  onClick,
  className = "",
}) => {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm transition-all duration-200 ${
        onClick ? "cursor-pointer hover:border-blue-300 hover:shadow-md" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>
            {badge && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  badgeVariant === "success"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : badgeVariant === "warning"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : badgeVariant === "danger"
                    ? "bg-rose-50 text-rose-700 border border-rose-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {badge}
              </span>
            )}
          </div>
        </div>

        <div className={`w-11 h-11 rounded-lg ${iconBgColor} ${iconColor} flex items-center justify-center shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>

      {progress && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="flex justify-between items-center text-xs text-slate-600 mb-1.5">
            <span>{progress.label || "Utilization"}</span>
            <span className="font-semibold text-slate-800">
              {Math.round((progress.value / progress.max) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (progress.value / progress.max) > 0.85
                  ? "bg-amber-500"
                  : (progress.value / progress.max) > 1
                  ? "bg-rose-500"
                  : "bg-blue-600"
              }`}
              style={{ width: `${Math.min(100, (progress.value / progress.max) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {(subtitle || change) && !progress && (
        <div className="mt-3.5 flex items-center gap-1.5 text-xs text-slate-500">
          {change && (
            <span
              className={`font-semibold inline-flex items-center ${
                isPositive ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {change}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
};

