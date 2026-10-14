/**
 * Diagnose LLM configuration problems.
 *
 *   npm run doctor
 *
 * Distinguishes the failure modes that all look identical from the chat UI:
 * missing key, malformed key, rejected key, retired model, model without tool
 * support, and an exhausted daily quota.
 */
import "../src/lib/load-env";
import OpenAI from "openai";
import { existsSync, readFileSync } from "fs";
import { resolveProvider } from "../src/lib/providers/registry";

let problems = 0;
const ok = (m: string) => console.log(`  \x1b[32mok\x1b[0m    ${m}`);
const bad = (m: string, fix?: string) => {
  console.log(`  \x1b[31mFAIL\x1b[0m  ${m}`);
  if (fix) console.log(`        \x1b[33m→ ${fix}\x1b[0m`);
  problems++;
};
const warn = (m: string) => console.log(`  \x1b[33mwarn\x1b[0m  ${m}`);

console.log("\n── Config ──");

if (!existsSync(".env.local")) {
  bad(".env.local not found", "cp .env.example .env.local, then add your key");
} else {
  ok(".env.local exists");

  // Catch the classic hand-editing mistakes before blaming the API.
  const raw = readFileSync(".env.local", "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    const [, name, value] = m;
    if (!name.includes("KEY")) continue;
    if (/["']/.test(value)) bad(`${name} contains quotes`, "remove them — the value is taken literally");
    if (/\s/.test(value.trim()) || value !== value.trim())
      bad(`${name} contains whitespace`, "remove spaces around the value");
    if (/[A-Z_]{3,}=/.test(value))
      bad(`${name} looks like it has another setting glued onto it`, "put each setting on its own line");
  }
}

const { config, model, apiKey } = resolveProvider();
console.log(`  provider: ${config.label}`);
console.log(`  model:    ${model}`);

if (!apiKey) {
  bad(`${config.apiKeyEnv} is not set`, `get a key: ${config.signupUrl}`);
} else if (apiKey.length < 8) {
  bad(`${config.apiKeyEnv} is suspiciously short (${apiKey.length} chars)`, "re-paste the whole key");
} else {
  ok(`${config.apiKeyEnv} present (${apiKey.length} chars)`);
}

if (problems > 0 || config.baseURL === null) {
  console.log(
    config.baseURL === null
      ? "\n  (Anthropic backend — skipping live checks.)\n"
      : "\n  Fix the above, then run `npm run doctor` again.\n",
  );
  process.exit(problems ? 1 : 0);
}

console.log("\n── Live checks ──");

const client = new OpenAI({ apiKey: apiKey!, baseURL: config.baseURL, timeout: 30_000, maxRetries: 0 });

let ids: string[] = [];
try {
  ids = (await client.models.list()).data.map((m) => m.id);
  ok(`reached ${config.label} — ${ids.length} models visible`);
} catch (err: any) {
  if (err?.status === 400 || err?.status === 401 || err?.status === 403) {
    bad(`the API key was rejected (${err.status}: ${String(err.message).slice(0, 60)})`,
        `re-copy the key from ${config.signupUrl} — make sure you got all of it`);
  } else {
    bad(`could not reach the provider: ${String(err?.message).slice(0, 80)}`);
  }
  console.log("");
  process.exit(1);
}

if (ids.length && !ids.includes(model)) {
  bad(`model "${model}" is not served by this provider`, "run `npm run models` and set LLM_MODEL to one that is");
} else {
  ok(`model "${model}" exists`);
}

// The check that matters most: this bot is useless without tool calling.
try {
  const res = await client.chat.completions.create({
    model,
    max_tokens: 100,
    messages: [{ role: "user", content: "Find stations near lat -17.8 lng 31.05" }],
    tools: [{
      type: "function",
      function: {
        name: "find_nearest_stations",
        description: "Find Redan stations near a coordinate",
        parameters: { type: "object", properties: { lat: { type: "number" }, lng: { type: "number" } }, required: [] },
      },
    }],
  });
  if (res.choices[0]?.message?.tool_calls?.length) {
    ok("tool calling works — the station locator will function");
  } else {
    bad(`"${model}" did not call the tool`, "pick a model that supports function calling; `npm run models` lists them");
  }
} catch (err: any) {
  const msg = String(err?.message ?? "");
  if (err?.status === 429) {
    // A 429 whose per-minute allowance is literally 0 is not congestion: the
    // account has no quota at all. On Mistral that means the free plan has not
    // been activated yet (SMS verification in the console). Retrying never
    // fixes it, so this must read as a config error, not a busy signal.
    const perMinute = err?.headers?.get?.("x-ratelimit-limit-req-minute")
      ?? err?.headers?.["x-ratelimit-limit-req-minute"];
    if (perMinute !== undefined && Number(perMinute) === 0) {
      bad(`"${model}" is allowed 0 requests/minute — the key works, this model has no quota`,
          "the tier does not include this model: set LLM_MODEL to one it does (on Mistral's free tier the ministral family works, mistral-small/medium/large do not)");
    } else if (/PerDay|per day/i.test(msg)) {
      bad("daily quota exhausted for this model",
          "quotas are per-model: set LLM_MODEL to a different one, or use Groq/Ollama for a bigger allowance");
    } else {
      warn("rate limited right now (per-minute burst) — wait a moment and retry");
    }
  } else if (err?.status === 404) {
    bad("model not found (retired?)", "run `npm run models` and set LLM_MODEL");
  } else {
    bad(`tool-call test failed: ${msg.slice(0, 80)}`);
  }
}

console.log(problems === 0 ? "\n\x1b[32mAll good — the bot should work.\x1b[0m\n" : `\n\x1b[31m${problems} problem(s) found.\x1b[0m\n`);
process.exit(problems ? 1 : 0);
