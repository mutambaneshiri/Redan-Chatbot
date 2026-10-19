import { runAgent, type ChatTurn } from "@/lib/agent";
import { wantsNearbyStation } from "@/lib/message-hints";

export const runtime = "nodejs";
export const maxDuration = 60;

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: { messages?: IncomingMessage[]; location?: { lat: number; lng: number } };

  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = body.messages;

  if (!Array.isArray(incoming) || incoming.length === 0) {
    return Response.json({ error: "messages[] is required" }, { status: 400 });
  }
  if (incoming.length > 50) {
    return Response.json({ error: "Conversation too long" }, { status: 400 });
  }

  const history: ChatTurn[] = incoming.map((m) => ({
    role: m.role,
    content: String(m.content).slice(0, 4000),
  }));

  // A browser-shared location is appended to the final user turn so the model
  // can pass it straight to find_nearest_stations.
  if (body.location && history.length > 0) {
    const last = history[history.length - 1];
    if (last.role === "user") {
      last.content = `${last.content}\n\n[Customer shared their location: lat ${body.location.lat}, lng ${body.location.lng}]`;
    }
  }

  const encoder = new TextEncoder();

  // When the customer wants the station nearest to them but no location has
  // been shared, lead with the "share my location" offer instead of running
  // the model (which asks "which town are you in?"). Sharing a pin is the
  // precise route; naming a town stays only as a fallback. Only on location
  // intent, and only when we don't already have coordinates.
  const lastUser = [...incoming].reverse().find((m) => m.role === "user");
  const askForLocation =
    !body.location && !!lastUser && wantsNearbyStation(lastUser.content);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        if (askForLocation) {
          controller.enqueue(
            encoder.encode(JSON.stringify({ type: "request_location" }) + "\n"),
          );
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "text",
                text:
                  "Happy to find the Redan stations closest to you. Tap " +
                  "“Share my location” below so I can see where you are.",
              }) + "\n",
            ),
          );
          // Skip the model for this turn: the share-location button is the ask.
          return;
        }
        for await (const event of runAgent(history)) {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        }
      } catch (err) {
        console.error("[redan] stream failed:", err);
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: "error",
              message: "Connection interrupted. Please try again.",
            }) + "\n",
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
