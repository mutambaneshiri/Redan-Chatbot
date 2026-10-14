/**
 * Ask the bot one question from the terminal.
 *
 *   npm run ask "how do I redeem a coupon?"
 *
 * The fastest way to sanity-check a backend or a knowledge-base edit.
 */
import "../src/lib/load-env";
import { runAgent } from "../src/lib/agent";

const q = process.argv[2] ?? "Where is my nearest station?";
const events: any[] = [];
process.stdout.write(`\n\x1b[36mCustomer:\x1b[0m ${q}\n\x1b[32mBot:\x1b[0m `);
for await (const e of runAgent([{ role: "user", content: q }])) {
  events.push(e);
  if (e.type === "text") process.stdout.write(e.text);
  if (e.type === "tool_start") process.stdout.write(`\n  \x1b[33m[calling ${e.name}]\x1b[0m `);
  if (e.type === "error") process.stdout.write(`\n  \x1b[31mERROR: ${e.message}\x1b[0m`);
}
const done = events.find(e => e.type === "done");
console.log(`\n\x1b[90m  tokens: ${done?.usage.input} in / ${done?.usage.output} out\x1b[0m\n`);
