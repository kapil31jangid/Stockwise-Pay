"use client";

import React from "react";
import { AuthProvider } from "../../context/AuthContext";
import { AuthModal } from "../auth/AuthModal";

export const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      {children}
      <AuthModal />
    </AuthProvider>
  );
};

