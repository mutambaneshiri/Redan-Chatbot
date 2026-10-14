/**
 * Lists the models your configured provider actually serves right now.
 *
 *   npm run models
 *
 * Model names get retired — a retired name is a hard 404 that takes the bot
 * down — so this is the first thing to run when you see a 404 from the LLM.
 */
import "../src/lib/load-env";
import OpenAI from "openai";
import { resolveProvider } from "../src/lib/providers/registry";

const { config, model, apiKey } = resolveProvider();

console.log(`\nProvider: ${config.label}`);
console.log(`Configured model: ${model}`);
console.log(`Free tier: ${config.freeTier}\n`);

if (config.baseURL === null) {
  console.log("Anthropic model IDs are listed at https://docs.anthropic.com/en/docs/about-claude/models\n");
  process.exit(0);
}

if (!apiKey) {
  console.error(`${config.apiKeyEnv} is not set. Get a key: ${config.signupUrl}\n`);
  process.exit(1);
}

const client = new OpenAI({ apiKey, baseURL: config.baseURL, timeout: 30_000 });

try {
  const { data } = await client.models.list();
  const ids = data.map((m) => m.id).sort();

  console.log(`${ids.length} models available:\n`);
  for (const id of ids) {
    console.log(`  ${id === model ? "*" : " "} ${id}`);
  }

  if (!ids.includes(model)) {
    console.log(
      `\n  WARNING: your configured model "${model}" is NOT in this list.\n` +
        `  Set LLM_MODEL in .env.local to one of the above.`,
    );
  }
  console.log("");
} catch (err) {
  console.error(
    `Could not list models: ${err instanceof Error ? err.message : err}\n`,
  );
  process.exit(1);
}
