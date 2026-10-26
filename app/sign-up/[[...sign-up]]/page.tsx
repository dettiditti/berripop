import { SignUp } from "@clerk/nextjs";
import AuthPage from "@/components/AuthPage";

export default function SignUpPage() {
  return <AuthPage><SignUp /></AuthPage>;
}
