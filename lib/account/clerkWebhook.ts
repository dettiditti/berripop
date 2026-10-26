/**
 * Pure Clerk webhook processing with an injected deletion, so routing is
 * unit-testable without Clerk or a database. Only `user.deleted` matters:
 * a login deleted in the Clerk dashboard (or by the in-app deletion) must not
 * leave the member's data behind.
 */
export type ClerkEvent = { type: string; data: { id?: string | null } };

export type ClerkWebhookDeps = {
  /** Stops renewal and deletes everything stored about the member; safe to repeat. */
  deleteAccount: (userId: string) => Promise<void>;
};

export async function processClerkEvent(event: ClerkEvent, deps: ClerkWebhookDeps): Promise<"deleted" | "ignored"> {
  if (event.type !== "user.deleted" || !event.data.id) return "ignored";
  await deps.deleteAccount(event.data.id);
  return "deleted";
}
