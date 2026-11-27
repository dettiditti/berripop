/*
 * The Berripop iOS/Android app (Capacitor) shows this website and appends
 * "BerripopApp/<version>" to the browser's user agent. Pages use it only to
 * adjust presentation inside the app (an app welcome instead of the marketing
 * landing page). The user agent can be set by anyone, so it never decides
 * access, payments or anything else that matters for security.
 */

export const APP_USER_AGENT = /\bBerripopApp\/\d+/;

export const isNativeApp = (userAgent: string | null | undefined): boolean => !!userAgent && APP_USER_AGENT.test(userAgent);

/** Where the app starts: the welcome for signed-out visitors (signed-in members go on to the app). */
export const APP_HOME = "/app";

/** The iPhone app in the App Store (Apple picks the visitor's own store from this link). */
export const APP_STORE_ID = "6832949814";
export const APP_STORE_URL = `https://apps.apple.com/app/berripop/id${APP_STORE_ID}`;

/**
 * App Store Connect campaign links: with the provider token (App Store Connect →
 * App Analytics → Campaigns; not a secret) downloads from each link show up there
 * under its campaign name. Without the token the plain link is used.
 */
export const APP_STORE_PROVIDER_TOKEN = "129769574";
export type AppStorePlacement = "landing_strip" | "landing_phone";
export const appStoreLink = (placement: AppStorePlacement) =>
  APP_STORE_PROVIDER_TOKEN ? `${APP_STORE_URL}?pt=${APP_STORE_PROVIDER_TOKEN}&ct=${placement}&mt=8` : APP_STORE_URL;
