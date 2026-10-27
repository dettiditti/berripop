/**
 * Operator tool for the manual invoicing follow-up. Prints task ids, kinds,
 * statuses and amounts, never buyer data. Refuses a remote (production)
 * database unless ALLOW_PRODUCTION_DB=1 is set (scripts/db-guard.ts).
 *
 *   npm run invoices -- list [status]                        e.g. list manual (open tasks)
 *   npm run invoices -- mark-issued <task id> <number> [vat] after issuing the document by hand
 */
import "./db-guard";
import { listInvoiceJobs, markInvoiceIssuedManually } from "../lib/server/invoicing";

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);
  if (cmd === "list") {
    console.table((await listInvoiceJobs(a)).map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } else if (cmd === "mark-issued" && a && b) {
    console.log((await markInvoiceIssuedManually(a, b, c ?? null)) ? "Marked as issued." : "Not found or already issued.");
  } else {
    console.log("Usage: list [status] | mark-issued <id> <number> [vatKey]");
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`Failed: ${(err as Error)?.message ?? err}`);
  process.exitCode = 1;
});
