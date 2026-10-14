import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { SYSTEM_PROMPT } from "../system-prompt";
import { toOpenAITools, executeTool } from "../tools";
import {
  type AgentEvent,
  type ChatTurn,
  type Provider,
  type Usage,
  EMPTY_USAGE,
  MAX_ITERATIONS,
  MAX_TOKENS,
} from "./types";
import type { ProviderConfig } from "./registry";

/**
 * One implementation for every backend that speaks OpenAI's /chat/completions:
 * OpenAI, Google Gemini (via its compatibility layer), Groq, OpenRouter,
 * Mistral, Together, and a local Ollama.
 *
 * Deliberately conservative about request shape — free-tier and open-weight
 * backends vary in what optional fields they accept, and an unknown field is
 * usually a 400 rather than something ignored.
 */
export class OpenAICompatibleProvider implements Provider {
  readonly label: string;
  readonly isPaid: boolean;
  private client: OpenAI;
  private model: string;
  private minimalRequest: boolean;

  constructor(config: ProviderConfig, model: string, apiKey: string) {
    this.label = `${config.label} (${model})`;
    this.isPaid = config.isPaid;
    this.model = model;
    this.minimalRequest = config.minimalRequest ?? false;
    this.client = new OpenAI({
      apiKey,
      baseURL: config.baseURL ?? undefined,
      // Free tiers rate-limit aggressively; let the SDK back off for us.
      maxRetries: 3,
      timeout: 60_000,
    });
  }

  async *run(history: ChatTurn[]): AsyncGenerator<AgentEvent> {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.map((m) => ({ role: m.role, content: m.content }) as const),
    ];

    const usage: Usage = { ...EMPTY_USAGE };

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: MAX_TOKENS,
          messages,
          tools: toOpenAITools(),
          stream: true,
          // Mistral rejects stream_options with a 422 ("Extra inputs are not
          // permitted"). Minimal backends omit it; usage is then whatever the
          // final chunk reports, if anything.
          ...(this.minimalRequest
            ? {}
            : { stream_options: { include_usage: true } }),
        });

        let text = "";
        // Tool calls arrive as deltas that must be reassembled by index.
        // `extra` carries provider-specific fields that have to survive the
        // round trip — see the thought_signature note below.
        const toolCalls: Record<
          number,
          { id: string; name: string; args: string; extra?: unknown }
        > = {};
        let finishReason: string | null = null;

        for await (const chunk of stream) {
          if (chunk.usage) {
            usage.input += chunk.usage.prompt_tokens ?? 0;
            usage.output += chunk.usage.completion_tokens ?? 0;
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finishReason = choice.finish_reason;

          const delta = choice.delta;
          if (!delta) continue;

          if (delta.content) {
            text += delta.content;
            yield { type: "text", text: delta.content };
          }

          for (const tc of delta.tool_calls ?? []) {
            const index = tc.index ?? 0;
            const slot = (toolCalls[index] ??= {
              id: "",
              name: "",
              args: "",
            });
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name = tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;

            // Gemini 3.x returns a `thought_signature` on each tool call and
            // REJECTS the follow-up request if it is not echoed back verbatim
            // ("Function call is missing a thought_signature"). It rides along
            // in the OpenAI-compatible `extra_content` field. Capturing it
            // opaquely keeps this harmless for providers that never send one.
            const passthrough = (tc as { extra_content?: unknown })
              .extra_content;
            if (passthrough !== undefined) slot.extra = passthrough;
          }
        }

        const pending = Object.values(toolCalls).filter((t) => t.name);

        if (pending.length === 0) {
          if (finishReason === "length") {
            yield {
              type: "text",
              text: "\n\n(Message cut short — ask me to continue.)",
            };
          }
          break;
        }

        messages.push({
          role: "assistant",
          content: text || null,
          tool_calls: pending.map((t) => ({
            id: t.id,
            type: "function" as const,
            function: { name: t.name, arguments: t.args || "{}" },
            // Only present when the provider sent one (Gemini 3.x).
            ...(t.extra !== undefined ? { extra_content: t.extra } : {}),
          })),
        } as ChatCompletionMessageParam);

        for (const call of pending) {
          yield { type: "tool_start", name: call.name };

          let args: Record<string, any> = {};
          try {
            // Never string-match tool arguments; parse them. Smaller models
            // occasionally emit malformed JSON here.
            args = call.args ? JSON.parse(call.args) : {};
          } catch {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Your tool arguments were not valid JSON. Retry with a single valid JSON object.`,
            });
            yield { type: "tool_end", name: call.name };
            continue;
          }

          try {
            const { result, escalation } = await executeTool(call.name, args);
            if (escalation) yield { type: "escalation", ticket: escalation };
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: result,
            });
          } catch (err) {
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}. Tell the customer you hit a technical problem and offer a human handoff.`,
            });
          }

          yield { type: "tool_end", name: call.name };
        }
      }

      yield { type: "done", usage };
    } catch (error) {
      yield mapError(error, this.label);
    }
  }
}

function mapError(error: unknown, label: string): AgentEvent {
  if (error instanceof OpenAI.APIConnectionError) {
    console.error(
      `[redan] Could not reach ${label}. If this is Ollama, is it running? (ollama serve)`,
    );
    return {
      type: "error",
      message: "The assistant isn't reachable right now. Please try again.",
    };
  }

  if (error instanceof OpenAI.APIError) {
    // 429 on a free tier usually means the daily/minute quota is spent.
    if (error.status === 429) {
      console.error(`[redan] ${label} rate limited / quota exhausted`);
      return {
        type: "error",
        message:
          "We're getting a lot of messages right now. Please try again shortly, or call 08677 009583.",
      };
    }
    // Not every backend uses 401 for a bad key — Gemini returns 400
    // "Please pass a valid API key" — so check the message too. This is the
    // most common first-run failure; make it unmistakable in the logs.
    const looksLikeKeyProblem =
      error.status === 401 ||
      error.status === 403 ||
      (error.status === 400 && /api[ _-]?key/i.test(error.message));

    if (looksLikeKeyProblem) {
      console.error(
        `[redan] FATAL CONFIG: ${label} rejected the API key (${error.status}). Check your key in .env.local.`,
      );
      return {
        type: "error",
        message:
          "The assistant isn't available right now. Please email customersupport@redan.co.zw or call 08677 009583.",
      };
    }
    if (error.status === 404) {
      console.error(
        `[redan] FATAL CONFIG: ${label} returned 404 — that model name is wrong, retired, or unavailable on your tier.\n` +
          `        Run \`npm run models\` to list what this provider serves right now, then set LLM_MODEL in .env.local.`,
      );
      return {
        type: "error",
        message: "The assistant isn't configured correctly right now.",
      };
    }
    console.error(`[redan] ${label} API error ${error.status}:`, error.message);
    return {
      type: "error",
      message:
        "Something went wrong on our side. Email customersupport@redan.co.zw or call 08677 009583 and a person will help.",
    };
  }

  console.error(`[redan] unexpected (${label}):`, error);
  return { type: "error", message: "Something went wrong. Please try again." };
}
