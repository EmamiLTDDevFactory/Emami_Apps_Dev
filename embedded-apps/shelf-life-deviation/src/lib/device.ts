"use client";
/**
 * Replacement for models.createDeviceModel() (sap.ui.Device) and
 * Component.getContentDensityClass():
 *   no touch support -> "sapUiSizeCompact", touch -> "sapUiSizeCozy"
 */
import { useEffect, useState } from "react";

export interface DeviceInfo {
  system: { desktop: boolean; tablet: boolean; phone: boolean };
  support: { touch: boolean };
}

export function detectDevice(): DeviceInfo {
  if (typeof window === "undefined") {
    return { system: { desktop: true, tablet: false, phone: false }, support: { touch: false } };
  }
  const touch = "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
  const w = window.innerWidth;
  const phone = touch && w < 600;
  const tablet = touch && !phone && w < 1024;
  return { system: { desktop: !phone && !tablet, tablet, phone }, support: { touch } };
}

export function useDevice(): DeviceInfo {
  const [device, setDevice] = useState<DeviceInfo>(() => detectDevice());
  useEffect(() => {
    const d = detectDevice();
    setDevice(d);
    console.log(d.system); // models.js logged Device.system
  }, []);
  return device;
}

export function contentDensityClass(device: DeviceInfo): string {
  return !device.support.touch ? "sapUiSizeCompact" : "sapUiSizeCozy";
}
