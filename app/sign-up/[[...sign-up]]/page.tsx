import { headers } from "next/headers";
import { SignUp } from "@clerk/nextjs";
import AuthPage from "@/components/AuthPage";
import NativeSignIn from "@/components/auth/NativeSignIn";
import SignUpTracker from "@/components/auth/SignUpTracker";
import { inAppAuthAppearance } from "@/lib/auth-appearance";
import { isNativeApp } from "@/lib/native";

export default async function SignUpPage() {
  const inApp = isNativeApp((await headers()).get("user-agent"));
  return <AuthPage><SignUpTracker inApp={inApp}><SignUp appearance={inApp ? inAppAuthAppearance : undefined} /></SignUpTracker>{inApp && <NativeSignIn />}</AuthPage>;
}
