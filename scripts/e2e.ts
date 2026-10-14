/**
 * Self-contained integration test for the OpenAI-compatible provider.
 *
 * Spins up a mock backend that behaves like a real one — streaming a tool call
 * in fragments, then a text reply — and drives the real agent loop against it.
 * No API key, no network, no cost. Run it in CI.
 *
 *   npm run test:e2e
 */
import { createServer, type Server } from "http";

function startMock(): Promise<{ server: Server; requests: any[] }> {
  const requests: any[] = [];

  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      const payload = JSON.parse(body || "{}");
      const sawToolResult = payload.messages.some((m: any) => m.role === "tool");

      requests.push({
        hasSystem: payload.messages[0]?.role === "system",
        systemLen: payload.messages[0]?.content?.length ?? 0,
        toolNames: (payload.tools ?? []).map((t: any) => t.function.name),
        sawToolResult,
        toolResult: payload.messages.find((m: any) => m.role === "tool")?.content ?? null,
      });

      const sse = (o: any) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      const chunk = (delta: any, finish: string | null = null) => ({
        id: "chatcmpl-mock", object: "chat.completion.chunk", created: 0, model: "mock",
        choices: [{ index: 0, delta, finish_reason: finish }],
      });

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      if (!sawToolResult) {
        // Tool call split across deltas, as real providers stream it.
        sse(chunk({ role: "assistant", tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "find_nearest_stations", arguments: "" } }] }));
        sse(chunk({ tool_calls: [{ index: 0, function: { arguments: '{"city": "Sky' } }] }));
        sse(chunk({ tool_calls: [{ index: 0, function: { arguments: 'way"}' } }] }));
        sse(chunk({}, "tool_calls"));
      } else {
        for (const t of ["Your nearest ", "station is ", "Redan Skyway."]) sse(chunk({ content: t }));
        sse(chunk({}, "stop"));
      }
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });

  // Port 0 = let the OS pick a free one, so this never collides in CI.
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, requests })),
  );
}

const { server, requests } = await startMock();
const port = (server.address() as { port: number }).port;

// Point the agent at the mock before importing it (the provider is built at
// module load, so these must be set first).
process.env.LLM_PROVIDER = "ollama";
process.env.LLM_MODEL = "mock";
process.env.LLM_BASE_URL = `http://localhost:${port}/v1`;

const { runAgent } = await import("../src/lib/agent");

let fail = 0;
const check = (n: string, c: boolean, d = "") => {
  console.log(`${c ? "  ok  " : " FAIL "} ${n}${d ? "  — " + d : ""}`);
  if (!c) fail++;
};

const events: any[] = [];
for await (const e of runAgent([{ role: "user", content: "where is my nearest station?" }])) {
  events.push(e);
}

const text = events.filter((e) => e.type === "text").map((e) => e.text).join("");
const errors = events.filter((e) => e.type === "error");

console.log("\n── Agent loop over an OpenAI-compatible backend ──");
check("no errors emitted", errors.length === 0, errors.map((e) => e.message).join("|"));
check("tool_start fired", events.some((e) => e.type === "tool_start" && e.name === "find_nearest_stations"));
check("tool_end fired", events.some((e) => e.type === "tool_end" && e.name === "find_nearest_stations"));
check("fragmented tool args reassembled and parsed", events.filter((e) => e.type === "tool_start").length === 1);
check("streamed text delivered", text.includes("Redan Skyway"), JSON.stringify(text));
check("text arrived as multiple deltas", events.filter((e) => e.type === "text").length >= 3);
check("done event present", events.some((e) => e.type === "done"));

console.log("\n── What the provider actually sent ──");
check("two round trips (call, then result)", requests.length === 2, `${requests.length}`);
check("system prompt included", requests[0]?.hasSystem === true, `${requests[0]?.systemLen} chars`);
check("knowledge base is in the system prompt", (requests[0]?.systemLen ?? 0) > 8000);
check("both tools advertised", JSON.stringify(requests[0]?.toolNames) === JSON.stringify(["find_nearest_stations", "escalate_to_human"]));
check("tool result fed back on turn 2", requests[1]?.sawToolResult === true);
check("tool result carried real station data", (requests[1]?.toolResult ?? "").includes("Redan Skyway"));
check("tool result includes opening hours", (requests[1]?.toolResult ?? "").includes("operating_hours"));

server.close();
console.log(`\n${fail === 0 ? "\x1b[32mE2E PASSED\x1b[0m" : `\x1b[31m${fail} E2E CHECK(S) FAILED\x1b[0m`}\n`);
process.exit(fail ? 1 : 0);
