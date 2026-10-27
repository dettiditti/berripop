import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, huHU } from "@clerk/localizations";
import { Analytics } from "@vercel/analytics/next";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { LocaleProvider } from "@/lib/i18n/client";
import { getDictionary } from "@/lib/i18n/dictionaries";
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

export const viewport: Viewport = {
  themeColor: "#FFF8EE",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The language cookie lets server-rendered screens (and Clerk's sign-in) match the app's language.
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : defaultLocale;
  return (
    <ClerkProvider
      localization={clerkLocalization(locale)}
      appearance={clerkAppearance}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang={locale} suppressHydrationWarning>
        <body>
          <LocaleProvider locale={locale}>{children}</LocaleProvider>
          {/* Cookieless, anonymous page views (Vercel Web Analytics). */}
          <Analytics />
        </body>
      </html>
    </ClerkProvider>
  );
}
