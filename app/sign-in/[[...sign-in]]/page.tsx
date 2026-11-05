import { headers } from "next/headers";
import { SignIn } from "@clerk/nextjs";
import AuthPage from "@/components/AuthPage";
import { inAppAuthAppearance } from "@/lib/auth-appearance";
import { isNativeApp } from "@/lib/native";

export default async function SignInPage() {
  const inApp = isNativeApp((await headers()).get("user-agent"));
  return <AuthPage><SignIn appearance={inApp ? inAppAuthAppearance : undefined} /></AuthPage>;
}
