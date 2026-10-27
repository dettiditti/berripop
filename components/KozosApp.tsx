"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { journeyNodes, XP_RULES } from "@/lib/content";
import type { AnswerContext, QuestionRef, RewardDTO, Snapshot } from "@/lib/domain/types";
import { assessmentOpen } from "@/lib/domain/next";
import { buildView } from "@/lib/domain/view";
import { setLocale, useI18n } from "@/lib/i18n/client";
import { isLocale } from "@/lib/i18n/config";
import type { AssessmentState } from "@/lib/assessment/types";
import type { JournalState } from "@/lib/journal/types";
import {
  aiFollowUpAction, appOpenedAction, buildGoalJourneyAction, getAssessmentAction, getJournalAction, getLegalStatusAction, getSnapshotAction, importMomentsAction, saveAnswerAction,
  savePersonalAnswerAction, shareAnswerAction,
} from "@/lib/server/actions";
import { clearDeviceMoments, readDeviceMoments } from "@/lib/store";
import AccountMenu from "./AccountMenu";
import AssessmentFlow from "./assessment/AssessmentFlow";
import BottomNavigation, { TABS, type Tab } from "./BottomNavigation";
import BerripopCelebration, { type NextStep } from "./berripop/BerripopCelebration";
import BerripopMascot from "./berripop/BerripopMascot";
import { InviteModal, QuestionComposer, Toast } from "./Modals";
import Onboarding from "./Onboarding";
import QuestFlow, { type Draft } from "./QuestFlow";
import QuestionDetail from "./QuestionDetail";
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

  return !isLoaded ? <Splash label={d.common.loading} /> : isSignedIn ? <SignedInApp /> : <Welcome />;
}

function SignedInApp() {
  const { d, locale } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [terms, setTerms] = useState<{ state: string; version: string } | null>(null);
  const localeApplied = useRef(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [r, legal] = await Promise.all([getSnapshotAction(), getLegalStatusAction()]);
      if (r.ok && legal) {
        setSnapshot(r.snapshot);
        setTerms({ state: legal.terms, version: legal.termsVersion });
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
  if (!snapshot || !terms) return <Splash label={d.auth.loadingData} />;
  if (terms.state !== "granted") {
    return <TermsGate version={terms.version} updated={terms.state === "outdated"} onAccepted={() => setTerms({ ...terms, state: "granted" })} />;
  }
  if (!snapshot.circle && !snapshot.me.personalPath) return <Onboarding onSnapshot={setSnapshot} />;
  return <AppShell snapshot={snapshot} setSnapshot={setSnapshot} />;
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

  const view = useMemo(() => buildView(snapshot, d.common.you), [snapshot, d.common.you]);
  const circle = view.circle;

  const notify = useCallback((message: string) => {
    const id = Date.now();
    setToast({ id, message });
    window.setTimeout(() => setToast(cur => (cur?.id === id ? null : cur)), 2600);
  }, []);
  const run = useRun(setSnapshot, notify);

  const refresh = useCallback(async () => {
    const r = await getSnapshotAction().catch(() => null);
    if (r?.ok) setSnapshot(r.snapshot);
  }, [setSnapshot]);

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
      } else if (await run(buildGoalJourneyAction())) {
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
    if (s.assessment?.status === "accepted") buildJourney(true);
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
    if (rw.weekCompleted) return { label: c.nextWorld, onClick: () => { setReward(null); go("world"); } };
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
  };
  const questQuestion = quest ? view.question(quest.ref) : null;

  if (assessing && assessment) {
    return (
      <div className="app app--focus">
        <div className="app-topbar"><AccountMenu /></div>
        <main className="screen">
          <AssessmentFlow state={assessment} account={snapshot.account} onState={setAssessment} onFinished={finishAssessment} />
        </main>
      </div>
    );
  }

  return (
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
              const r = await aiFollowUpAction({ circleId: circle?.id ?? null, questionRef: quest.ref, answerText: text });
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
      {toast && <Toast key={toast.id} message={toast.message} />}
    </div>
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
