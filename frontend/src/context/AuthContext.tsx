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
    permissions: ["BUDGET_EDIT", "AUDIT_VIEW", "PAYMENT_AUDIT", "PLAN_APPROVE"],
  },
];

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
      if (stored && stored !== "logged_out") {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id) {
          const t = `jwt-stockwise-${parsed.id}`;
          setUser(parsed);
          setToken(t);
          if (typeof document !== "undefined") {
            document.cookie = `stockwise_token=${t}; path=/; max-age=86400; SameSite=Lax`;
          }
        } else {
          setUser(null);
          setToken(null);
          if (typeof document !== "undefined") {
            document.cookie = "stockwise_token=; path=/; max-age=0; SameSite=Lax";
          }
        }
      } else {
        setUser(null);
        setToken(null);
        if (typeof document !== "undefined") {
          document.cookie = "stockwise_token=; path=/; max-age=0; SameSite=Lax";
        }
      }
    } catch {
      setUser(null);
      setToken(null);
      if (typeof document !== "undefined") {
        document.cookie = "stockwise_token=; path=/; max-age=0; SameSite=Lax";
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (email?: string, password?: string): Promise<User> => {
    setIsLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      if (apiBase) {
        try {
          const res = await fetch(`${apiBase}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.user) {
              const u: User = {
                id: data.user.id || "USR-001",
                name: data.user.name || "Marcus Vance",
                email: data.user.email || email || "marcus.vance@stockwisepay.com",
                role: data.user.role || "Inventory Lead / Approver",
                department: data.user.department || "Operations & Supply",
                avatarInitials: data.user.avatarInitials || (data.user.name ? data.user.name.slice(0, 2).toUpperCase() : "MV"),
                badge: data.user.badge || "AUTHENTICATED",
                permissions: data.user.permissions || ["INVENTORY_VIEW", "PLAN_GENERATE", "PLAN_APPROVE", "PAYMENT_EXECUTE"],
              };
              const authToken = data.token || `jwt-stockwise-${u.id}-${Date.now()}`;
              setUser(u);
              setToken(authToken);
              localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(u));
              if (typeof document !== "undefined") {
                document.cookie = `stockwise_token=${authToken}; path=/; max-age=86400; SameSite=Lax`;
              }
              setIsAuthModalOpen(false);
              return u;
            }
          }
        } catch (backendErr) {
          console.warn("Backend auth call failed, using preset/fallback:", backendErr);
        }
      }

      // Fallback matching preset
      const found = PRESET_USERS.find(
        (u) => u.email.toLowerCase() === (email || "").toLowerCase()
      );
      const authenticatedUser: User = found || {
        id: `USR-${Date.now().toString().slice(-4)}`,
        name: email ? email.split("@")[0].replace(".", " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Retail Manager",
        email: email || "manager@stockwisepay.com",
        role: "Store Manager",
        department: "Retail Operations",
        avatarInitials: (email ? email.slice(0, 2) : "RM").toUpperCase(),
        badge: "AUTHENTICATED",
        permissions: ["INVENTORY_VIEW", "PLAN_GENERATE", "PLAN_APPROVE", "PAYMENT_EXECUTE"],
      };

      const fallbackToken = `jwt-stockwise-${authenticatedUser.id}-${Date.now()}`;
      setUser(authenticatedUser);
      setToken(fallbackToken);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authenticatedUser));
      if (typeof document !== "undefined") {
        document.cookie = `stockwise_token=${fallbackToken}; path=/; max-age=86400; SameSite=Lax`;
      }
      setIsAuthModalOpen(false);
      return authenticatedUser;
    } finally {
      setIsLoading(false);
    }
  };

  const switchAccount = (userId: string) => {
    const selected = PRESET_USERS.find((u) => u.id === userId);
    if (selected) {
      const swToken = `jwt-stockwise-${selected.id}-${Date.now()}`;
      setUser(selected);
      setToken(swToken);
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(selected));
      if (typeof document !== "undefined") {
        document.cookie = `stockwise_token=${swToken}; path=/; max-age=86400; SameSite=Lax`;
      }
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, "logged_out");
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

