"use client";

import { Compass, Home, Map, NotebookPen, Sparkles, Sprout, User, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import BerripopMascot from "./berripop/BerripopMascot";

export type Tab = "home" | "goals" | "journal" | "journey" | "world" | "explore" | "circle" | "profile";
export const TABS: readonly Tab[] = ["home", "goals", "journal", "journey", "world", "explore", "circle", "profile"];

/** Inner World and Explore are reached from Today on phones; wide screens list every section in the sidebar. */
const items: { id: Tab; icon: LucideIcon; tone: string; desktopOnly?: boolean }[] = [
  { id: "home", icon: Home, tone: "purple" },
  { id: "goals", icon: Sprout, tone: "mint" },
  { id: "journal", icon: NotebookPen, tone: "coral" },
  { id: "journey", icon: Map, tone: "sky" },
  { id: "world", icon: Sparkles, tone: "purple", desktopOnly: true },
  { id: "explore", icon: Compass, tone: "sky", desktopOnly: true },
  { id: "circle", icon: Users, tone: "coral" },
  { id: "profile", icon: User, tone: "sun" },
];

type Props = { active: Tab; onChange: (tab: Tab) => void; dots?: Partial<Record<Tab, boolean>> };

/** Bottom bar on phones; the same nav becomes a compact sidebar on wide screens. */
export default function BottomNavigation({ active, onChange, dots = {} }: Props) {
  const { d } = useI18n();
  return (
    <nav className="app-nav" aria-label={d.navigation.label}>
      <div className="app-nav-brand">
        <BerripopMascot size={40} motion="none" />
        <span>berripop</span>
      </div>
      <ul>
        {items.map(({ id, icon: Icon, tone, desktopOnly }) => {
          const label = d.navigation[id];
          return (
          <li key={id} className={desktopOnly ? "desktop-only" : undefined}>
            <button
              type="button"
              className={`app-nav-item tone-${tone} ${active === id ? "is-active" : ""}`}
              aria-current={active === id ? "page" : undefined}
              aria-label={label}
              onClick={() => onChange(id)}
            >
              <span className="app-nav-icon">
                <Icon size={22} strokeWidth={2.4} />
                {dots[id] && <i className="app-nav-dot" aria-label={d.navigation.newActivity} />}
              </span>
              <span className="app-nav-label">{label}</span>
            </button>
          </li>
          );
        })}
      </ul>
    </nav>
  );
}
