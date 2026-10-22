import { runAgent, type ChatTurn } from "@/lib/agent";
import {
  wantsNearbyStation,
  wantsDirections,
  routeIn,
  lastStationDiscussed,
} from "@/lib/message-hints";
import { directionsLink } from "@/lib/directions";
import { findStations, stationsMentionedIn } from "@/lib/stations";
import { resolvePlace } from "@/lib/places";

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

  // Decide what to do before the model runs. Two intents are handled here, on
  // the server, so the result is deterministic (no mangled links) and the
  // customer is always asked to share a location rather than type a town:
  //   - directions: route from the shared location to the destination;
  //   - nearest station: list the stations closest to the shared location.
  // Either way, if no location has been shared yet we lead with the
  // "share my location" button instead of calling the model.
  type PreAction =
    | { kind: "ask_location"; text: string }
    | { kind: "reply"; text: string }
    | { kind: "model" };

  const lastUser = [...incoming].reverse().find((m) => m.role === "user");
  const hasLoc = !!body.location;
  let pre: PreAction = { kind: "model" };

  if (lastUser) {
    const text = lastUser.content;
    if (wantsDirections(text)) {
      const route = routeIn(text);
      const named = stationsMentionedIn(text);
      // "nearest / closest station", or "a station", with no specific station
      // named, means route to the CLOSEST station — not to a place literally.
      const proximity =
        named.length === 0 &&
        (/\b(nearest|closest)\b/i.test(text) ||
          /\b(a|an|any|the)\s+(redan\s+)?(service\s+)?station\b/i.test(text));

      if (proximity) {
        // A place the request is measured from, if the customer named one.
        // EXACT match only — a fuzzy guess can pick the wrong town (e.g.
        // "Eastgate" -> "Westgate" in another city).
        const anchor = resolvePlace(text, { fuzzy: false });
        // True when the request is about the customer themselves / a station
        // in general, with no other place named (ends in "...station", or
        // says "near me").
        const genericOnly =
          /\b(near me|closest to me|nearest to me|around me|by me|my location|where i am|to me)\b/i.test(text) ||
          /\b(?:the|a|an|any|my|your)?\s*(?:nearest|closest)?\s*(?:redan\s+)?(?:service\s+)?stations?\s*[?.!]*$/i.test(text);

        if (anchor) {
          // Closest station to that place, routed from it — independent of
          // where the customer is now.
          const nearest = findStations({ lat: anchor.lat, lng: anchor.lng }).stations[0];
          if (nearest) {
            const d = directionsLink(nearest.name, undefined, { lat: anchor.lat, lng: anchor.lng });
            if (!d.error) {
              pre = {
                kind: "reply",
                text: `The Redan station closest to ${anchor.name} is **${nearest.name}** (${nearest.city}). Here are driving directions from ${anchor.name}:\n\n[Get directions](${d.link})`,
              };
            }
          }
        } else if (genericOnly) {
          // Closest to the customer: ask them to share a location.
          if (!hasLoc) {
            pre = {
              kind: "ask_location",
              text:
                "Happy to direct you to your nearest Redan station. Tap " +
                "“Share my location” below so I can find it and route you there.",
            };
          } else {
            const nearest = findStations({ lat: body.location!.lat, lng: body.location!.lng }).stations[0];
            if (nearest) {
              const d = directionsLink(nearest.name, undefined, body.location!);
              if (!d.error) {
                pre = {
                  kind: "reply",
                  text: `Your nearest Redan station is **${nearest.name}** (${nearest.city}). Here are driving directions from your location:\n\n[Get directions](${d.link})`,
                };
              }
            }
          }
        }
        // Otherwise a place was named but not recognised exactly: leave it to
        // the model, which can resolve it (find_nearest_stations handles fuzzy
        // matches and ambiguity) rather than guess or ask for the wrong point.
      } else {
        // A specific destination: a named station, "Head Office", or a place.
        const destination = route.to ?? lastStationDiscussed(history.slice(0, -1));
        const probe = destination ? directionsLink(destination) : { error: "x" };
        if (destination && !probe.error) {
          if (hasLoc || route.from) {
            const d = directionsLink(destination, route.from ?? undefined, body.location ?? undefined);
            if (!d.error) {
              pre = {
                kind: "reply",
                text: `Here are driving directions from ${d.from} to ${d.to}:\n\n[Get directions](${d.link})`,
              };
            }
          } else {
            // No location yet and no starting point named: ask to share it.
            pre = {
              kind: "ask_location",
              text: `Happy to direct you to ${probe.to}. Tap “Share my location” below so I can route you from where you are.`,
            };
          }
        }
        // Otherwise the destination can't be placed: let the model ask where to.
      }
    } else if (!hasLoc && wantsNearbyStation(text)) {
      pre = {
        kind: "ask_location",
        text:
          "Happy to find the Redan stations closest to you. Tap " +
          "“Share my location” below so I can see where you are.",
      };
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (pre.kind === "ask_location") {
          emit({ type: "request_location" });
          emit({ type: "text", text: pre.text });
          return;
        }
        if (pre.kind === "reply") {
          emit({ type: "text", text: pre.text });
          return;
        }
        for await (const event of runAgent(history)) {
          emit(event);
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
