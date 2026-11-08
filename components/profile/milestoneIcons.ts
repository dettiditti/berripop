import {
  BookHeart, BookOpen, Bookmark, CalendarHeart, Flag, Flame, Heart, Medal,
  MessageCircleHeart, Mountain, Palette, PenLine, Rainbow, Smile, Sparkles, Target, Users, type LucideIcon,
} from "lucide-react";
import type { MilestoneId } from "@/lib/milestones";

export const MILESTONE_ICONS: Record<MilestoneId, LucideIcon> = {
  "first-entry": PenLine, "entries-10": BookOpen, "entries-50": BookHeart, "first-sticker": Smile, "all-feelings": Palette,
  "streak-3": Flame, "streak-7": CalendarHeart, "streak-30": Mountain,
  "first-reflection": Sparkles, "kept-insight": Bookmark, "reflections-10": Rainbow,
  "first-circle": Users, "first-answer": MessageCircleHeart, "reactions-5": Heart,
  "first-goal": Target, "first-step": Flag, "goal-week": Medal,
};
