"use client";
/**
 * Replacement for component-level named models:
 *   this.getOwnerComponent().setModel(new JSONModel(oData), "user")
 *   this.getView().setModel(oKpiModel, "kpi")
 *   this.getOwnerComponent().setModel(models.createDeviceModel(), "device")
 */
import React, { createContext, useContext } from "react";
import type { Kpi, UserEntity } from "@/lib/types";
import type { DeviceInfo } from "@/lib/device";

export interface AppModels {
  user: UserEntity | null;
  kpi: Kpi;
  device: DeviceInfo;
}

export const AppContext = createContext<AppModels | null>(null);

export function useAppModels(): AppModels {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppModels must be used inside <AppContext.Provider>");
  return ctx;
}

export function AppProvider({ value, children }: { value: AppModels; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
