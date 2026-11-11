import { AREAS, type Area } from "../assessment/model";
import { CHECKIN_STATES, type CheckinState } from "../checkin/checkin";
import type { Locale } from "../i18n/config";

/**
 * Berri's thought of the day: short lines in Berri's own voice, written for
 * Berripop (no quotes from other authors, so nothing to attribute or license).
 * Each fits a lock-screen notification (at most 120 characters).
 *
 * Tagging rules (the same for all thoughts, checked by checkThoughtLibrary
 * and the tests, so the library can grow to 300 and beyond):
 * - id: "t" and at least three digits, in order of writing. Never renumbered
 *   or reused, since feedback is stored by id. A retired thought is removed,
 *   and its id stays unused.
 * - category: exactly one theme (THOUGHT_CATEGORIES): what the thought is about.
 * - tone: "warm" or "playful" (humorous, a little cheeky): how it says it.
 *   About one in five should be playful.
 * - areas: 0 to 3 interest areas (lib/assessment/model AREAS, not "other"):
 *   whom it is especially for, by the areas they picked.
 * - moods: 0 to 3 check-in moods (lib/checkin CHECKIN_STATES) it suits.
 * - hu and en: the same thought in both languages, 10 to 120 characters,
 *   no names, numbers or placeholders. Not a quote from anyone else.
 * Every thought takes part in the general daily rotation; areas and moods
 * only matter when the member has personalization on.
 *
 * Personalization uses only those three signals: the areas the member picked,
 * the mood of their optional daily check-in, and their explicit feedback on
 * thoughts. Never the journal, AI reflections or anything else they wrote.
 */

export const THOUGHT_CATEGORIES = ["kindness", "rest", "steps", "courage", "feelings", "together", "noticing", "boundaries", "growth"] as const;
export type ThoughtCategory = (typeof THOUGHT_CATEGORIES)[number];
export const THOUGHT_TONES = ["warm", "playful"] as const;
export type ThoughtTone = (typeof THOUGHT_TONES)[number];

export type Thought = {
  id: string;
  category: ThoughtCategory;
  tone: ThoughtTone;
  /** Interest areas (lib/assessment/model AREAS) this thought speaks to. */
  areas: readonly Area[];
  /** Check-in moods (lib/checkin CHECKIN_STATES) this thought suits. */
  moods: readonly CheckinState[];
  hu: string;
  en: string;
};

const T = (id: string, category: ThoughtCategory, areas: Area[], moods: CheckinState[], hu: string, en: string, tone: ThoughtTone = "warm"): Thought => ({ id, category, tone, areas, moods, hu, en });

