/**
 * The iPhone app's native features, reached through the Capacitor bridge the
 * app puts into the page (window.Capacitor). On the website there is no
 * bridge and every call quietly does nothing. Presentation only.
 */

type Listener = { remove: () => Promise<void> | void };
/** What a native addListener hands back: the listener itself, or a promise of it, depending on the plugin. */
export type ListenerHandle = Listener | Promise<Listener> | undefined;

/** Stops a native listener, whichever form addListener returned; never throws. */
export function removeListener(handle: ListenerHandle): void {
  try {
    Promise.resolve(handle).then(l => l?.remove?.()).catch(() => {});
  } catch {
    // Nothing to remove.
  }
}
type PushPermission = { receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type Bridge = {
  Plugins?: {
    Haptics?: { notification: (o: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>; impact: (o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void> };
    PushNotifications?: {
      checkPermissions: () => Promise<PushPermission>;
      requestPermissions: () => Promise<PushPermission>;
      register: () => Promise<void>;
      addListener: (event: "registration" | "registrationError", cb: (v: { value?: string; error?: string }) => void) => ListenerHandle;
    };
    BerripopStore?: StorePlugin;
    BerripopAuth?: AuthPlugin;
    BerripopWidget?: { update: (o: { state: BerriWidgetState }) => Promise<void> };
  };
};

export type StoreProduct = { id: string; title: string; description: string; price: string; period?: { unit: "day" | "week" | "month" | "year"; value: number } };
export type PurchaseOutcome = { status: "purchased"; jws: string } | { status: "cancelled" | "pending" | "unknown" };
type StorePlugin = {
  products: (o: { ids: string[] }) => Promise<{ products: StoreProduct[] }>;
  purchase: (o: { id: string; token: string }) => Promise<PurchaseOutcome>;
  current: () => Promise<{ transactions: string[] }>;
  restore: () => Promise<{ transactions: string[] }>;
  manage: () => Promise<void>;
  addListener: (event: "transaction", cb: (v: { jws: string }) => void) => ListenerHandle;
};

/** Native sign-in: each returns an ID token for Clerk to verify; it rejects with "cancelled" when the member closes the sheet. */
type AuthPlugin = {
  apple: () => Promise<{ idToken: string; firstName?: string; lastName?: string }>;
  google: (o: { clientId: string; audience: string }) => Promise<{ idToken: string }>;
};

function plugins() {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: Bridge }).Capacitor?.Plugins;
}

/** A soft "well done" buzz (a step or a day completed). */
export function hapticSuccess(): void {
  plugins()?.Haptics?.notification({ type: "SUCCESS" }).catch(() => {});
}

/** A light tap. */
export function hapticTap(): void {
  plugins()?.Haptics?.impact({ style: "LIGHT" }).catch(() => {});
}

export type PushState = "unavailable" | "granted" | "denied" | "prompt";

export async function pushPermission(): Promise<PushState> {
  const p = plugins()?.PushNotifications;
  if (!p) return "unavailable";
  try {
    const { receive } = await p.checkPermissions();
    return receive === "granted" ? "granted" : receive === "denied" ? "denied" : "prompt";
  } catch {
    return "unavailable";
  }
}

/**
 * Asks for permission if needed, then for this phone's push token. Resolves
 * to the token, "denied", or null if the phone could not register.
 */
export async function pushToken(): Promise<string | "denied" | null> {
  const p = plugins()?.PushNotifications;
  if (!p) return null;
  try {
    const { receive } = await p.requestPermissions();
    if (receive !== "granted") return "denied";
    return await new Promise<string | null>(resolve => {
      const handles: ListenerHandle[] = [];
      const done = (v: string | null) => {
        clearTimeout(timer);
        handles.forEach(removeListener);
        resolve(v);
      };
      const timer = setTimeout(() => done(null), 15_000);
      handles.push(p.addListener("registration", v => done(v.value ?? null)));
      handles.push(p.addListener("registrationError", () => done(null)));
      p.register().catch(() => done(null));
    });
  } catch {
    return null;
  }
}

/** The App Store, when this page runs inside the iPhone app with the store plugin; otherwise null. */
export function appStore(): StorePlugin | null {
  return plugins()?.BerripopStore ?? null;
}

/** Sign in with Apple / Google, when this page runs inside an iPhone app version that has them; otherwise null. */
export function nativeAuth(): AuthPlugin | null {
  return plugins()?.BerripopAuth ?? null;
}

/**
 * What the home-screen widget shows of Berri: when Berri last ate, today's
 * bites, the spark, the hat and Berri's lines in the member's language. No
 * personal content: the widget works out the rest by the date.
 */
export type BerriWidgetState = {
  date: string;
  lastFed: string | null;
  bites: number;
  streak: number;
  lastActive: string | null;
  wear: string | null;
  text: Record<"full" | "peckish" | "hungry" | "missing", string>;
};

/** True inside an iPhone app version that has the home-screen widget. */
export function hasWidget(): boolean {
  return !!plugins()?.BerripopWidget;
}

let lastWidget = "";
/** Hands Berri's state to the home-screen widget, when this page runs inside an iPhone app version that has one. */
export function widgetUpdate(state: BerriWidgetState): void {
  const w = plugins()?.BerripopWidget;
  if (!w) return;
  const key = JSON.stringify(state);
  if (key === lastWidget) return;
  lastWidget = key;
  w.update({ state }).catch(() => { lastWidget = ""; });
}
