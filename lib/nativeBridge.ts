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
  };
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