const THOUGHTS: readonly Thought[] = [
  T("t001", "steps", ["stress", "habits"], ["tense", "tired"], "Nem kell ma mindent megoldanod. Elég egy apró lépés.", "You don't have to fix everything today. One tiny step is enough."),
  T("t002", "kindness", ["confidence", "selfcare"], ["sad", "mixed"], "Ma is jó vagy úgy, ahogy vagy. A fejlődés csak ráadás.", "You're good as you are today. Growing is just a bonus."),
  T("t003", "rest", ["stress"], ["tense"], "Egy mély levegő is számít. Kezdd azzal.", "One deep breath counts too. Start with that."),
  T("t004", "growth", ["habits", "confidence"], ["mixed", "good"], "A lassú haladás is haladás. Én büszke vagyok rád.", "Slow progress is still progress. I'm proud of you."),
  T("t005", "kindness", ["selfcare", "relationships"], ["tired"], "Ma figyelj egy kicsit magadra is, ne csak mindenki másra.", "Today, look after yourself a little too, not just everyone else."),
  T("t006", "kindness", ["confidence"], [], "Nem kell tökéletesnek lennie. Elég, ha a tiéd.", "It doesn't have to be perfect. It just has to be yours."),
  T("t007", "courage", ["confidence"], ["sad", "mixed"], "Egy rossz nap nem jelenti azt, hogy rossz úton jársz.", "One bad day doesn't mean you're on the wrong path."),
  T("t008", "steps", ["stress", "habits"], ["tense", "mixed"], "Mi az az egy dolog, amitől ma könnyebb lenne?", "What's one thing that would make today a little easier?"),
  T("t009", "kindness", ["selfcare", "confidence"], ["sad"], "Engedd meg magadnak, hogy ma egy kicsit kedvesebb legyél magadhoz.", "Let yourself be a little kinder to yourself today."),
  T("t010", "kindness", ["selfcare", "habits"], ["tired", "good"], "Igyál ma egy pohár vizet. Apróság, de egy bogyó tudja, mennyit számít.", "Drink a glass of water today. Small thing, but a berry knows how much it matters.", "playful"),
  T("t011", "steps", ["habits", "stress"], ["tired"], "Ma elég, ha megpróbálod. A többit majd holnap.", "Today it's enough to try. The rest can wait for tomorrow."),
  T("t012", "feelings", ["selfcare", "communication"], ["sad", "tense", "mixed"], "Az érzéseid nem rosszak. Csak üzennek valamit.", "Your feelings aren't wrong. They're telling you something."),
  T("t013", "noticing", [], ["good", "calm"], "Mire vagy ma hálás? Akár egy jó kávé is megér egy mosolyt.", "What are you grateful for today? Even a good coffee earns a smile.", "playful"),
  T("t014", "kindness", ["confidence", "habits"], ["mixed"], "Nem vagy lemaradva. A saját tempódban haladsz.", "You're not behind. You're moving at your own pace."),
  T("t015", "kindness", ["confidence", "selfcare"], [], "Ma mondj egy jó szót magadnak is.", "Say one kind word to yourself today."),
  T("t016", "rest", ["selfcare", "stress"], ["tired"], "A pihenés nem lustaság. A pihenés is lépés.", "Rest isn't laziness. Resting is a step too."),
  T("t017", "kindness", ["stress", "selfcare"], ["sad", "tense"], "Ha ma nehéz, legyen a cél csak annyi, hogy kedves maradj magadhoz.", "If today is hard, make the goal simply to stay kind to yourself."),
  T("t018", "courage", ["habits"], ["sad", "mixed"], "A tegnap már lement. Ma nem kell bepótolnod semmit, elég, ha itt vagy.", "Yesterday is done. You don't have to make up for anything today. Being here is enough."),
  T("t019", "together", [], ["calm", "mixed"], "Egy kérdés, egy válasz, egy kis tér csak neked. Ennyi elég ma.", "One question, one answer, a little space just for you. That's enough today."),
  T("t020", "courage", ["confidence", "habits"], ["mixed"], "A bátorság néha csak annyi, hogy újra nekifutsz.", "Sometimes courage is just trying again."),
  T("t021", "noticing", ["confidence"], ["good", "mixed"], "Ma vedd észre, mi ment jól. Biztos van ilyen.", "Today, notice what went well. There's surely something."),
  T("t022", "together", ["relationships", "communication", "stress"], ["sad", "tense"], "Nem kell egyedül cipelned mindent. Szólni is ér.", "You don't have to carry everything alone. Asking for help counts."),
  T("t023", "boundaries", ["relationships", "communication"], ["tense", "tired"], "Ha ma valaki túl sokat kér, mondhatod azt is: majd később. Ez is teljes mondat.", "If someone asks too much of you today, \"later\" is a full sentence too."),
  T("t024", "rest", ["stress", "selfcare"], ["tense", "tired"], "Egy perc csend is feltölthet. Próbáld ki ma.", "A minute of quiet can recharge you. Try it today."),
  T("t025", "growth", ["confidence"], ["calm", "good"], "Amit ma megtanulsz magadról, az holnap erőt ad.", "What you learn about yourself today gives you strength tomorrow."),
  T("t026", "kindness", ["confidence", "habits"], ["mixed"], "Ma ne a hibáidat számold, hanem a próbálkozásaidat.", "Today, don't count your mistakes. Count your tries."),
  T("t027", "rest", [], ["tired", "mixed"], "Ha ma semmi nem megy, legalább nyújtózz egy nagyot. Én már háromszor megtettem.", "If nothing's working today, at least have a big stretch. I've done three already.", "playful"),
  T("t028", "growth", ["habits", "confidence"], ["mixed"], "Lehet, hogy ma nem látszik, de nősz. Mint egy kis bokor.", "You may not see it today, but you're growing. Like a little bush."),
  T("t029", "boundaries", ["relationships", "stress"], ["tense", "tired"], "Ma egy dologra mondj nemet, hogy valami másra igent mondhass.", "Say no to one thing today, so you can say yes to something else."),
  T("t030", "steps", ["habits"], [], "Nem kell ma megváltoznod. Elég, ha egy picit jobban figyelsz arra, mire van szükséged.", "You don't have to change today. Just listen a little more closely to what you need."),
  T("t031", "kindness", ["relationships", "selfcare"], ["tired"], "Te is megérdemled azt a türelmet, amit másoknak adsz.", "You deserve the same patience you give others."),
  T("t032", "noticing", ["stress"], ["calm", "tense"], "Ma nézz fel egy pillanatra. Milyen az ég?", "Look up for a moment today. What's the sky like?"),
  T("t033", "noticing", ["confidence"], ["good"], "Ami ma sikerül, az a tiéd. Ünnepeld meg egy kicsit.", "Whatever goes well today is yours. Celebrate it a little."),
  T("t034", "courage", ["habits", "confidence"], ["mixed", "tense"], "Ha ma elakadsz, az nem kudarc. Csak egy hely, ahol egy kicsit megállsz.", "Getting stuck today isn't failing. It's just a spot where you pause for a bit."),
  T("t035", "rest", ["stress"], ["calm", "tense"], "Ma elég, ha jelen vagy. Nem kell sietni sehova.", "Today it's enough to be here. There's no need to rush."),
  T("t036", "feelings", ["relationships", "communication"], ["tense"], "Ha ma valaki idegesít, gondolj rám, ahogy komoly arcot próbálok vágni. Nem megy.", "If someone gets on your nerves today, picture me trying to keep a straight face. I can't.", "playful"),
  T("t037", "courage", ["confidence", "stress"], ["tense"], "Ha ma izgulsz valami miatt, az nem gyengeség. Csak fontos neked.", "If you're nervous about something today, that's not weakness. It just matters to you."),
  T("t038", "together", ["relationships"], ["sad"], "Ha ma magányos vagy: reggelente rád gondolok. Szóval már ketten vagyunk.", "If you feel lonely today: I think of you every morning. So that's two of us already."),
  T("t039", "feelings", ["communication", "selfcare"], ["mixed", "tense"], "Írj le egy gondolatot. Ha leírod, könnyebb lesz megérteni.", "Write down one thought. Once it's written, it's easier to understand."),
  T("t040", "together", [], [], "Ma is itt vagyok veled. Gyere, nézzük meg együtt, mi jön.", "I'm here with you today too. Let's see what comes, together."),
];

