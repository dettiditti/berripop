import type { Locale } from "../i18n/config";
import type { SaveLabels } from "./core";
import type { MapBranchId, ThoughtError, ViewpointId } from "./types";

/** Gondolatboncoló copy, Hungarian and English. Kept beside the feature so the main dictionaries stay as they are. */
type Copy = {
  name: string;
  short: string;
  intro: string;
  explain: string;
  cta: string;
  quota: (n: number) => string;
  quotaEmpty: string;
  /** One-time allowance (Free, trial): no monthly reset. */
  quotaOnce: (n: number) => string;
  quotaOnceEmpty: string;
  premiumBadge: string;
  viewpointsTitle: string;
  freeViewpointsNote: string;
  viewpoints: Record<ViewpointId, { label: string; short: string }>;
  past: { title: string; empty: string; done: string; resume: (d: number, t: number) => string; fromEntry: string; safety: string };
  compose: { title: string; hint: string; placeholder: string; fromEntry: string; start: string; note: string };
  chat: {
    pause: string; thinking: string; placeholder: string; send: string; skip: string; progress: (d: number, t: number) => string;
    morePremium: string; toSummary: string; summarizing: string; retry: string; failedTitle: string; failedBody: string; turnLimit: string;
  };
  result: { done: string; summaryTab: string; mapTab: string; problem: string; stepNote: string; disclaimer: string; continue: string; mapLocked: string; delete: string; deleteConfirm: string; deleteYes: string; back: string };
  sections: SaveLabels["sections"];
  branches: Record<MapBranchId, string>;
  save: { button: string; saved: string; title: string; body: string; summary: string; map: string; transcript: string; confirm: string; cancel: string; done: string; labels: SaveLabels };
  paywall: { title: string; body: string; cta: string; later: string; resets: (date: string) => string; once: string };
  patterns: { title: string; lockedBody: string; optIn: string; optInHint: string; run: string; running: string; notEnough: string; disclaimer: string };
  safety: { title: string; body: string; back: string };
  entryCta: string;
  close: string;
  privateBadge: string;
  errors: Partial<Record<ThoughtError, string>> & { generic: string };
};

