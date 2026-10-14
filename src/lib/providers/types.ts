import type { EscalationTicket } from "../tools";

/** One customer turn. Provider-neutral. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string }
  | { type: "escalation"; ticket: EscalationTicket }
  | { type: "done"; usage: Usage }
  | { type: "error"; message: string };

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export interface Provider {
  /** Human-readable, e.g. "google (gemini-2.0-flash)". */
  readonly label: string;
  /** True when this provider bills per token. */
  readonly isPaid: boolean;
  run(history: ChatTurn[]): AsyncGenerator<AgentEvent>;
}

/** Safety net against a tool loop that never converges. */
export const MAX_ITERATIONS = 6;

/**
 * A support reply is 2-4 sentences, and even a five-station list fits well
 * under this. The cap stops a runaway, repeating reply (smaller models can
 * loop when writing Shona or isiNdebele) from filling the chat.
 */
export const MAX_TOKENS = 1200;
