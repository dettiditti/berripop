"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Check, Crown, Lock, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { RELATIONSHIP_COPY, type PremiumFeature, type RelationshipCopy } from "@/lib/relationship/copy";
import type { RelationshipError, RelationshipState } from "@/lib/relationship/types";
import { relationshipEventAction } from "@/lib/server/actions";
import { Sheet } from "../Modals";
import UpgradePrompt from "../billing/UpgradePrompt";
import AiConsentCard from "../AiConsentCard";
import { SafetyCard } from "../safety/SafetyCard";

/** The module's copy in the member's language. */
export function useRelCopy(): RelationshipCopy {
  const { locale } = useI18n();
  return RELATIONSHIP_COPY[locale];
}

/** What every part of the module shares: the state, updating it, opening a paywall, the toast. */
export type RelCtx = {
  state: RelationshipState;
  setState: (s: RelationshipState) => void;
  paywall: (feature: PremiumFeature) => void;
  notify: (m: string) => void;
};
export const RelContext = createContext<RelCtx | null>(null);
export function useRel(): RelCtx {
  const ctx = useContext(RelContext);
  if (!ctx) throw new Error("RelContext missing");
  return ctx;
}

/* Each analytics event at most once per feature and visit, so moving around does not inflate the numbers. */
const sent = new Set<string>();
export function trackOnce(event: "premium_feature_previewed" | "premium_paywall_viewed", feature: PremiumFeature) {
  const k = `${event}:${feature}`;
  if (sent.has(k)) return;
  sent.add(k);
  void relationshipEventAction(event, feature);
}

export function PremiumBadge({ label }: { label: string }) {
  return <span className="rel-premium-badge"><Crown size={12} strokeWidth={2.6} aria-hidden /> {label}</span>;
}

/**
 * A Premium feature as Free members see it: a real, readable sample (marked
 * as one) behind a soft veil, what it gives, and the way to unlock it. Never
 * an empty locked box.
 */
export function LockedPreview({ feature, children, title }: { feature: PremiumFeature; title?: string; children: ReactNode }) {
  const c = useRelCopy();
  const { paywall } = useRel();
  const f = c.paywall.features[feature];
  useEffect(() => { trackOnce("premium_feature_previewed", feature); }, [feature]);
  return (
    <div className="rel-locked">
      <div className="rel-locked-sample" aria-hidden>
        <span className="rel-sample-tag">{c.sample}</span>
        {children}
      </div>
      <div className="rel-locked-veil">
        <span className="rel-locked-icon" aria-hidden><Lock size={18} /></span>
        <strong>{title ?? f.title}</strong>
        <p>{f.body}</p>
        <button type="button" className="btn btn--premium btn--sm" onClick={() => paywall(feature)}><Sparkles size={15} aria-hidden /> {c.unlock}</button>
      </div>
    </div>
  );
}

/** The contextual paywall: the benefit of THIS feature first, then the existing Premium offer (trial, Stripe or App Store). */
export function RelationshipPaywall({ feature, onClose }: { feature: PremiumFeature; onClose: () => void }) {
  const c = useRelCopy();
  const f = c.paywall.features[feature];
  useEffect(() => { trackOnce("premium_paywall_viewed", feature); }, [feature]);
  return (
    <Sheet title={f.title} kicker={c.paywall.kicker} onClose={onClose}>
      <div className="rel-paywall">
        <div className="rel-paywall-hero" aria-hidden><span /><span /><span /></div>
        <p className="rel-paywall-body">{f.body}</p>
        <p className="rel-paywall-included">{c.paywall.included}</p>
        <ul className="rel-check-list">
          {f.points.map(p => <li key={p}><Check size={16} strokeWidth={3} aria-hidden /> {p}</li>)}
        </ul>
        <UpgradePrompt kind="relationship" force atLimit onAction={() => void relationshipEventAction("premium_checkout_started", feature)} />
        <p className="muted rel-paywall-note">{c.paywall.note}</p>
      </div>
    </Sheet>
  );
}

/** A failed request explained in the member's words; consent and safety get their own cards. */
export function RelError({ error }: { error: RelationshipError | null }) {
  const c = useRelCopy();
  const { notify } = useRel();
  if (!error) return null;
  if (error === "ai_consent_required") return <AiConsentCard notify={notify} />;
  if (error === "safety") return <div className="stack-sm"><p className="field-hint" role="alert">{c.errors.safety}</p><SafetyCard /></div>;
  return <p className="field-hint" role="alert">{c.errors[error]}</p>;
}

/** The member's remaining AI insights (paid and trial), or nothing on Free. */
export function QuotaNote() {
  const c = useRelCopy();
  const { state } = useRel();
  if (!state.premium) return null;
  const q = state.quota;
  if (q.remaining <= 0) return <p className="rel-quota is-empty">{c.quota.empty}</p>;
  return <p className="rel-quota">{q.window === "month" ? c.quota.leftMonth(q.remaining) : c.quota.left(q.remaining)}</p>;
}

/** A horizontal percent bar. */
export function Bar({ value, tone = "purple", label }: { value: number; tone?: string; label?: string }) {
  return (
    <span className={`rel-bar tone-${tone}`} role="img" aria-label={label ?? `${value}%`}>
      <i style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </span>
  );
}

/** Briefly shows "copied" after copying a text. */
export function useCopied(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [copied, (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }];
}
