"use client";

import { createContext, createElement, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { makeI18n } from "./format";

/**
 * Language preference on this device (localStorage + a cookie for server-rendered
 * screens). A signed-in member's saved profile language takes priority and is
 * applied when their data loads. Falls back to the language the server rendered in.
 */
const KEY = "kozos-locale";

let current: Locale | null = null;
const listeners = new Set<() => void>();

function readStored(): Locale | null {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage blocked: try the cookie.
  }
  const cookie = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
  return isLocale(cookie) ? cookie : null;
}

function read(): Locale {
  return readStored() ?? defaultLocale;
}

function getSnapshot(fallback: Locale): Locale {
  if (current === null) current = readStored() ?? fallback;
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

/** The language the server rendered in (from the language cookie), so hydration matches it. */
const ServerLocale = createContext<Locale>(defaultLocale);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return createElement(ServerLocale.Provider, { value: locale }, children);
}

/** The server and hydration render use the server's language; a different stored choice applies right after. */
export function useLocale(): Locale {
  const serverLocale = useContext(ServerLocale);
  return useSyncExternalStore(subscribe, () => getSnapshot(serverLocale), () => serverLocale);
}

export function useI18n() {
  const locale = useLocale();
  return useMemo(() => makeI18n(locale), [locale]);
}
