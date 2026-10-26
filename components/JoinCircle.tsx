"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { joinCircleAction, previewInviteAction } from "@/lib/server/actions";
import AuthShell from "./AuthShell";
import BerripopMascot from "./berripop/BerripopMascot";

type Preview = { name: string; members: number; alreadyMember: boolean } | "not_found" | null;

/** /join/<code>: shows the invite, asks to sign in if needed, then joins on an explicit tap. */
export default function JoinCircle({ code }: { code: string }) {
  const { d, t, plural } = useI18n();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [preview, setPreview] = useState<Preview>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    previewInviteAction(code).then(r => setPreview(r.ok ? r : "not_found"));
  }, [code, isSignedIn]);

  async function join() {
    setBusy(true);
    const r = await joinCircleAction(code);
    setBusy(false);
    if (r.ok) router.push("/");
  }

  const back = encodeURIComponent(`/join/${code}`);
  return (
    <AuthShell>
      <section className="card join-card">
        <BerripopMascot pair mood="excited" size={80} />
        <h1>{d.invite.title}</h1>
        {!isLoaded ? null : !isSignedIn ? (
          <>
            <p className="muted">{d.invite.signInFirst}</p>
            <Link className="btn btn--primary btn--block" href={`/sign-up?redirect_url=${back}`}>{d.auth.signUp}</Link>
            <Link className="btn btn--ghost btn--block" href={`/sign-in?redirect_url=${back}`}>{d.auth.signIn}</Link>
          </>
        ) : preview === "not_found" ? (
          <p className="muted">{d.invite.notFound}</p>
        ) : preview ? (
          <>
            <p className="join-circle-name">{plural(d.invite.members, preview.members, { name: preview.name })}</p>
            {preview.alreadyMember ? (
              <>
                <p className="muted">{d.invite.already}</p>
                <Link className="btn btn--primary btn--block" href="/">{d.invite.open}</Link>
              </>
            ) : (
              <button className="btn btn--primary btn--block" disabled={busy} onClick={join}>{d.invite.join}</button>
            )}
          </>
        ) : (
          <p className="muted">{t(d.common.loading)}</p>
        )}
      </section>
    </AuthShell>
  );
}
