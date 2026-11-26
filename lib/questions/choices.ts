/**
 * Answers to button and 1-10 scale questions are saved as text: the chosen button,
 * then " – " and any words the member added (encrypted like every answer).
 */
/** "kiállok – mert…" → ["kiállok", "mert…"]; text that does not start with a choice stays as written. */
export function splitChoice(text: string, choices: string[] | null): [string, string] {
  for (const c of choices ?? []) {
    if (text === c) return [c, ""];
    if (text.startsWith(`${c} – `)) return [c, text.slice(c.length + 3)];
  }
  return ["", text];
}
