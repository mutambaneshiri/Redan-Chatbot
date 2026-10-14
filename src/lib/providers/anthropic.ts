import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../system-prompt";
import { toAnthropicTools, executeTool } from "../tools";
import {
  type AgentEvent,
  type ChatTurn,
  type Provider,
  type Usage,
  EMPTY_USAGE,
  MAX_ITERATIONS,
  MAX_TOKENS,
} from "./types";

const EFFORT = (process.env.REDAN_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/**
 * Claude via the Anthropic Messages API. Paid, but the only backend here with
 * prompt caching, which makes the always-on knowledge base cheap at volume.
 */
export class AnthropicProvider implements Provider {
  readonly label: string;
  readonly isPaid = true;
  private client: Anthropic;
  private model: string;

  constructor(model: string, apiKey?: string) {
    this.label = `Anthropic Claude (${model})`;
    this.model = model;
    this.client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();
  }

  async *run(history: ChatTurn[]): AsyncGenerator<AgentEvent> {
    const messages: Anthropic.MessageParam[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const usage: Usage = { ...EMPTY_USAGE };

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: MAX_TOKENS,
          thinking: { type: "adaptive" },
          output_config: { effort: EFFORT },
          // Tools render before system in the cache prefix; both are constant,
          // so the whole knowledge base is served from cache after the first call.
          tools: toAnthropicTools() as Anthropic.ToolUnion[],
          system: [
            {
              type: "text",
              text: SYSTEM_PROMPT,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages,
        });

        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            yield { type: "text", text: event.delta.text };
          }
        }

        const message = await stream.finalMessage();

        usage.input += message.usage.input_tokens;
        usage.output += message.usage.output_tokens;
        usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
        usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

        if (message.stop_reason === "refusal") {
          yield {
            type: "error",
            message:
              "I can't help with that one. Let me put you through to a person: customersupport@redan.co.zw or 08677 009583.",
          };
          break;
        }

        if (message.stop_reason === "end_turn") break;

        if (message.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: message.content });
          continue;
        }

        const toolUses = message.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        if (toolUses.length === 0) break;

        messages.push({ role: "assistant", content: message.content });

        const results: Anthropic.ToolResultBlockParam[] = [];

        for (const tool of toolUses) {
          yield { type: "tool_start", name: tool.name };
          try {
            const { result, escalation } = await executeTool(
              tool.name,
              tool.input as Record<string, any>,
            );
            if (escalation) yield { type: "escalation", ticket: escalation };
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: result,
            });
          } catch (err) {
            results.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: `Tool failed: ${err instanceof Error ? err.message : "unknown error"}. Tell the customer you hit a technical problem and offer a human handoff.`,
              is_error: true,
            });
          }
          yield { type: "tool_end", name: tool.name };
        }

        messages.push({ role: "user", content: results });
      }

      yield { type: "done", usage };
    } catch (error) {
      yield mapError(error, this.label);
    }
  }
}

/**
 * Credential resolution fails inside the SDK before any HTTP request, so it
 * surfaces as a plain Error rather than Anthropic.AuthenticationError. There is
 * no typed class to catch, hence the message test.
 */
function isCredentialResolutionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /could not resolve authentication method/i.test(error.message)
  );
}

function mapError(error: unknown, label: string): AgentEvent {
  if (error instanceof Anthropic.RateLimitError) {
    return {
      type: "error",
      message:
        "We're getting a lot of messages right now. Please try again in a moment, or call 08677 009583.",
    };
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    isCredentialResolutionError(error)
  ) {
    console.error(
      `[redan] FATAL CONFIG: no valid Anthropic credentials. Set ANTHROPIC_API_KEY in .env.local.`,
    );
    return {
      type: "error",
      message:
        "The assistant isn't available right now. Please email customersupport@redan.co.zw or call 08677 009583.",
    };
  }
  if (error instanceof Anthropic.APIError) {
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
