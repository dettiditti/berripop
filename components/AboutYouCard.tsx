"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { AGE_RANGES, GENDERS, type MemberProfile } from "@/lib/profile/model";
import { getProfileAction, setProfileAction } from "@/lib/server/actions";

/**
 * Settings: the optional age range and gender. Each can be changed or set back
 * to "not set", which clears it on the account. Only shapes the AI's tone.
 */
export default function AboutYouCard({ notify }: { notify: (message: string) => void }) {
  const { d } = useI18n();
  const y = d.aboutYou;
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  useEffect(() => {
    getProfileAction().then(r => { if (r.ok) setProfile(r.profile); }).catch(() => {});
  }, []);

  async function save(patch: { ageRange?: string | null; gender?: string | null }) {
    try {
      const r = await setProfileAction(patch);
      if (r.ok) { setProfile(r.profile); notify(y.saved); return; }
    } catch {
      // Falls through to the generic error.
    }
    notify(d.auth.error);
  }

  if (!profile) return null;
  return (
    <section className="card stack-sm" aria-labelledby="set-about">
      <h2 id="set-about">{y.settingsTitle}</h2>
      <p className="muted">{y.settingsBody}</p>
      <label className="field-label" htmlFor="set-age">{y.settingsAge}</label>
      <select id="set-age" className="input" value={profile.ageRange ?? ""} onChange={e => save({ ageRange: e.target.value || null })}>
        <option value="">{y.notSet}</option>
        {AGE_RANGES.map(k => <option key={k} value={k}>{y.age[k]}</option>)}
      </select>
      <label className="field-label" htmlFor="set-gender">{y.settingsGender}</label>
      <select id="set-gender" className="input" value={profile.gender ?? ""} onChange={e => save({ gender: e.target.value || null })}>
        <option value="">{y.notSet}</option>
        {GENDERS.map(k => <option key={k} value={k}>{y.gender[k]}</option>)}
      </select>
    </section>
  );
}
