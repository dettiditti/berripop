"use client";

/**
 * "My Inner World" moments used to be kept only on this device. They now live
 * in the member's account; whatever is still here is moved there once
 * (importMomentsAction is idempotent) and then removed from the device.
 */
const KEY = "kozos-prototype-v1";

/** Moments still saved on this device (raw; the server validates each one). */
export function readDeviceMoments(): unknown[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { moments?: unknown }) : null;
    return Array.isArray(parsed?.moments) ? parsed.moments : [];
  } catch {
    return [];
  }
}

export function clearDeviceMoments() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Blocked storage: nothing to clear.
  }
}