export const THOUGHT_COUNT = THOUGHTS.length;

/** Every way a thought breaks the tagging rules above; empty when the library is fine. */
export function checkThoughtLibrary(list: readonly Thought[]): string[] {
  const problems: string[] = [];
  const seen = { id: new Set<string>(), hu: new Set<string>(), en: new Set<string>() };
  let lastNumber = 0;
  for (const t of list) {
    const where = t.id || "(no id)";
    if (!/^t\d{3,}$/.test(t.id)) problems.push(`${where}: id`);
    const n = Number(t.id.slice(1));
    if (!(n > lastNumber)) problems.push(`${where}: ids out of order`);
    lastNumber = n;
    if (seen.id.has(t.id)) problems.push(`${where}: duplicate id`);
    seen.id.add(t.id);
    if (!(THOUGHT_CATEGORIES as readonly string[]).includes(t.category)) problems.push(`${where}: category`);
    if (!(THOUGHT_TONES as readonly string[]).includes(t.tone)) problems.push(`${where}: tone`);
    if (t.areas.length > 3 || new Set(t.areas).size !== t.areas.length || t.areas.some(a => a === "other" || !AREAS.includes(a))) problems.push(`${where}: areas`);
    if (t.moods.length > 3 || new Set(t.moods).size !== t.moods.length || t.moods.some(m => !CHECKIN_STATES.includes(m))) problems.push(`${where}: moods`);
    for (const locale of ["hu", "en"] as const) {
      const text = t[locale];
      if (typeof text !== "string" || text.length < 10 || text.length > 120 || /[{}<>]|\d/.test(text)) problems.push(`${where}: ${locale} text`);
      else if (seen[locale].has(text)) problems.push(`${where}: duplicate ${locale} text`);
      seen[locale].add(text);
    }
  }
  return problems;
}

