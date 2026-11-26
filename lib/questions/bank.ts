/**
 * The question bank (zz-kerdesrendszer-koncepcio.md, section 4): 133 questions in 9 themes.
 * Text lives in the dictionaries (lib/i18n/dictionaries/bank), keyed by these ids.
 * Generated from the reviewed concept; edit there first, then here.
 */

export type BankTheme = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

export type BankQuestion = {
  id: string;
  theme: BankTheme;
  /** e.g. "A1": the subtheme, for rotation and repetition rules. */
  subtheme: string;
  /** 1 a moment, 2 a pattern, 3 deeper; null for follow-up-only questions without a level. */
  depth: 1 | 2 | 3 | null;
  /** Can go out in a shared circle. */
  circleSafe: boolean;
  /** A resource, good-moment or exception question. */
  resource: boolean;
  /** Only ever asked as a follow-up, never on its own. */
  followUpOnly: boolean;
  sensitivity: "light" | "medium" | "deep";
  /** Questions with the same intent; at most one of a family on the journey. */
  family?: string;
  /** Answer buttons (text in the dictionaries) or a 1-10 scale. */
  choices?: "buttons" | "scale";
  /** Only inside a guided sequence, only on the member's own choice, or only as a low-intensity exercise. */
  only?: "sequence" | "ownChoice" | "exercise";
  /** Never shown when there is a sign of abuse (concept 8.3). */
  hideOnAbuse?: boolean;
};

const q = (id: string, depth: BankQuestion["depth"], flags: Partial<Omit<BankQuestion, "id" | "theme" | "subtheme" | "depth">> = {}): BankQuestion => ({
  id, theme: id[0] as BankTheme, subtheme: id.slice(0, 2), depth,
  circleSafe: false, resource: false, followUpOnly: false, sensitivity: "light", ...flags,
});

