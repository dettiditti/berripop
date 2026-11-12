"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { journeyNodes, XP_RULES } from "@/lib/content";
import type { AnswerContext, QuestionRef, RewardDTO, Snapshot } from "@/lib/domain/types";
import { assessmentOpen } from "@/lib/domain/next";
import { buildView } from "@/lib/domain/view";
import { setLocale, useI18n } from "@/lib/i18n/client";
import { isLocale } from "@/lib/i18n/config";
import { isNativeApp } from "@/lib/native";
import { clearStart } from "@/lib/onboarding/start";
import { deriveWorld } from "@/lib/world";
import { termsPrompt, type LegalStatus } from "@/lib/legal/records";
import type { AssessmentState } from "@/lib/assessment/types";
import type { JournalState } from "@/lib/journal/types";
import {
  aiFollowUpAction, appOpenedAction, buildGoalJourneyAction, getAssessmentAction, getJournalAction, getLegalStatusAction, getMilestonesAction, getSnapshotAction, importMomentsAction, saveAnswerAction,
  savePersonalAnswerAction, shareAnswerAction,
} from "@/lib/server/actions";
import { clearDeviceMoments, readDeviceMoments } from "@/lib/store";
import AccountMenu from "./AccountMenu";
import { AiConsentProvider, useAiConsent } from "./AiConsent";
import AssessmentFlow from "./assessment/AssessmentFlow";
import BottomNavigation, { TABS, type Tab } from "./BottomNavigation";
import BerripopCelebration, { type NextStep } from "./berripop/BerripopCelebration";
import BerripopMascot from "./berripop/BerripopMascot";
import { InviteModal, QuestionComposer, Toast } from "./Modals";
import Onboarding from "./Onboarding";
import QuestFlow, { type Draft } from "./QuestFlow";
import QuestionDetail from "./QuestionDetail";
import ReminderPrompt from "./ReminderPrompt";
import PushTimeZoneSync from "./PushTimeZoneSync";
import ScenePrompt from "./ScenePrompt";
import TermsGate from "./TermsGate";
import Welcome from "./Welcome";
import CircleScreen from "./screens/CircleScreen";
import ExploreScreen from "./screens/ExploreScreen";
import HomeScreen from "./screens/HomeScreen";
import InnerWorldScreen from "./screens/InnerWorldScreen";
import JournalScreen from "./journal/JournalScreen";
import JourneyScreen from "./screens/JourneyScreen";
import ProfileScreen from "./screens/ProfileScreen";
import CircleSetup from "./CircleSetup";
import GoalsScreen from "./screens/GoalsScreen";
import type { JourneyMode } from "./screens/types";
import { useRun } from "./useRun";
import Celebration, { type CelebrationItem } from "./Celebration";
import StreakWelcome from "./StreakWelcome";
import { claimStreakWelcome, streakWelcomeKind, type StreakWelcomeKind } from "@/lib/streakWelcome";
import { OfferContext } from "./billing/UpgradePrompt";
import { reportTransactions } from "./billing/AppStorePaywall";
import { appStore, removeListener } from "@/lib/nativeBridge";
import { celebratedKey, freshlyReached, readCelebrated, writeCelebrated, type CelebrationKind } from "@/lib/celebrate";
import { achievementDefs } from "@/lib/domain/rules";
import { milestonesFrom, type MilestoneCounts, type MilestoneId } from "@/lib/milestones";
import type { BadgeId } from "@/lib/progress";

function Splash({ label }: { label: string }) {
  return (
    <div className="splash" aria-busy="true">
      <BerripopMascot size={96} mood="happy" label="Berripop" />
      <span>berripop</span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default function KozosApp() {
  const { isLoaded, isSignedIn } = useAuth();
  const { locale, d } = useI18n();

  // Keep <html lang> and the tab title in the chosen language.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = d.meta.title;
  }, [locale, d]);

  // Signed out inside the phone app (e.g. just after signing out): keep the
  // splash while the server sends the visitor to the app's own welcome.
  if (isLoaded && !isSignedIn && typeof navigator !== "undefined" && isNativeApp(navigator.userAgent)) return <Splash label={d.common.loading} />;
  return !isLoaded ? <Splash label={d.common.loading} /> : isSignedIn ? <SignedInApp /> : <Welcome />;
}

