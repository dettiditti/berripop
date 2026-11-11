"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useI18n } from "@/lib/i18n/client";
import { nativeAuth } from "@/lib/nativeBridge";
import { appleSignInAction } from "@/lib/server/actions";

/*
 * Sign in with Apple and with Google inside the iPhone app. The buttons are
 * Clerk's own, in the sign-in/sign-up card; a tap on them is caught here and
 * run natively instead (lib/nativeBridge.ts), because Google refuses sign-in
 * in embedded web views. The app returns an ID token; Clerk verifies it and
 * signs the member in, or creates the account like a web sign-up with Google.
 *
 * Each is switched on separately once it is set up in Clerk (public values,
 * no secrets). Google is never offered without Apple (App Store rule 4.8).
 * Until switched on, or in an app version without native sign-in, the buttons
 * stay hidden (.in-app-social in globals.css) and email works as before.
 */
const APPLE_ON = process.env.NEXT_PUBLIC_APPLE_SIGN_IN === "1";
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? "";
const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";
const GOOGLE_ON = APPLE_ON && !!GOOGLE_IOS_CLIENT_ID && !!GOOGLE_WEB_CLIENT_ID;

type Provider = "apple" | "google";

/** Which Clerk social button was tapped, from Clerk's per-provider class names. */
function providerOf(target: EventTarget | null): Provider | null {
  const button = target instanceof Element ? target.closest(".in-app-social button") : null;
  if (!button) return null;
  if (button.matches(".cl-socialButtonsBlockButton__apple, .cl-socialButtonsIconButton__apple")) return "apple";
  if (button.matches(".cl-socialButtonsBlockButton__google, .cl-socialButtonsIconButton__google")) return "google";
  return null;
}

/**
 * A short code for the failure, shown in small print so a failed sign-in can
 * be diagnosed: Clerk's error code (e.g. "form_identifier_exists"), or the
 * app's own ("failed", "busy"). Never the token or any account detail.
 */
function errorCode(err: unknown): string {
  const clerk = (err as { errors?: { code?: unknown }[] } | null)?.errors?.[0]?.code;
  if (typeof clerk === "string" && /^[a-z0-9_]{1,60}$/.test(clerk)) return clerk;
  const msg = err instanceof Error ? err.message : "";
  return /^[a-z_]{1,30}$/.test(msg) ? msg : "unknown";
}

export default function NativeSignIn() {
  const { d } = useI18n();
  const s = d.auth.native;
  const clerk = useClerk();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function go(provider: Provider) {
    const auth = nativeAuth();
    if (!auth || busy.current || !clerk.client) return;
    busy.current = true;
    document.documentElement.classList.add("native-busy");
    setError(null);
    const done = { signInForceRedirectUrl: "/", signUpForceRedirectUrl: "/" };
    try {
      if (provider === "apple") {
        // Clerk's web API does not take the app's Apple token, so the server checks it and returns a one-time ticket.
        const r = await auth.apple();
        const res = await appleSignInAction(r.idToken, r.firstName, r.lastName);
        if (!res.ok) throw new Error(res.code);
        const signIn = await clerk.client.signIn.create({ strategy: "ticket", ticket: res.ticket });
        if (signIn.status !== "complete" || !signIn.createdSessionId) throw new Error("incomplete");
        await clerk.setActive({ session: signIn.createdSessionId, redirectUrl: "/" });
        return;
      } else {
        const r = await auth.google({ clientId: GOOGLE_IOS_CLIENT_ID, audience: GOOGLE_WEB_CLIENT_ID });
        const res = await clerk.authenticateWithGoogleOneTap({ token: r.idToken });
        await clerk.handleGoogleOneTapCallback(res, done);
        return;
      }
    } catch (err) {
      if (!(err instanceof Error && /cancel/i.test(err.message))) setError(`${s.failed} (${errorCode(err)})`);
    }
    busy.current = false;
    document.documentElement.classList.remove("native-busy");
  }
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!APPLE_ON || !nativeAuth()) return;
    const root = document.documentElement;
    root.classList.add("native-auth");
    if (GOOGLE_ON) root.classList.add("native-google");
    // Capture phase: the tap never reaches Clerk's web redirect.
    const onClick = (e: MouseEvent) => {
      const provider = providerOf(e.target);
      if (!provider) return;
      e.preventDefault();
      e.stopPropagation();
      if (provider === "google" && !GOOGLE_ON) return;
      void goRef.current(provider);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      root.classList.remove("native-auth", "native-google", "native-busy");
    };
  }, []);

  return error ? <p className="field-hint native-sign-in-error" role="alert">{error}</p> : null;
}