export const bankQuestions: BankQuestion[] = [
  q("A1.1", 1, { circleSafe: true }),
  q("A1.2", 1),
  q("A1.3", 1, { circleSafe: true }),
  q("A1.4", 2),
  q("A1.5", 1, { circleSafe: true, resource: true, family: "calm-safe" }),
  q("A1.6", 1, { circleSafe: true, resource: true, family: "small-joy" }),
  q("A1.7", 2, { resource: true }),
  q("A2.1", 2),
  q("A2.2", 2),
  q("A2.3", 3, { sensitivity: "medium" }),
  q("A3.1", 1),
  q("A3.2", 2),
  q("A3.3", 2),
  q("A4.1", 1, { circleSafe: true }),
  q("A4.2", 2),
  q("A5.1", 1),
  q("A5.2", 1, { circleSafe: true, resource: true, family: "hard-day" }),
  q("A5.3", 2),
  q("A5.4", null, { followUpOnly: true, only: "exercise" }),
  q("B1.1", 1, { circleSafe: true }),
  q("B1.2", 2),
  q("B1.3", 2),
  q("B1.4", 1, { circleSafe: true, resource: true }),
  q("B2.1", 1, { circleSafe: true }),
  q("B2.2", 2),
  q("B2.3", 2),
  q("B3.1", 2),
  q("B3.2", 3, { followUpOnly: true, sensitivity: "medium" }),
  q("B3.3", 2),
  q("B4.1", 2, { family: "true-self" }),
  q("B4.2", 2),
  q("C1.1", 1, { family: "inner-voice" }),
  q("C1.2", 2),
  q("C1.3", null, { followUpOnly: true, family: "friend-lens" }),
  q("C1.4", 1, { circleSafe: true, resource: true }),
  q("C2.1", 1),
  q("C2.2", 2),
  q("C2.3", 2, { resource: true }),
  q("C3.1", 2),
  q("C3.2", 3, { sensitivity: "deep" }),
  q("C3.3", null, { followUpOnly: true }),
  q("C4.1", 1, { family: "inner-voice" }),
  q("C4.2", 2, { resource: true }),
  q("C4.3", 2, { family: "friend-lens" }),
  q("C5.1", 1, { circleSafe: true, resource: true, family: "proud" }),
  q("C5.2", 2, { resource: true }),
  q("C5.3", 2),
  q("C5.4", 1, { circleSafe: true, resource: true, family: "proud" }),
  q("D1.1", 1),
  q("D1.2", 2, { resource: true }),
  q("D1.3", 2, { resource: true }),
  q("D2.1", 1),
  q("D2.2", null, { followUpOnly: true }),
  q("D2.3", null, { followUpOnly: true }),
  q("D2.4", 2),
  q("D2.5", null, { followUpOnly: true, family: "friend-lens" }),
  q("D3.1", 1),
  q("D3.2", null, { followUpOnly: true }),
  q("D3.3", 3, { followUpOnly: true, sensitivity: "medium" }),
  q("D4.1", null, { followUpOnly: true }),
  q("D4.2", null, { followUpOnly: true, family: "friend-lens" }),
  q("D4.3", null, { followUpOnly: true }),
  q("D4.4", 2, { resource: true, family: "hard-day" }),
  q("E1.1", 1),
  q("E1.2", 2),
  q("E1.3", 2),
  q("E1.4", 1, { resource: true }),
  q("E2.1", 2),
  q("E2.2", 2),
  q("E2.3", 2),
  q("E2.4", 3, { sensitivity: "medium" }),
  q("E3.1", 1),
  q("E3.2", 2),
  q("E3.3", 1),
  q("E4.1", 1),
  q("E4.2", 2),
  q("E4.3", null, { followUpOnly: true }),
  q("E4.4", 1, { resource: true }),
  q("E5.1", 1),
  q("E5.2", 2),
  q("E5.3", 2, { choices: "buttons" }),
  q("E5.4", null, { followUpOnly: true }),
  q("E6.1", 2),
  q("E6.2", 3, { followUpOnly: true, sensitivity: "medium", hideOnAbuse: true }),
  q("E6.3", 2, { resource: true }),
  q("E6.4", 2, { resource: true }),
  q("F1.1", 1, { family: "say-no" }),
  q("F1.2", null, { followUpOnly: true }),
  q("F1.3", null, { followUpOnly: true }),
  q("F1.4", 1, { resource: true, family: "say-no" }),
  q("F2.1", 1),
  q("F2.2", 2),
  q("F2.3", 2, { resource: true }),
  q("F3.1", 1),
  q("F3.2", 2),
  q("F3.3", 2),
  q("F4.1", 1, { circleSafe: true, choices: "buttons" }),
  q("F4.2", 2),
  q("G1.1", 2),
  q("G1.2", 2),
  q("G1.3", 3, { sensitivity: "deep" }),
  q("G2.1", 2),
  q("G2.2", 3, { sensitivity: "deep", only: "sequence" }),
  q("G2.3", 3, { sensitivity: "deep" }),
  q("G3.1", 2),
  q("G3.2", null, { followUpOnly: true }),
  q("G3.3", 3, { followUpOnly: true, sensitivity: "deep" }),
  q("G4.1", 1, { resource: true }),
  q("G4.2", 1, { resource: true }),
  q("G4.3", 2, { resource: true, only: "ownChoice" }),
  q("G4.4", 1, { resource: true }),
  q("G4.5", 1, { resource: true }),
  q("H1.1", 1, { circleSafe: true, resource: true }),
  q("H1.2", 2, { circleSafe: true }),
  q("H1.3", 2),
  q("H1.4", 2, { choices: "scale" }),
  q("H1.5", null, { followUpOnly: true }),
  q("H2.1", 2),
  q("H2.2", 2),
  q("H3.1", 1),
  q("H3.2", null, { followUpOnly: true }),
  q("H3.3", null, { followUpOnly: true }),
  q("H3.4", 2),
  q("H4.1", 1, { circleSafe: true }),
  q("H4.2", null, { followUpOnly: true }),
  q("I1.1", 1, { circleSafe: true, resource: true, family: "true-self" }),
  q("I2.1", 1, { circleSafe: true, resource: true }),
  q("I2.2", 1, { circleSafe: true, resource: true, family: "small-joy" }),
  q("I2.3", 1, { circleSafe: true, resource: true, family: "small-joy" }),
  q("I3.1", 1, { circleSafe: true, resource: true, family: "calm-safe" }),
  q("I3.2", 2, { circleSafe: true, resource: true, family: "hard-day" }),
  q("I4.1", 1, { circleSafe: true, resource: true }),
  q("I4.2", 2, { circleSafe: true, resource: true }),
];

export const bankQuestion = (id: string) => bankQuestions.find(b => b.id === id);

/**
 * The 63-day journey (zz-63-napos-ut.md): the bank question for each day, and the
 * challenge on every seventh day. Challenges keep their old ids where the text
 * did not change (k42 is the rewritten day 42).
 */
export const journeyPlan: string[] = [
  "A1.1", "I2.1", "B1.1", "H1.1", "C5.1", "A1.5", "j07",
  "E1.1", "B1.3", "E4.1", "E3.1", "E4.4", "C2.1", "j14",
  "I4.1", "F1.1", "F2.1", "F4.1", "H4.1", "E6.4", "j21",
  "C1.1", "C4.2", "A5.1", "C1.4", "C2.3", "I2.2", "j28",
  "A4.1", "A5.3", "A1.2", "A2.1", "A1.7", "E4.2", "j35",
  "G4.5", "H3.1", "G4.2", "F3.1", "H3.4", "H2.1", "k42",
  "A1.3", "D2.1", "C5.2", "I1.1", "D1.3", "D2.4", "j49",
  "E2.2", "F2.3", "E5.1", "E6.3", "E3.2", "E1.4", "j56",
  "I4.2", "H2.2", "H1.4", "D4.4", "H1.3", "B1.4", "j63",
];

/** Challenge days that also offer a thinking-it-through version (text: `journey.challengeAlt`). */
export const CHALLENGE_ALT_DAYS = [14, 35, 42, 49, 56] as const;