function SignedInApp() {
  const { d, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [legal, setLegal] = useState<LegalStatus | null>(null);
  const localeApplied = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [r, status] = await Promise.all([getSnapshotAction(), getLegalStatusAction()]);
      if (r.ok && status) {
        setSnapshot(r.snapshot);
        setLegal(status);
      } else setFailed(true);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A signed-in member's saved language wins over this device's setting (applied once per load).
  useEffect(() => {
    if (!localeApplied.current && snapshot) {
      localeApplied.current = true;
      const saved = snapshot.me.locale;
      if (isLocale(saved) && saved !== locale) setLocale(saved);
    }
  }, [snapshot, locale]);

  if (failed) {
    return (
      <div className="splash">
        <BerripopMascot size={88} mood="comforting" />
        <p className="muted splash-msg">{d.auth.loadError}</p>
        <button className="btn btn--primary" onClick={load}>{d.auth.retry}</button>
      </div>
    );
  }
  if (!snapshot || !legal) return <Splash label={d.auth.loadingData} />;
  const newMember = !snapshot.circle && !snapshot.me.personalPath;
  const prompt = termsPrompt(legal.terms, newMember);
  const accepted = () => setLegal({ ...legal, terms: "granted" });
  if (newMember) return <div className="app app--onboarding"><Onboarding name={snapshot.me.name} onSnapshot={setSnapshot} terms={prompt === "onboarding" ? { version: legal.termsVersion, onAccepted: accepted } : null} /></div>;
  return (
    <AiConsentProvider initial={legal}>
      <AppShell snapshot={snapshot} setSnapshot={setSnapshot} />
      {prompt === "dialog" && <TermsGate version={legal.termsVersion} context="update" onAccepted={accepted} />}
    </AiConsentProvider>
  );
}

type ActiveQuest = { ref: QuestionRef; context: AnswerContext };

/**
 * The one app every member uses, with or without a circle: Today, goals,
 * journal, journey, inner world and explore are personal; the circle
 * ("Közös út") is the shared layer on top.
 */
function AppShell({ snapshot, setSnapshot }: { snapshot: Snapshot; setSnapshot: (s: Snapshot) => void }) {
  const { d } = useI18n();
  // `?tab=profile` (e.g. returning from the billing portal) opens that tab.
  const [tab, setTab] = useState<Tab>(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    return TABS.find(x => x === wanted) ?? "home";
  });
  const [quest, setQuest] = useState<ActiveQuest | null>(null);
  const [detail, setDetail] = useState<QuestionRef | null>(null);
  const [reward, setReward] = useState<RewardDTO | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [inviteOpen, setInviteOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  const [journal, setJournal] = useState<JournalState | null>(null);
  const [starter, setStarter] = useState<{ prompt: string; id: number } | null>(null);
  const [reflectRequest, setReflectRequest] = useState<{ entryId: string; id: number } | null>(null);
  const [assessment, setAssessment] = useState<AssessmentState | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [journeyMode, setJourneyMode] = useState<JourneyMode>("own");
  const [journeyBuilding, setJourneyBuilding] = useState(false);
  const [askReminder, setAskReminder] = useState(false);

  const view = useMemo(() => buildView(snapshot, d.common.you), [snapshot, d.common.you]);
  const circle = view.circle;

  const notify = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    window.setTimeout(() => setToast(cur => (cur?.id === id ? null : cur)), 2600);
  }, []);
  const run = useRun(setSnapshot, notify);
  const withAiConsent = useAiConsent();

  // Personal milestone counts: read-only, reloaded whenever something may have moved them.
  const [milestoneCounts, setMilestoneCounts] = useState<MilestoneCounts | null | undefined>(undefined);
  const journalCount = journal?.entries.length ?? -1;
  useEffect(() => {
    let live = true;
    getMilestonesAction().then(r => { if (live) setMilestoneCounts(cur => r ?? (cur === undefined ? null : cur)); }).catch(() => { if (live) setMilestoneCounts(cur => (cur === undefined ? null : cur)); });
    return () => { live = false; };
  }, [view.xp, journalCount, tab]);

  // One-time full-screen celebrations for newly reached badges and milestones (remembered per device).
  const [celebrations, setCelebrations] = useState<CelebrationItem[]>([]);
  const rewardBadges = useRef<Set<string>>(new Set());
  const badgeIds = useMemo(() => achievementDefs.filter(a => view.achievementIds.has(a.id)).map(a => a.id), [view.achievementIds]);
  const reachedMilestones = useMemo(
    () => (milestoneCounts ? milestonesFrom(milestoneCounts, view.streak.best).filter(m => m.done).map(m => m.id) : null),
    [milestoneCounts, view.streak.best],
  );
  const meId = view.me.id;
  useEffect(() => {
    const check = (kind: CelebrationKind, ids: string[]) => {
      const key = celebratedKey(meId, kind);
      const { fresh, next } = freshlyReached(readCelebrated(key), ids);
      writeCelebrated(key, next);
      return fresh;
    };
    const fresh: CelebrationItem[] = [
      ...check("badge", badgeIds).map(id => ({ kind: "badge" as const, id: id as BadgeId })),
      ...(reachedMilestones ? check("milestone", reachedMilestones).map(id => ({ kind: "milestone" as const, id: id as MilestoneId })) : []),
    ];
    if (fresh.length) setCelebrations(q => [...q, ...fresh]);
  }, [meId, badgeIds, reachedMilestones]);
  // Badges the answer celebration already shows are not shown a second time.
  useEffect(() => { reward?.newAchievements.forEach(id => rewardBadges.current.add(id)); }, [reward]);
  const nextCelebration = celebrations.find(c => !(c.kind === "badge" && rewardBadges.current.has(c.id)));
  useEffect(() => {
    if (celebrations.length && !nextCelebration) setCelebrations([]);
  }, [celebrations, nextCelebration]);
  const finishCelebration = useCallback(() => {
    setCelebrations(q => {
      const i = q.findIndex(c => !(c.kind === "badge" && rewardBadges.current.has(c.id)));
      return i < 0 ? [] : q.filter((_, j) => j !== i);
    });
  }, []);

  // Once a day, the first time Today is free: Berri greets the member with their spark (or a welcome back).
  const [streakWelcome, setStreakWelcome] = useState<StreakWelcomeKind | null>(null);
  const todayFree = tab === "home" && !askReminder && !quest && !reward && !detail && !nextCelebration && !inviteOpen && !composerOpen;
  useEffect(() => {
    if (!todayFree || !claimStreakWelcome(meId, view.today)) return;
    setStreakWelcome(streakWelcomeKind(view.streak));
  }, [todayFree, meId, view.today, view.streak]);
  const closeStreakWelcome = useCallback(() => setStreakWelcome(null), []);

  const refresh = useCallback(async () => {
    const r = await getSnapshotAction().catch(() => null);
    if (r?.ok) setSnapshot(r.snapshot);
  }, [setSnapshot]);

  // iPhone app: Apple's current subscriptions (and renewals, Ask to Buy approvals,
  // refunds while the app is open) are sent to the server, which verifies them.
  useEffect(() => {
    const store = appStore();
    if (!store) return;
    let live = true;
    const sync = (list: string[]) => {
      if (!list.length) return;
      void reportTransactions(list).then(r => { if (live && r.stored) void refresh(); });
    };
    store.current().then(r => sync(r.transactions)).catch(() => {});
    const handle = store.addListener("transaction", v => sync(v.jws ? [v.jws] : []));
    return () => {
      live = false;
      removeListener(handle);
    };
  }, [refresh]);

  // First steps need the journal (entries, reflections) even before the journal is opened.
  useEffect(() => {
    getJournalAction().then(r => { if (r.ok) setJournal(r.state); }).catch(() => {});
  }, []);

  // A new member starts on Today with the short daily question; the assessment is offered there.
  // One already under way reopens where the member left off (without a circle, until accepted or skipped).
  const hasCircle = !!circle;
  useEffect(() => {
    getAssessmentAction().then(r => {
      if (!r.ok) return;
      setAssessment(r.state);
      const status = r.state.assessment?.status;
      if (status && assessmentOpen(hasCircle, status)) setAssessing(true);
    }).catch(() => {});
    // Only on first load: joining a circle later shouldn't reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Answers from the phone app's first questions are only needed until onboarding; never kept after.
  useEffect(() => { clearStart(); }, []);

  // Counted once a day on the server (retention); never blocks the app.
  useEffect(() => { appOpenedAction().catch(() => {}); }, []);

  // Inner World moments saved on this device move to the account once.
  useEffect(() => {
    const device = readDeviceMoments();
    if (!device.length) return;
    importMomentsAction(device).then(r => {
      if (!r.ok) return;
      clearDeviceMoments();
      setSnapshot(r.snapshot);
    }).catch(() => {});
  }, [setSnapshot]);

  const go = useCallback((next: Tab) => {
    if (next !== "journal") { setStarter(null); setReflectRequest(null); }
    setTab(next);
    window.scrollTo({ top: 0 });
    // Steps and journal entries earn XP outside the snapshot: pick it up when moving on.
    refresh();
  }, [refresh]);

  const openJourney = useCallback((mode: JourneyMode) => {
    setJourneyMode(mode);
    go("journey");
  }, [go]);

  async function buildJourney(quiet = false) {
    if (journeyBuilding) return;
    setJourneyBuilding(true);
    try {
      if (quiet) {
        const r = await buildGoalJourneyAction().catch(() => null);
        if (r?.ok) setSnapshot(r.snapshot);
        // No goals or no AI consent stay quiet; a failed build is said, so they know they can retry.
        else if (!r || r.error === "ai_unavailable") notify(d.journey.buildFailed);
      } else {
        const r = await withAiConsent(() => buildGoalJourneyAction()).catch(() => undefined);
        if (r === undefined) return notify(d.auth.error);
        if (!r || !(await run(Promise.resolve(r)))) return;
        setJourneyMode("own");
        notify(d.journey.built);
      }
    } finally {
      setJourneyBuilding(false);
    }
  }

  async function finishAssessment(s: AssessmentState) {
    setAssessment(s);
    setAssessing(false);
    // One clear next step: Today recommends it (the journey being built, then its first stop).
    setTab("home");
    window.scrollTo({ top: 0 });
    // Accepting created goals: refresh so the snapshot has them.
    await refresh();
    // Then build the journey from those goals in the background (refused quietly if there are none).
    if (s.assessment?.status === "accepted") {
      // In the phone app, the moment the path is ready is when a reminder makes sense.
      if (isNativeApp(navigator.userAgent)) setAskReminder(true);
      buildJourney(true);
    }
  }

  function xpPreview(ref: QuestionRef, context: AnswerContext) {
    if (view.answerFor(ref)) return 0;
    if (context.kind === "daily") return view.dailyDoneByMe ? 0 : XP_RULES.daily;
    if (context.kind === "journey") {
      if (view.myJourney[context.day]) return 0;
      return XP_RULES.daily + (journeyNodes.find(n => n.day === context.day)?.kind === "challenge" ? XP_RULES.weekly : 0);
    }
    if (context.kind === "goal") {
      if (view.goalJourney?.done[context.day]) return 0;
      return XP_RULES.daily + (view.goalJourney?.days.find(x => x.day === context.day)?.kind === "challenge" ? XP_RULES.weekly : 0);
    }
    const bonusRef = circle ? `u:${view.me.id}:bonus:${view.today}` : `bonus:${view.today}`;
    const events = circle ? circle.xp.myEvents : snapshot.progress.xp.events;
    return events.some(e => e.ref === bonusRef) ? 0 : XP_RULES.bonus;
  }

  async function save(draft: Draft, share: boolean) {
    if (!quest) return;
    const fields = { questionRef: quest.ref, text: draft.text, reflection: draft.reflection, reflectionPrompt: draft.prompt, context: quest.context };
    // Goal journey days are the member's own, also in a circle (never shared there).
    const own = !circle || quest.context.kind === "goal";
    const r = await run(own ? savePersonalAnswerAction(fields) : saveAnswerAction({ ...fields, circleId: circle.id, share }));
    if (!r) return;
    const ref = quest.ref;
    setDrafts(prev => {
      const next = { ...prev };
      delete next[ref];
      return next;
    });
    setQuest(null);
    if (r.data) setReward(r.data);
  }

  function nextStepFor(rw: RewardDTO): NextStep {
    const c = d.gamification.celebration;
    if (!circle && assessmentOpen(false, assessment?.assessment?.status ?? null)) {
      return { label: d.today.assessmentTitle, onClick: () => { setReward(null); setAssessing(true); } };
    }
    if (rw.weekCompleted || rw.newAchievements.length > 0) return { label: c.nextWorld, onClick: () => { setReward(null); go("world"); } };
    if (rw.context === "journey") return { label: c.nextJourney, onClick: () => { setReward(null); openJourney(circle ? "shared" : "own"); } };
    if (rw.context === "goal") return { label: c.nextJourney, onClick: () => { setReward(null); openJourney("own"); } };
    if (circle) return { label: c.nextReadTogether, onClick: () => { setReward(null); setDetail(rw.questionRef); } };
    return { label: c.nextJourney, onClick: () => { setReward(null); go("journey"); } };
  }

  const startQuest = (ref: QuestionRef, context: AnswerContext) => {
    setDetail(null);
    setQuest({ ref, context });
  };
  const writeInJournal = (prompt: string) => { setStarter({ prompt, id: Date.now() }); setTab("journal"); };
  const askFeedback = (entryId: string) => { setReflectRequest({ entryId, id: Date.now() }); setTab("journal"); };
  const screenProps = {
    view, run, notify, go, startQuest, openQuestion: setDetail, onInvite: () => setInviteOpen(true),
    journeyMode, openJourney, buildJourney: () => buildJourney(), journeyBuilding,
    assessmentStatus: assessment?.assessment?.status ?? null, openAssessment: () => setAssessing(true),
    writeInJournal, milestoneCounts,
    covered: !!quest || !!reward || !!detail || !!streakWelcome,
  };
  const questQuestion = quest ? view.question(quest.ref) : null;
  const offerRules = useMemo(() => ({ activeDays: new Set(snapshot.progress.activeDates).size, account: snapshot.account, notify }), [snapshot.progress.activeDates, snapshot.account, notify]);

  if (assessing && assessment) {
    return (
      <OfferContext.Provider value={offerRules}>
        <div className="app app--focus">
          <div className="app-topbar"><AccountMenu /></div>
          <main className="screen">
            <AssessmentFlow state={assessment} account={snapshot.account} onState={setAssessment} onFinished={finishAssessment} />
          </main>
        </div>
      </OfferContext.Provider>
    );
  }

  return (
    <OfferContext.Provider value={offerRules}>
    <div className="app">
      <BottomNavigation active={tab} onChange={go} />
      <div className="app-topbar"><AccountMenu /></div>
      <main className="screen" key={tab}>
        {tab === "home" && <HomeScreen {...screenProps} />}
        {tab === "goals" && (
          <GoalsScreen
            account={snapshot.account} assessment={assessment} onAssessment={setAssessment} onResume={() => setAssessing(true)}
            journal={journal} run={run} notify={notify} onWrite={writeInJournal} onFeedback={askFeedback} onTogether={() => go("circle")}
          />
        )}
        {tab === "journal" && <JournalScreen account={snapshot.account} today={view.today} notify={notify} starter={starter} reflectRequest={reflectRequest} onJournalState={setJournal} />}
        {tab === "journey" && <JourneyScreen {...screenProps} />}
        {tab === "world" && <InnerWorldScreen {...screenProps} />}
        {tab === "explore" && <ExploreScreen {...screenProps} onCompose={() => setComposerOpen(true)} />}
        {tab === "circle" && (circle ? <CircleScreen {...screenProps} /> : <TogetherSetup onSnapshot={s => { setSnapshot(s); setTab("circle"); }} />)}
        {tab === "profile" && <ProfileScreen {...screenProps} />}
      </main>

      {detail && !quest && <QuestionDetail {...screenProps} questionRef={detail} onClose={() => setDetail(null)} />}

      {quest && questQuestion && (
        <QuestFlow
          key={quest.ref}
          question={questQuestion}
          context={quest.context}
          existing={view.answerFor(quest.ref)}
          draft={drafts[quest.ref]}
          circleNames={quest.context.kind === "goal" ? [] : view.otherNames}
          xp={xpPreview(quest.ref, quest.context)}
          onDraft={dr => setDrafts(prev => ({ ...prev, [quest.ref]: dr }))}
          onClose={() => setQuest(null)}
          onSave={save}
          ai={{
            account: snapshot.account,
            ask: async text => {
              const r = await withAiConsent(() => aiFollowUpAction({ circleId: circle?.id ?? null, questionRef: quest.ref, answerText: text }));
              if (!r) return null;
              if (r.ok) {
                setSnapshot(r.snapshot);
                return { question: r.question };
              }
              return { error: r.error };
            },
          }}
        />
      )}

      {reward && (
        <BerripopCelebration
          seed={view.today}
          reward={reward}
          next={nextStepFor(reward)}
          canShare={view.otherNames.length > 0}
          onShare={async () => {
            const answer = view.answerFor(reward.questionRef);
            if (!answer) return;
            if (await run(shareAnswerAction(answer.id, true))) {
              setReward({ ...reward, shared: true });
              notify(d.common.sharedToast);
            }
          }}
          onClose={() => { setReward(null); go("home"); }}
          onWorld={() => { setReward(null); go("world"); }}
          world={deriveWorld(view, view.snapshot.progress.moments)}
        />
      )}

      {inviteOpen && circle && <InviteModal view={{ ...view, circle }} run={run} notify={notify} onClose={() => setInviteOpen(false)} />}
      {composerOpen && circle && (
        <QuestionComposer
          circleId={circle.id}
          run={run}
          onClose={() => setComposerOpen(false)}
          onCreated={ref => {
            setComposerOpen(false);
            notify(d.questions.composer.added);
            setDetail(ref);
          }}
        />
      )}
      <PushTimeZoneSync />
      {askReminder && <ReminderPrompt notify={notify} onClose={() => setAskReminder(false)} />}
      {/* Once per account: "New: Berri can move!", on Today when nothing else is open. */}
      {!snapshot.me.scenePicked && todayFree && !streakWelcome && (
        <ScenePrompt current={snapshot.me.scene} run={run} notify={notify} />
      )}
      {streakWelcome && todayFree && (
        <StreakWelcome kind={streakWelcome} streak={view.streak} active={view.facts.myActiveDates} today={view.today} onDone={closeStreakWelcome} />
      )}
      {toast && <Toast key={toast.id} message={toast.message} />}
      {nextCelebration && !quest && !reward && <Celebration key={`${nextCelebration.kind}:${nextCelebration.id}`} item={nextCelebration} onDone={finishCelebration} />}
    </div>
    </OfferContext.Provider>
  );
}

/** Közös út without a circle yet: start one or join with an invite code. Everything personal stays as it is. */
function TogetherSetup({ onSnapshot }: { onSnapshot: (s: Snapshot) => void }) {
  const { d } = useI18n();
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <span className="eyebrow">{d.navigation.circle}</span>
          <h1>{d.onboarding.sharedTitle}</h1>
          <p>{d.personal.togetherIntro}</p>
        </div>
      </header>
      <section className="card stack-sm">
        <BerripopMascot pair mood="curious" size={72} />
        <CircleSetup onSnapshot={onSnapshot} />
      </section>
    </div>
  );
}
