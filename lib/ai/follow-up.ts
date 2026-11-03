/**
 * Choosing Berripop's AI follow-up question in the answer flow. The chosen
 * question becomes the answer's reflection prompt (saved as reflectionPrompt),
 * exactly like a built-in prompt chip. Choosing never asks the AI again and
 * never touches the allowance: the question was already generated and paid for.
 */

export type FollowUpDraft = { text: string; reflection: string; prompt: string };

/** Picks the suggestion as the reflection prompt; the answer and any reflection text stay as written. */
export function chooseFollowUp<D extends FollowUpDraft>(draft: D, suggestion: string): D {
  return draft.prompt === suggestion ? draft : { ...draft, prompt: suggestion };
}

/**
 * A reopened draft whose prompt isn't one of the built-in ones carries an AI
 * question chosen earlier: show it again as chosen instead of offering a new
 * (metered) request.
 */
export function restoredSuggestion(prompt: string, builtIn: readonly string[]): string | null {
  return prompt && !builtIn.includes(prompt) ? prompt : null;
}
