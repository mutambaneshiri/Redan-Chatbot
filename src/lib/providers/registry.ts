/**
 * Free and paid LLM backends that speak the OpenAI-compatible
 * /chat/completions protocol, plus Anthropic which has its own.
 *
 * IMPORTANT: free-tier limits and model names change often. Verify against the
 * provider's own docs before relying on anything here. Model IDs in particular
 * are moving targets — every one is overridable with LLM_MODEL.
 */
export type ProviderId =
  | "google"
  | "groq"
  | "openrouter"
  | "ollama"
  | "openai"
  | "mistral"
  | "anthropic";

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  /** OpenAI-compatible base URL. Null for Anthropic, which uses its own SDK. */
  baseURL: string | null;
  defaultModel: string;
  apiKeyEnv: string;
  /** Whether this backend charges per token. */
  isPaid: boolean;
  /** Notes surfaced in setup output and the README. */
  freeTier: string;
  signupUrl: string;
  /** Some backends reject unknown fields; keep requests minimal for these. */
  minimalRequest?: boolean;
};

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  google: {
    id: "google",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-3.6-flash",
    apiKeyEnv: "GOOGLE_API_KEY",
    isPaid: false,
    freeTier:
      "Free, but the per-day cap is LOW (measured at 20 requests/day/model on 2026-09-11). Quotas are per-model, so bot and judge should use different models. Fine for development; not enough for production traffic.",
    // Google retires model names on a schedule; a retired name is a hard 404
    // that takes the bot down. Run `npm run models` to see what is live today.
    signupUrl: "https://aistudio.google.com/apikey",
  },
  groq: {
    id: "groq",
    label: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQ_API_KEY",
    isPaid: false,
    freeTier:
      "Free tier with rate limits. Extremely fast. Function calling supported on the larger Llama models.",
    signupUrl: "https://console.groq.com/keys",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    apiKeyEnv: "OPENROUTER_API_KEY",
    isPaid: false,
    freeTier:
      "Routes to many models; those with a ':free' suffix cost nothing but are heavily rate limited. Paid models also available on the same key.",
    signupUrl: "https://openrouter.ai/keys",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local)",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "llama3.1",
    apiKeyEnv: "OLLAMA_API_KEY", // unused; Ollama ignores auth
    isPaid: false,
    freeTier:
      "Runs on your own machine. No account, no key, no limits, no per-token cost, works offline. Quality and tool-calling reliability depend on the model you pull.",
    signupUrl: "https://ollama.com/download",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    baseURL: "https://api.mistral.ai/v1",
    // NOT mistral-small/medium/large: measured 2026-09-18, the free tier gives
    // those a hard 0 requests/minute (429 "Rate limit exceeded") or 403
    // "not available in your subscription tier". The ministral family is
    // allowed. 14b is the most capable of those; 8b and 3b have higher RPM.
    defaultModel: "ministral-14b-latest",
    apiKeyEnv: "MISTRAL_API_KEY",
    isPaid: false,
    freeTier:
      "Free, no credit card. Measured 2026-09-18 on ministral-14b-latest: 30 requests/minute, 937k tokens/minute — far more headroom than Gemini or Groq. Model choice matters: mistral-small/medium/large are blocked on this tier. Free-tier traffic may be used for training unless you opt out.",
    signupUrl: "https://console.mistral.ai/api-keys/",
    minimalRequest: true,
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    isPaid: true,
    freeTier:
      "NOT free. The ChatGPT app has a free tier; the API is billed per token.",
    signupUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    baseURL: null,
    defaultModel: "claude-opus-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    isPaid: true,
    freeTier: "NOT free. Billed per token.",
    signupUrl: "https://console.anthropic.com/settings/keys",
  },
};

export function resolveProvider(): {
  config: ProviderConfig;
  model: string;
  apiKey: string | undefined;
} {
  const id = (process.env.LLM_PROVIDER ?? "google") as ProviderId;
  const config = PROVIDERS[id];

  if (!config) {
    throw new Error(
      `Unknown LLM_PROVIDER "${id}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }

  return {
    // LLM_BASE_URL points the chosen provider at a different endpoint — a
    // remote Ollama host, a corporate proxy, or any other OpenAI-compatible
    // server not listed above.
    config: process.env.LLM_BASE_URL
      ? { ...config, baseURL: process.env.LLM_BASE_URL }
      : config,
    model: process.env.LLM_MODEL || config.defaultModel,
    // Ollama needs no key but the OpenAI SDK insists on a non-empty string.
    apiKey:
      process.env[config.apiKeyEnv] ??
      (config.id === "ollama" ? "ollama" : undefined),
  };
}