const hu: Copy = {
  name: "Gondolatboncoló",
  short: "Segít több oldalról megvizsgálni egy problémát.",
  intro: "Van valami, ami nem hagy nyugodni? Nézzünk rá több oldalról! 💜",
  explain: "Egyszerre egy kérdést teszek fel. Nem mondom meg, mit csinálj, és nem ítélkezem. A végén kapsz egy összefoglalót és egy gondolattérképet.",
  cta: "Kezdjük",
  quota: n => `Ebben a hónapban még ${n} gondolatboncolásod van.`,
  quotaEmpty: "Ebben a hónapban elfogytak az ingyenes gondolatboncolásaid.",
  quotaOnce: n => (n === 1 ? "Egy ingyenes gondolatboncolásod van." : `Még ${n} ingyenes gondolatboncolásod van.`),
  quotaOnceEmpty: "Az ingyenes gondolatboncolásodat már felhasználtad.",
  premiumBadge: "Premium",
  viewpointsTitle: "Ezekből a nézőpontokból nézünk rá",
  freeViewpointsNote: "Ingyenesen Berri a problémádhoz leginkább illő 3–4 nézőpontot választja ki.",
  viewpoints: {
    own: { label: "A te nézőpontod", short: "Te" },
    other: { label: "A másik fél nézőpontja", short: "Másik fél" },
    facts: { label: "Tények és feltételezések", short: "Tények" },
    beneath: { label: "Mögöttes gondolatok", short: "Mögötte" },
    alternatives: { label: "Alternatív nézőpontok", short: "Más szemmel" },
    next: { label: "Mit kezdhetsz vele?", short: "Lépés" },
  },
  past: { title: "Korábbi gondolatboncolások", empty: "Még nincs korábbi gondolatboncolásod.", done: "Kész", resume: (d, t) => `Folytatható · ${d}/${t}`, fromEntry: "naplóbejegyzésből", safety: "Megállítva" },
  compose: {
    title: "Mi nem hagy nyugodni?",
    hint: "Írd le pár mondatban, a saját szavaiddal. Nem kell szépen fogalmazni.",
    placeholder: "Például: A barátaim elmentek hétvégén egy programra, és engem nem hívtak…",
    fromEntry: "Ezt a szöveget a naplóbejegyzésedből vettem át. Átírhatod vagy rövidítheted, mielőtt elkezdjük.",
    start: "Kezdjük",
    note: "A szöveget Berri AI segítségével dolgozza fel, csak most, amikor elindítod. A beszélgetést titkosítva elmentjük, hogy később folytathasd; bármikor törölheted. Berri nem állít fel diagnózist, és nem helyettesít szakembert.",
  },
  chat: {
    pause: "Szünet, később folytatom",
    thinking: "Berri gondolkodik",
    placeholder: "Írd le a saját szavaiddal…",
    send: "Küldés",
    skip: "Ezt most kihagyom",
    progress: (d, t) => `${d}/${t} nézőpont`,
    morePremium: "Premiummal mind a 6",
    toSummary: "Összefoglaló és gondolattérkép",
    summarizing: "Berri összeszedi, amit kibontottatok…",
    retry: "Újra",
    failedTitle: "Most nem értem el a választ.",
    failedBody: "A válaszod megmaradt, nem kell újraírnod.",
    turnLimit: "Ennyi kör fér bele ebbe a gondolatboncolásba. Készítsük el az összefoglalót!",
  },
  result: {
    done: "Elkészült", summaryTab: "Összefoglaló", mapTab: "Gondolattérkép", problem: "A probléma",
    stepNote: "Csak egy lehetőség. Te döntöd el, kell-e bármit tenned.",
    disclaimer: "Az összefoglalót Berri AI segítségével készítette a beszélgetésetekből. Tévedhet, és nem helyettesít szakembert.",
    continue: "Folytatom a beszélgetést", mapLocked: "Részletes térkép Premiummal",
    delete: "Törlés", deleteConfirm: "Törlöd ezt a gondolatboncolást? Ez nem vonható vissza.", deleteYes: "Igen, törlöm", back: "Gondolatboncoló",
  },
  sections: {
    known: "Amit biztosan tudunk", feel: "Amit érzel", assume: "Amit feltételezel", alternatives: "Más lehetséges magyarázatok",
    consider: "Amit érdemes átgondolnod", nextSteps: "Egy lehetséges következő lépés", open: "Nyitva maradt kérdések",
  },
  branches: { feelings: "Érzések", facts: "Tények", assumptions: "Feltételezések", alternatives: "Más magyarázatok", insights: "Felismerések", steps: "Következő lépések" },
  save: {
    button: "Mentés a naplóba", saved: "A naplódban", title: "Mit mentsek a naplódba?",
    body: "Csak azt mentem el, amit kiválasztasz, egy új naplóbejegyzésbe.",
    summary: "Összefoglaló", map: "Gondolattérkép", transcript: "Teljes beszélgetés", confirm: "Mentés", cancel: "Mégse", done: "Elmentve a naplódba 💜",
    labels: {
      title: "Gondolatboncolás",
      sections: {
        known: "Amit biztosan tudunk", feel: "Amit érzel", assume: "Amit feltételezel", alternatives: "Más lehetséges magyarázatok",
        consider: "Amit érdemes átgondolnod", nextSteps: "Egy lehetséges következő lépés", open: "Nyitva maradt kérdések",
      },
      branches: { feelings: "Érzések", facts: "Tények", assumptions: "Feltételezések", alternatives: "Más magyarázatok", insights: "Felismerések", steps: "Következő lépések" },
      map: "Gondolattérkép", transcript: "A beszélgetés", you: "Én", berri: "Berri", skipped: "(kihagytam)",
    },
  },
  paywall: {
    title: "Van még mit kibontanunk? 💜",
    body: "A Premium segítségével mélyebbre áshatsz, összekapcsolhatod korábbi gondolataidat, és részletesebb felismerésekhez juthatsz.",
    cta: "Megnézem a Premiumot", later: "Most nem", resets: date => `A következő ingyenes alkalmak ${date}-án/-én nyílnak meg.`,
    once: "Az ingyenes alkalom egyszer jár. A Premiummal havonta több gondolatboncolásod lehet.",
  },
  patterns: {
    title: "Visszatérő minták",
    lockedBody: "Premiummal Berri a korábbi gondolatboncolásaidat is összekapcsolhatja, és megmutatja, mi tér vissza bennük.",
    optIn: "Korábbi gondolatboncolásaim figyelembevétele",
    optInHint: "Csak erre a kérésre. Ilyenkor a korábbi összefoglalóid is az AI-hoz kerülnek.",
    run: "Mit látsz bennük?", running: "Berri átnézi…", notEnough: "Ehhez legalább két befejezett gondolatboncolás kell.",
    disclaimer: "Ezek csak lehetőségek, nem megállapítások. Semmi nem mentődik el belőlük.",
  },
  safety: {
    title: "Úgy hallom, most nagyon nehéz.",
    body: "Ezt a beszélgetést itt megállítom, mert ennél fontosabb, hogy biztonságban legyél. Nem vagy egyedül, most is van, aki meghallgat.",
    back: "Vissza",
  },
  entryCta: "Ezt szeretném jobban megérteni",
  close: "Bezárás",
  privateBadge: "Csak te látod",
  errors: {
    generic: "Valami nem sikerült. Próbáld újra!",
    busy: "Berri még az előzőn dolgozik. Egy pillanat!",
    invalid: "Írj legalább pár szót.",
    not_found: "Ez a gondolatboncolás már nem található.",
    ai_unavailable: "Berri most nem érhető el. A szöveged megmaradt; próbáld újra kicsit később.",
    ai_consent_required: "Ehhez az AI-funkciók engedélyezése szükséges.",
    turn_limit: "Ennyi kör fér bele ebbe a gondolatboncolásba. Készítsük el az összefoglalót!",
    premium_required: "Ez a Premium része.",
    disabled: "A Gondolatboncoló most nem érhető el.",
  },
};

