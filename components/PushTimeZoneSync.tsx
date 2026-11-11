"use client";

import { useEffect } from "react";
import { pushPermission, pushToken } from "@/lib/nativeBridge";
import { refreshPushTimeZoneAction } from "@/lib/server/actions";
import { useNativeApp } from "./useNativeApp";

/**
 * iPhone app only, once per launch: if notifications are already allowed,
 * tells the server this phone's current time zone, so the chosen hours stay
 * local after travel. Never asks for permission and never turns anything on.
 */
export default function PushTimeZoneSync() {
  const inApp = useNativeApp();
  useEffect(() => {
    if (!inApp) return;
    (async () => {
      if ((await pushPermission()) !== "granted") return;
      const tk = await pushToken();
      if (typeof tk === "string" && tk !== "denied") await refreshPushTimeZoneAction(tk, Intl.DateTimeFormat().resolvedOptions().timeZone);
    })().catch(() => { /* best effort */ });
  }, [inApp]);
  return null;
}
