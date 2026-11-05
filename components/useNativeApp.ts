"use client";

import { useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/native";

const noSubscribe = () => () => {};

/**
 * True inside the Berripop phone app. The server render (and hydration) says
 * false, so anything hidden in the app is simply not drawn once the browser
 * knows. Presentation only, never access: the user agent can be set by anyone.
 */
export function useNativeApp(): boolean {
  return useSyncExternalStore(noSubscribe, () => isNativeApp(navigator.userAgent), () => false);
}
