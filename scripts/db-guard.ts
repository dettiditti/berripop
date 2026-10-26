/**
 * Refuses to touch a remote database unless ALLOW_PRODUCTION_DB=1 is set.
 * Berripop has one shared Neon database, so any remote DATABASE_URL is
 * production. Import it first in a script that writes data, or run it before
 * a command (the db:migrate script does). Never prints the connection string.
 *
 *   ALLOW_PRODUCTION_DB=1 npm run verify:shared
 */
import { basename } from "path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LOCAL_HOSTS.has(host) || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

const script = basename(process.argv[1] ?? "script");
const what = script.startsWith("db-guard") ? (process.argv[2] ?? "this command") : script;
const urls = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter((u): u is string => !!u);

if (urls.length === 0) {
  console.error(`Refusing to run ${what}: DATABASE_URL is not set.`);
  process.exit(1);
}
if (!urls.every(isLocal) && process.env.ALLOW_PRODUCTION_DB !== "1") {
  console.error(
    `Refusing to run ${what}: the database is remote, which for Berripop means production.\n` +
      `Re-run with ALLOW_PRODUCTION_DB=1 only if you mean to write to production (check that a backup exists first).`,
  );
  process.exit(1);
}
