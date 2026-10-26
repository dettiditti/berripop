import { SignIn } from "@clerk/nextjs";
import AuthPage from "@/components/AuthPage";

export default function SignInPage() {
  return <AuthPage><SignIn /></AuthPage>;
}
