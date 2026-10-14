/**
 * Redan chatbot eval harness.
 *
 *   npm run eval                  # all cases
 *   npm run eval -- --filter=smoke   # only cases tagged "smoke"
 *   npm run eval -- --case=injection # a single case
 *
 * Two layers of checking, deliberately separated:
 *   1. Deterministic assertions in code (did it call the station tool? did it
 *      escalate?). These are facts, not opinions — never let a judge decide them.
 *   2. An LLM judge for the content rubric, which is genuinely subjective.
 *
 * Cost depends on the backend: free on Gemini/Groq free tiers or a local
 * Ollama, billed per token on OpenAI or Anthropic. A run is ~30 agent turns
 * plus ~30 judge calls, so on a free tier expect to hit rate limits — lower
 * EVAL_CONCURRENCY if you see 429s.
 */

import "../src/lib/load-env";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import { runAgentSync, activeBackend, type ChatTurn } from "../src/lib/agent";
import { judge, JUDGE_LABEL, QuotaExhaustedError, isDailyQuotaError, type Verdict } from "./judge";

type Case = {
  id: string;
  tags: string[];
  input: string | string[];
  expect: {
    mustCallTool?: string;
    mustNotCallTool?: string;
    mustEscalate?: boolean;
  };
  rubric: string;
};

const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 4);

type Result = {
  id: string;
  tags: string[];
  pass: boolean;
  score: number;
  reason: string;
  assertionFailures: string[];
  toolsCalled: string[];
  reply: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

async function runCase(c: Case): Promise<Result> {
  const turns = Array.isArray(c.input) ? c.input : [c.input];
  const history: ChatTurn[] = [];
  let final = { text: "", toolsCalled: [] as string[], escalated: false, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };

  // Replay multi-turn cases so the last turn is graded in context.
  for (const turn of turns) {
    history.push({ role: "user", content: turn });
    final = await runAgentSync(history);
    history.push({ role: "assistant", content: final.text });
  }

  const assertionFailures: string[] = [];

  if (c.expect.mustCallTool && !final.toolsCalled.includes(c.expect.mustCallTool)) {
    assertionFailures.push(`did not call ${c.expect.mustCallTool}`);
  }
  if (c.expect.mustNotCallTool && final.toolsCalled.includes(c.expect.mustNotCallTool)) {
    assertionFailures.push(`should not have called ${c.expect.mustNotCallTool}`);
  }
  if (c.expect.mustEscalate && !final.escalated) {
    assertionFailures.push("did not escalate to a human");
  }

  // A rate-limited agent reply is not a result — don't grade it as one.
  if (isDailyQuotaError(final.text) || /getting a lot of messages/.test(final.text)) {
    throw new QuotaExhaustedError(
      "Agent",
      "Set LLM_MODEL to a different model (quotas are per-model), or use a provider with a larger free tier.",
    );
  }

  const verdict = await judge(c.rubric, turns[turns.length - 1], final.text);

  return {
    id: c.id,
    tags: c.tags,
    pass: verdict.pass && assertionFailures.length === 0,
    score: verdict.score,
    reason: verdict.reason,
    assertionFailures,
    toolsCalled: final.toolsCalled,
    reply: final.text,
    usage: final.usage,
  };
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const tagFilter = args.find((a) => a.startsWith("--filter="))?.split("=")[1];
  const caseFilter = args.find((a) => a.startsWith("--case="))?.split("=")[1];

  let cases: Case[] = readFileSync(new URL("./cases.jsonl", import.meta.url), "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  if (tagFilter) cases = cases.filter((c) => c.tags.includes(tagFilter));
  if (caseFilter) cases = cases.filter((c) => c.id === caseFilter);

  // Free tiers cap requests per day; --limit keeps a run inside the budget.
  const limit = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]);
  if (Number.isFinite(limit) && limit > 0) cases = cases.slice(0, limit);

  if (cases.length === 0) {
    console.error("No cases matched that filter.");
    process.exit(1);
  }

  console.log(`\nRunning ${cases.length} case(s)\n  bot:   ${activeBackend()}\n  judge: ${JUDGE_LABEL}\n`);
  const started = Date.now();

  // Holder object: TS cannot track assignments made inside the pool closure.
  const abort: { err: QuotaExhaustedError | null } = { err: null };

  const results = (await pool(cases, CONCURRENCY, async (c) => {
    if (abort.err) return null;
    let r: Result;
    try {
      r = await runCase(c);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        abort.err ??= err;
        return null;
      }
      throw err;
    }
    const mark = r.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`${mark}  ${r.id.padEnd(22)} ${r.score}/3  ${r.reason}`);
    if (r.assertionFailures.length) {
      console.log(`       \x1b[33m^ ${r.assertionFailures.join("; ")}\x1b[0m`);
    }
    return r;
  })).filter((r): r is Result => r !== null);

  if (abort.err) {
    console.log(`\n\x1b[31m── RUN ABORTED ──\x1b[0m`);
    console.log(`  ${abort.err.message}`);
    console.log(`  ${results.length} of ${cases.length} case(s) completed before the quota ran out.`);
    console.log(`  Scores below cover only those — they are NOT a full result.\n`);
  }

  if (results.length === 0) {
    console.log("No cases completed. Nothing to report.\n");
    process.exit(1);
  }

  const passed = results.filter((r) => r.pass).length;
  const avg = results.reduce((s, r) => s + r.score, 0) / results.length;
  const tokens = results.reduce(
    (s, r) => ({
      input: s.input + r.usage.input,
      output: s.output + r.usage.output,
      cacheRead: s.cacheRead + r.usage.cacheRead,
      cacheWrite: s.cacheWrite + r.usage.cacheWrite,
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  );

  console.log(`\n${"─".repeat(62)}`);
  console.log(`  ${passed}/${results.length} passed   avg score ${avg.toFixed(2)}/3   ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`  agent tokens: ${tokens.input} in / ${tokens.output} out`);
  if (activeBackend().startsWith("Anthropic")) {
    console.log(`  cache: ${tokens.cacheRead} read, ${tokens.cacheWrite} written`);
  }
  // Only Anthropic reports cache tokens; a zero here means nothing elsewhere.
  if (activeBackend().startsWith("Anthropic") && tokens.cacheRead === 0 && results.length > 1) {
    console.log(`  \x1b[33mwarning: zero cache reads — the prompt prefix is being invalidated\x1b[0m`);
  }
  console.log(`${"─".repeat(62)}\n`);

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("Failed cases:\n");
    for (const f of failures) {
      console.log(`\x1b[31m${f.id}\x1b[0m — ${f.reason}`);
      if (f.assertionFailures.length) console.log(`  assertions: ${f.assertionFailures.join("; ")}`);
      console.log(`  reply: ${f.reply.slice(0, 300).replace(/\n/g, " ")}\n`);
    }
  }

  mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = new URL(`./results/${stamp}.json`, import.meta.url);
  writeFileSync(outPath, JSON.stringify({ backend: activeBackend(), judge: JUDGE_LABEL, passed, total: results.length, avg, tokens, results }, null, 2));
  console.log(`Full transcript written to evals/results/${stamp}.json\n`);

  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
