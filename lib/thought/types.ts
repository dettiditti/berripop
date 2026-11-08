/**
 * Gondolatboncoló (thought dissector): shared types. Pure, no server imports,
 * so client components, the server and tests can all use them.
 */

export const VIEWPOINT_IDS = ["own", "other", "facts", "beneath", "alternatives", "next"] as const;
export type ViewpointId = (typeof VIEWPOINT_IDS)[number];
export const isViewpointId = (v: unknown): v is ViewpointId => typeof v === "string" && (VIEWPOINT_IDS as readonly string[]).includes(v);

export type ThoughtStatus = "draft" | "starting" | "active" | "completed" | "safety_stop";

export type ThoughtMessage = {
  role: "user" | "berri";
  text: string;
  /** The viewpoint this message belongs to (null: the opening problem or the closing line). */
  viewpoint: ViewpointId | null;
  /** True for a skipped viewpoint (the user chose not to answer). */
  skipped?: boolean;
  at: string;
};

export type ThoughtSummary = {
  v: 1;
  known: string[];
  feel: string[];
  assume: string[];
  alternatives: string[];
  consider: string[];
  nextSteps: string[];
  open: string[];
};

export type MapBranchId = "feelings" | "facts" | "assumptions" | "alternatives" | "insights" | "steps";
export const MAP_BRANCHES: MapBranchId[] = ["feelings", "facts", "assumptions", "alternatives", "insights", "steps"];

export type ThoughtMap = {
  v: 1;
  center: string;
  branches: { id: MapBranchId; items: string[] }[];
};

/** What the client receives for one session. */
export type ThoughtSessionDTO = {
  id: string;
  status: ThoughtStatus;
  problem: string;
  journalEntryId: string | null;
  messages: ThoughtMessage[];
  viewpoints: ViewpointId[];
  done: ViewpointId[];
  current: ViewpointId | null;
  /** All viewpoints are done (or the turn cap is near): the summary can be made. */
  readyForSummary: boolean;
  turnsLeft: number;
  summary: ThoughtSummary | null;
  map: ThoughtMap | null;
  savedEntryId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ThoughtListItem = {
  id: string;
  title: string;
  status: ThoughtStatus;
  done: number;
  total: number;
  fromEntry: boolean;
  updatedAt: string;
};

export type ThoughtQuota = { used: number; limit: number; remaining: number; resets: string };

export type ThoughtState = {
  enabled: boolean;
  aiConfigured: boolean;
  plan: "free" | "premium" | "premium_plus";
  deep: boolean;
  viewpointCount: number;
  quota: ThoughtQuota;
  sessions: ThoughtListItem[];
};

export type ThoughtError =
  | "unauthorized" | "disabled" | "invalid" | "not_found" | "busy" | "quota_exhausted" | "turn_limit"
  | "premium_required" | "limit_ai" | "ai_unavailable" | "ai_consent_required" | "not_ready";

export type ThoughtResult<T = undefined> = { ok: true; data: T; safety?: boolean } | { ok: false; error: ThoughtError; safety?: boolean };
