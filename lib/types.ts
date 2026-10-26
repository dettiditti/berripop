export type CategoryId =
  | "emotions"
  | "needs"
  | "strengths"
  | "listening"
  | "communication"
  | "understanding"
  | "boundaries"
  | "self-compassion"
  | "intentions"
  | "playful"
  | "confidence"
  | "friendship"
  | "curiosity"
  | "gratitude";

export type Tone = "purple" | "coral" | "mint" | "sun" | "sky";

/** Story-like quest themes shown to people (topics/categories stay for badges). */
export type QuestTheme = "discover" | "feel" | "connect" | "recharge" | "grow";

/**
 * Built-in questions carry no text: it comes from the i18n dictionaries by id.
 * Custom questions keep the author's original `text` in every language.
 */
export type Question = {
  id: string;
  category: CategoryId;
  minutes: number;
  source: "journey" | "library" | "custom" | "goal";
  theme: QuestTheme;
  text?: string;
  /** Optional deeper questions that come with a custom or goal-journey question. */
  prompts?: string[];
};

/**
 * A private "moment" from My Inner World: words someone picked or wrote for
 * how they feel, plus an optional note. Never shared and never scored.
 */
export type Moment = {
  id: string;
  date: string;
  createdAt: number;
  /** Built-in feeling word ids (translated in the UI). */
  words: string[];
  /** Words the person wrote themselves, kept as written. */
  ownWords: string[];
  /** Optional companion prompt id the note answers. */
  promptId: string | null;
  note: string;
};

export type JourneyNode = {
  id: string;
  day: number;
  week: number;
  chapter: number;
  kind: "quest" | "challenge";
  questionId: string;
};

export type Week = {
  week: number;
  tone: Tone;
};

export type QuestKind = "daily" | "bonus";
