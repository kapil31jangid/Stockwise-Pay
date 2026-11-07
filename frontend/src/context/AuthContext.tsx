"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  avatarInitials: string;
  badge: string;
  permissions: string[];
}

export const PRESET_USERS: User[] = [
  {
    id: "USR-001",
    name: "Marcus Vance",
    email: "marcus.vance@stockwisepay.com",
    role: "Inventory Lead / Approver",
    department: "Operations & Supply",
    avatarInitials: "MV",
    badge: "LEAD APPROVER",
    permissions: ["INVENTORY_VIEW", "INVENTORY_EDIT", "PLAN_GENERATE", "PLAN_APPROVE", "PAYMENT_EXECUTE"],
  },
  {
    id: "USR-002",
    name: "Elena Rostova",
    email: "elena.rostova@stockwisepay.com",
    role: "Procurement Specialist",
    department: "Supplier Relations",
    avatarInitials: "ER",
    badge: "BUYER",
    permissions: ["INVENTORY_VIEW", "SUPPLIERS_COMPARE", "PLAN_GENERATE"],
  },
  {
    id: "USR-003",
    name: "David Chen",
    email: "david.chen@stockwisepay.com",
    role: "Chief Financial Officer",
    department: "Finance & Treasury",
    avatarInitials: "DC",
    badge: "TREASURY",
    permissions: ["BUDGET_EDIT", "AUDIT_VIEW", "PAYMENT_AUDIT", "PLAN_APPROVE", "PAYMENT_EXECUTE"],
  },
];

export const DEMO_CREDENTIALS: Record<string, string> = {
  "marcus.vance@stockwisepay.com": "ApproverPass2026!",
  "elena.rostova@stockwisepay.com": "BuyerPass2026!",
  "david.chen@stockwisepay.com": "TreasuryPass2026!",
};

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (email?: string, password?: string) => Promise<User>;
  switchAccount: (userId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_KEY = "stockwise_auth_user";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      const match = typeof document !== "undefined" ? document.cookie.match(/stockwise_token=([^;]+)/) : null;
      const storedToken = match ? match[1] : (typeof localStorage !== "undefined" ? localStorage.getItem("stockwise_jwt_token") : null);

      if (stored && stored !== "logged_out") {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id && storedToken) {
          setUser(parsed);
          setToken(storedToken);
        } else {
          setUser(null);
          setToken(null);
        }
      } else {
        setUser(null);
        setToken(null);
      }
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email?: string, password?: string): Promise<User> => {
    setIsLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const targetEmail = email || "marcus.vance@stockwisepay.com";
      const resolvedPassword = password || DEMO_CREDENTIALS[targetEmail] || "";

      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: resolvedPassword }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Login failed (HTTP ${res.status})`);
      }

      const data = await res.json();
      if (!data.token || !data.user) {
        throw new Error("Invalid authentication response from server");
      }

      const u: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        department: data.user.department || "Operations",
        avatarInitials: data.user.avatarInitials || data.user.name.slice(0, 2).toUpperCase(),
        badge: data.user.badge || "AUTHENTICATED",
        permissions: data.user.permissions || [],
      };

      setUser(u);
      setToken(data.token);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
      localStorage.setItem("stockwise_jwt_token", data.token);

      if (typeof document !== "undefined") {
        document.cookie = `stockwise_token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
      }

      setIsAuthModalOpen(false);
      return u;
    } finally {
      setIsLoading(false);
    }
  };

  const switchAccount = (userId: string) => {
    const selected = PRESET_USERS.find((u) => u.id === userId);
    if (selected) {
      const pass = DEMO_CREDENTIALS[selected.email] || "";
      login(selected.email, pass).catch((err) => {
        console.error("Account switch failed:", err);
      });
    }
  };

  const logout = () => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const currentToken = token;

    if (currentToken && apiBase) {
      fetch(`${apiBase}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ actor: user?.name || "User" }),
      }).catch(() => {});
    }

    setUser(null);
    setToken(null);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, "logged_out");
      localStorage.removeItem("stockwise_jwt_token");
      if (typeof document !== "undefined") {
        document.cookie = "stockwise_token=; path=/; max-age=0; SameSite=Lax";
      }
    } catch (e) {
      console.warn("Storage write error on logout:", e);
    }
    setIsAuthModalOpen(false);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!user,
        isLoading,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        login,
        switchAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

