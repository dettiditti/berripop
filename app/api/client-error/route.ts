/*
 * The error screen reports a page crash here, so it shows up in the server
 * logs. Only the error's type, a short message, the first code location and
 * the page path are kept: never the member, their entries or anything typed.
 */
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").slice(0, n) : "");

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.length < 4000) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // Ignored: a bad report is simply dropped.
  }
  const path = clip(body.path, 80).split("?")[0];
  console.warn("client_error", JSON.stringify({ name: clip(body.name, 40), message: clip(body.message, 200), at: clip(body.at, 200), path, app: body.app === true, digest: clip(body.digest, 40) }));
  return new Response(null, { status: 204 });
}