/** Days since 1970-01-01 for a YYYY-MM-DD date. */
function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const n = Math.floor(Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000);
  return Number.isFinite(n) ? n : 0;
}

const at = <X>(list: readonly X[], n: number): X => list[((n % list.length) + list.length) % list.length];

/** The general thought for a local date: the same for everyone that day. */
export function generalThought(date: string): Thought {
  return at(THOUGHTS, dayNumber(date));
}

/** The only signals personalization may use. Nothing written by the member belongs here. */
export type ThoughtSignals = {
  /** The member's switch; off means everyone's general thought. */
  personalize: boolean;
  /** Interest areas the member picked (start questions / path assessment). */
  areas?: readonly Area[];
  /** The mood of their latest daily check-in, if they gave one recently. */
  mood?: CheckinState | null;
  /** Explicit feedback on thoughts, by thought id. */
  liked?: readonly string[];
  disliked?: readonly string[];
};

/**
 * Picks the day's thought. Without personalization, or without enough to go
 * on, it is the general thought of the day. Otherwise it scores each thought:
 * the check-in mood counts most, then each matching area and a category the
 * member liked; disliked thoughts are never picked, and other thoughts in a
 * disliked category rank lower. The day's pick comes from the best-scoring
 * group, rotating by date, so it stays the same all day and changes daily.
 */
export function pickThought(date: string, s: ThoughtSignals): Thought {
  const disliked = new Set(s.disliked ?? []);
  const general = () => {
    const n = dayNumber(date);
    for (let i = 0; i < THOUGHTS.length; i++) {
      const t = at(THOUGHTS, n + i);
      if (!disliked.has(t.id)) return t;
    }
    return at(THOUGHTS, n);
  };
  if (!s.personalize) return general();
  const areas = new Set<Area>((s.areas ?? []).filter(a => a !== "other"));
  const likedCats = new Set(THOUGHTS.filter(t => s.liked?.includes(t.id)).map(t => t.category));
  const dislikedCats = new Set(THOUGHTS.filter(t => disliked.has(t.id)).map(t => t.category));
  if (!areas.size && !s.mood && !likedCats.size) return general();

  let best = 0;
  let pool: Thought[] = [];
  for (const t of THOUGHTS) {
    if (disliked.has(t.id)) continue;
    let score = 0;
    if (s.mood && t.moods.includes(s.mood)) score += 3;
    score += t.areas.filter(a => areas.has(a)).length;
    if (likedCats.has(t.category)) score += 1;
    if (dislikedCats.has(t.category)) score -= 1;
    if (score > best) { best = score; pool = [t]; }
    else if (score === best && score > 0) pool.push(t);
  }
  return pool.length ? at(pool, dayNumber(date)) : general();
}

/** The morning notification: a fixed title and the day's thought. */
export function thoughtNotification(thought: Thought, locale: Locale): { title: string; body: string } {
  return { title: locale === "hu" ? "Berri mai gondolata 💜" : "Berri's thought for today 💜", body: thought[locale] };
}

/** All thoughts, for tests and reviews. */
export function allThoughts(): readonly Thought[] {
  return THOUGHTS;
}
