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