const en: Copy = {
  name: "Thought dissector",
  short: "Helps you look at a problem from several sides.",
  intro: "Is something on your mind that won't let go? Let's look at it from several sides! 💜",
  explain: "I'll ask one question at a time. I won't tell you what to do and I won't judge. At the end you get a summary and a thought map.",
  cta: "Let's start",
  quota: n => `You have ${n} thought ${n === 1 ? "session" : "sessions"} left this month.`,
  quotaEmpty: "You've used this month's free sessions.",
  quotaOnce: n => (n === 1 ? "You have one free thought session." : `You have ${n} free thought sessions left.`),
  quotaOnceEmpty: "You've used your free thought session.",
  premiumBadge: "Premium",
  viewpointsTitle: "The viewpoints we'll use",
  freeViewpointsNote: "On the free plan Berri picks the 3–4 viewpoints that fit your problem best.",
  viewpoints: {
    own: { label: "Your viewpoint", short: "You" },
    other: { label: "The other side's viewpoint", short: "Other side" },
    facts: { label: "Facts and assumptions", short: "Facts" },
    beneath: { label: "Underlying thoughts", short: "Beneath" },
    alternatives: { label: "Alternative viewpoints", short: "Other eyes" },
    next: { label: "What can you do with it?", short: "Step" },
  },
  past: { title: "Earlier sessions", empty: "No earlier sessions yet.", done: "Done", resume: (d, t) => `Continue · ${d}/${t}`, fromEntry: "from a journal entry", safety: "Stopped" },
  compose: {
    title: "What's on your mind?",
    hint: "Write a few sentences in your own words. It doesn't have to be polished.",
    placeholder: "For example: My friends went out at the weekend and didn't invite me…",
    fromEntry: "I took this text from your journal entry. You can edit or shorten it before we start.",
    start: "Let's start",
    note: "Berri processes the text with AI, only now that you start. The conversation is stored encrypted so you can continue later; you can delete it any time. Berri does not diagnose and is no substitute for a professional.",
  },
  chat: {
    pause: "Pause, continue later", thinking: "Berri is thinking", placeholder: "In your own words…", send: "Send", skip: "Skip this one",
    progress: (d, t) => `${d}/${t} viewpoints`, morePremium: "All 6 with Premium", toSummary: "Summary and thought map",
    summarizing: "Berri is pulling together what you explored…", retry: "Retry", failedTitle: "I couldn't get a reply just now.",
    failedBody: "Your answer is kept; no need to type it again.", turnLimit: "That's all the rounds this session has. Let's make the summary!",
  },
  result: {
    done: "Done", summaryTab: "Summary", mapTab: "Thought map", problem: "The problem",
    stepNote: "Just a possibility. You decide whether to do anything.",
    disclaimer: "Berri made this summary with AI from your conversation. It can be wrong and is no substitute for a professional.",
    continue: "Continue the conversation", mapLocked: "Detailed map with Premium",
    delete: "Delete", deleteConfirm: "Delete this session? This can't be undone.", deleteYes: "Yes, delete", back: "Thought dissector",
  },
  sections: {
    known: "What we know for sure", feel: "What you feel", assume: "What you assume", alternatives: "Other possible explanations",
    consider: "Worth thinking about", nextSteps: "A possible next step", open: "Open questions",
  },
  branches: { feelings: "Feelings", facts: "Facts", assumptions: "Assumptions", alternatives: "Other explanations", insights: "Insights", steps: "Next steps" },
  save: {
    button: "Save to journal", saved: "In your journal", title: "What should I save to your journal?",
    body: "Only what you choose, as a new journal entry.",
    summary: "Summary", map: "Thought map", transcript: "Full conversation", confirm: "Save", cancel: "Cancel", done: "Saved to your journal 💜",
    labels: {
      title: "Thought session",
      sections: {
        known: "What we know for sure", feel: "What you feel", assume: "What you assume", alternatives: "Other possible explanations",
        consider: "Worth thinking about", nextSteps: "A possible next step", open: "Open questions",
      },
      branches: { feelings: "Feelings", facts: "Facts", assumptions: "Assumptions", alternatives: "Other explanations", insights: "Insights", steps: "Next steps" },
      map: "Thought map", transcript: "The conversation", you: "Me", berri: "Berri", skipped: "(skipped)",
    },
  },
  paywall: {
    title: "Still more to unpack? 💜",
    body: "With Premium you can dig deeper, connect your earlier thoughts and reach more detailed insights.",
    cta: "See Premium", later: "Not now", resets: date => `Your next free sessions open on ${date}.`,
    once: "The free session is a one-off. With Premium you get several sessions every month.",
  },
  patterns: {
    title: "Recurring patterns",
    lockedBody: "With Premium Berri can connect your earlier sessions and show what keeps coming back.",
    optIn: "Use my earlier sessions",
    optInHint: "For this request only. Your earlier summaries are then sent to the AI too.",
    run: "What do you see in them?", running: "Berri is looking…", notEnough: "This needs at least two finished sessions.",
    disclaimer: "These are possibilities, not findings. Nothing from them is saved.",
  },
  safety: {
    title: "It sounds like things are really hard right now.",
    body: "I'm stopping this conversation here, because your safety matters more. You're not alone; someone can listen right now.",
    back: "Back",
  },
  entryCta: "I'd like to understand this better",
  close: "Close",
  privateBadge: "Only you",
  errors: {
    generic: "Something went wrong. Please try again.",
    busy: "Berri is still working on the last one. One moment!",
    invalid: "Write at least a few words.",
    not_found: "This session can't be found anymore.",
    ai_unavailable: "Berri isn't reachable right now. Your text is kept; try again a little later.",
    ai_consent_required: "This needs the AI features to be allowed.",
    turn_limit: "That's all the rounds this session has. Let's make the summary!",
    premium_required: "This is part of Premium.",
    disabled: "The thought dissector isn't available right now.",
  },
};

export const THOUGHT_COPY: Record<Locale, Copy> = { hu, en };
