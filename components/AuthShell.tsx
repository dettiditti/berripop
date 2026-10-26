import type { ReactNode } from "react";
import BerripopMascot from "./berripop/BerripopMascot";

/** Branded frame around Clerk's sign-in and sign-up forms. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-shell">
      <div className="auth-brand">
        <BerripopMascot mood="happy" size={72} />
        <span>berripop</span>
      </div>
      {children}
    </main>
  );
}
