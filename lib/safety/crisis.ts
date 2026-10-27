/**
 * The crisis safety route. Two signals decide when the safety card is shown
 * unasked: a keyword check on what the member wrote (here) and the AI's own
 * `safety` flag on a reflection or check-in reply. Both miss things and both
 * can fire when there is no crisis, so the help link is always available as
 * well and the copy never claims that every crisis is recognised.
 */

/** Verified on the services' official pages on 2026-10-27 (112: the EU's official page; 112.gov.hu refused the connection). */
export const HELPLINES = [
  { id: "emergency", number: "112", tel: "112", source: "https://europa.eu/youreurope/citizens/travel/security-and-emergencies/emergency/index_hu.htm" },
  { id: "lelki", number: "116-123", tel: "116123", source: "https://sos116-123.hu/" },
  { id: "kekvonal", number: "116-111", tel: "116111", source: "https://kek-vonal.hu/fiataloknak/116-111" },
] as const;
export type HelplineId = (typeof HELPLINES)[number]["id"];
export const HELPLINES_CHECKED = "2026-10-27";

/** Lowercase, without accents, so "ongyilkos" and "öngyilkos" match alike. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const PATTERNS: RegExp[] = [
  // Hungarian (accents removed)
  /ongyilkos/,
  /meg ?ol(om|ni|ne?m) magam/,
  /vegez(ni|ek|nek) magammal/,
  /nem akarok (mar |tovabb )?elni/,
  /meg akarok halni/,
  /bar(csak)? (mar )?meghalnek/,
  /jobb lenne,? ha (mar )?nem elnek/,
  /nincs (mar )?ertelme (az )?elni/,
  /onsert/,
  /(meg|fel)?vag(om|tam|dosom|dostam) magam/,
  /bantani akarom magam/,
  /veszelyben vagyok/,
  // English
  /suicid/,
  /kill(ing)? myself/,
  /end(ing)? my (own )?life/,
  /(want|wanna) to die/,
  /(don'?t|do not) want to (live|be alive)/,
  /self[- ]?harm/,
  /(cut|cutting|hurt|hurting) myself/,
  /better off dead/,
  /i'?m in danger/,
];

/** True when the text contains a phrase that often signals a crisis. Not a diagnosis, and it misses things. */
export function crisisSignal(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = fold(text);
  return PATTERNS.some(p => p.test(t));
}
