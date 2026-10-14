import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { PROVIDERS, resolveProvider } from "./registry";
import type { Provider } from "./types";

export * from "./types";
export { PROVIDERS, resolveProvider } from "./registry";
export type { ProviderId, ProviderConfig } from "./registry";

let cached: Provider | null = null;

/** The configured backend. Set LLM_PROVIDER / LLM_MODEL to switch. */
export function getProvider(): Provider {
  if (cached) return cached;

  const { config, model, apiKey } = resolveProvider();

  if (!apiKey) {
    console.warn(
      `[redan] ${config.apiKeyEnv} is not set, so ${config.label} requests will fail.\n` +
        `        Get a key: ${config.signupUrl}\n` +
        `        Free tier: ${config.freeTier}`,
    );
  }

  cached =
    config.id === "anthropic"
      ? new AnthropicProvider(model, apiKey)
      : new OpenAICompatibleProvider(config, model, apiKey ?? "missing-key");

  console.log(`[redan] LLM backend: ${cached.label}`);
  return cached;
}

/** Used by setup output and docs. */
export function listFreeProviders() {
  return Object.values(PROVIDERS).filter((p) => !p.isPaid);
}
