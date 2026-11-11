import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, huHU } from "@clerk/localizations";
import { Analytics } from "@vercel/analytics/next";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { isNativeApp } from "@/lib/native";
import "./globals.css";

const d = getDictionary(defaultLocale);

// Pages set their own <title>; KozosApp and Welcome keep it in the chosen language after a switch.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.berripop.com"),
  description: d.meta.description,
};

/** Clerk's own strings in the app language, with Berripop titles instead of the Clerk application name. */
function clerkLocalization(locale: Locale) {
  const base = locale === "hu" ? huHU : enUS;
  const a = getDictionary(locale).auth;
  return {
    ...base,
    signIn: { ...base.signIn, start: { ...base.signIn?.start, title: a.signInTitle, subtitle: a.signInSubtitle } },
    signUp: { ...base.signUp, start: { ...base.signUp?.start, title: a.signUpTitle, subtitle: a.signUpSubtitle } },
    // Full labels on the Apple and Google buttons, also when several are shown.
    socialButtonsBlockButton: a.socialContinue,
    socialButtonsBlockButtonManyInView: a.socialContinue,
    unstable__errors: {
      ...base.unstable__errors,
      form_param_format_invalid: a.errors.invalidFormat,
      form_param_format_invalid__email_address: a.errors.invalidEmail,
      form_identifier_not_found: a.errors.notFound,
      form_identifier_exists: a.errors.exists,
      form_identifier_exists__email_address: a.errors.exists,
      form_password_incorrect: a.errors.passwordIncorrect,
      form_code_incorrect: a.errors.codeIncorrect,
      form_password_length_too_short: a.errors.passwordTooShort,
    },
  };
}

/** Clerk's forms in the Berripop palette (see the tokens in globals.css). */
const clerkAppearance = {
  layout: { socialButtonsPlacement: "top" as const, socialButtonsVariant: "blockButton" as const },
  variables: {
    colorPrimary: "#7b4dff",
    colorForeground: "#2b2140",
    colorMutedForeground: "#6c6380",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#2b2140",
    colorDanger: "#d6453d",
    colorRing: "#4c9dff",
    borderRadius: "14px",
    fontFamily: '"Nunito", ui-rounded, system-ui, sans-serif',
  },
  elements: {
    rootBox: "auth-clerk-root",
    cardBox: "auth-clerk-card",
    headerTitle: "auth-clerk-title",
    formButtonPrimary: "auth-clerk-primary",
    socialButtonsBlockButton: "auth-clerk-social",
  },
};

/**
 * In the phone app the page reaches under the status bar and the home
 * indicator ("cover"), so a page can colour the whole screen (Berri's
 * lavender). Everything else keeps its old top: see `html[data-app]` in
 * globals.css. The website is unchanged.
 */
export async function generateViewport(): Promise<Viewport> {
  const inApp = isNativeApp((await headers()).get("user-agent"));
  return { themeColor: "#FFF8EE", width: "device-width", initialScale: 1, ...(inApp ? { viewportFit: "cover" as const } : {}) };
}

const ERROR_REPORTER = `(function(){var n=0;function send(e,src){if(n++>4)return;try{var err=e&&e.error||e&&e.reason||e||{};var st=String(err.stack||"").split("\\n").slice(0,3).join(" | ");navigator.sendBeacon&&navigator.sendBeacon("/api/client-error",new Blob([JSON.stringify({name:String(err.name||src),message:String(err.message||e&&e.message||err).slice(0,200),at:st.slice(0,200)||String(e&&e.filename||"")+":"+(e&&e.lineno||""),path:location.pathname,app:/BerripopApp\\//.test(navigator.userAgent)})],{type:"application/json"}))}catch(_){}}addEventListener("error",function(e){send(e,"error")});addEventListener("unhandledrejection",function(e){send(e,"rejection")})})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The language cookie lets server-rendered screens (and Clerk's sign-in) match the app's language.
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  const inApp = isNativeApp((await headers()).get("user-agent"));
  return (
    <ClerkProvider
      localization={clerkLocalization(locale)}
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang={locale} data-app={inApp ? "" : undefined} suppressHydrationWarning>
        <body>
          {/* Reports uncaught page errors (type, short message, code location, path) to the server logs: never the member or anything typed. */}
          <script dangerouslySetInnerHTML={{ __html: ERROR_REPORTER }} />
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
          {/* Cookieless, anonymous page views (Vercel Web Analytics). */}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
