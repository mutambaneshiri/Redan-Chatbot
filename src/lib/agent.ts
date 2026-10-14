import {
  getProvider,
  resolveProvider,
  type AgentEvent,
  type ChatTurn,
  EMPTY_USAGE,
} from "./providers";
import { withMessageHints } from "./message-hints";

export type { AgentEvent, ChatTurn } from "./providers";

/** Label of the active backend, e.g. "Google Gemini (gemini-2.0-flash)". */
export function activeBackend(): string {
  const { config, model } = resolveProvider();
  return `${config.label} (${model})`;
}

/**
 * Runs one customer turn to completion, yielding events as they happen.
 * The backend is chosen by LLM_PROVIDER; every provider emits the same events,
 * so routes and the eval harness are provider-agnostic.
 */
export async function* runAgent(
  history: ChatTurn[],
): AsyncGenerator<AgentEvent> {
  yield* getProvider().run(withMessageHints(history));
}

/** Non-streaming convenience wrapper — used by the eval harness. */
export async function runAgentSync(history: ChatTurn[]) {
  let text = "";
  const toolsCalled: string[] = [];
  let escalated = false;
  let usage = { ...EMPTY_USAGE };

  for await (const event of runAgent(history)) {
    if (event.type === "text") text += event.text;
    if (event.type === "tool_start") toolsCalled.push(event.name);
    if (event.type === "escalation") escalated = true;
    if (event.type === "done") usage = event.usage;
    if (event.type === "error") text += event.message;
  }

  return { text, toolsCalled, escalated, usage };
}
