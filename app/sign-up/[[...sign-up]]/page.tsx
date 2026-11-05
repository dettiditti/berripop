import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import AuthPage from "@/components/AuthPage";
import { inAppAuthAppearance } from "@/lib/auth-appearance";
import { isNativeApp } from "@/lib/native";

export default async function SignUpPage() {
  const inApp = isNativeApp((await headers()).get("user-agent"));
  return <AuthPage><SignUp appearance={inApp ? inAppAuthAppearance : undefined} /></AuthPage>;
}
