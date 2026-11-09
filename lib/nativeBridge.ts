/**
 * The iPhone app's native features, reached through the Capacitor bridge the
 * app puts into the page (window.Capacitor). On the website there is no
 * bridge and every call quietly does nothing. Presentation only.
 */

type Listener = { remove: () => Promise<void> };
type PushPermission = { receive: "granted" | "denied" | "prompt" | "prompt-with-rationale" };
type Bridge = {
  Plugins?: {
    Haptics?: { notification: (o: { type: "SUCCESS" | "WARNING" | "ERROR" }) => Promise<void>; impact: (o: { style: "LIGHT" | "MEDIUM" | "HEAVY" }) => Promise<void> };
    PushNotifications?: {
      checkPermissions: () => Promise<PushPermission>;
      requestPermissions: () => Promise<PushPermission>;
      register: () => Promise<void>;
      addListener: (event: "registration" | "registrationError", cb: (v: { value?: string; error?: string }) => void) => Promise<Listener>;
    };
    BerripopStore?: StorePlugin;
    BerripopAuth?: AuthPlugin;
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
  addListener: (event: "transaction", cb: (v: { jws: string }) => void) => Promise<Listener>;
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
      const handles: Promise<Listener>[] = [];
      const done = (v: string | null) => {
        clearTimeout(timer);
        handles.forEach(h => h.then(l => l.remove()).catch(() => {}));
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
