"use client";

import { useMemo, useSyncExternalStore } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeI18n } from "./format";

/**
 * Language preference on this device (localStorage + a cookie for server-rendered
 * screens). A signed-in member's saved profile language takes priority and is
 * applied when their data loads. Falls back to Hungarian.
 */
const KEY = "kozos-locale";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function read(): Locale {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage blocked: use the default.
  }
  return defaultLocale;
}

function getSnapshot(): Locale {
  if (current === null) current = read();
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setLocale(locale: Locale) {
  current = locale;
  try {
    window.localStorage.setItem(KEY, locale);
  } catch {
    // Keep working in memory.
  }
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach(l => l());
}

/** The server and hydration render use the default; the stored choice applies right after. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, () => defaultLocale);
}

export function useI18n() {
  const locale = useLocale();
  return useMemo(() => makeI18n(locale), [locale]);
}
