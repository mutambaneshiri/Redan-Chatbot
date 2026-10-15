import { describePlace, nearestPlace } from "./places";
import {
  findStations,
  formatStation,
  STATION_DATA_IS_PLACEHOLDER,
  STATIONS_HAVE_LOCATIONS,
} from "./stations";

/**
 * Provider-neutral tool definitions.
 *
 * The schemas are plain JSON Schema, which is what both the Anthropic and the
 * OpenAI-compatible APIs accept — they differ only in how the tool is wrapped.
 * Keeping one definition here means a provider swap can never leave the two
 * sides describing different tools.
 *
 * Order is fixed and the array is module-level constant: tools render before
 * the system prompt in a cache prefix, so a varying tool list would silently
 * invalidate prompt caching on every request.
 */
export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, any>;
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    name: "find_nearest_stations",
    description:
      "Find Redan service stations by station name, or the nearest ones to ANY place in Zimbabwe the customer names — city, suburb, town, village, growth point, business centre, communal land, mission, mine or school — or to a shared location. Returns phone, opening hours, fuel availability (blend/diesel), lubricants, refreshments, LPG gas, price if listed, and a maps link. Use this for ANY question about stations, a station's hours or phone, or what a station sells — never answer those from memory. Pass the place exactly as the customer gave it (e.g. 'Mabvuku', 'Highfield, Harare', 'Murambinda'), even if you think Redan has no station there; also pass lat/lng if the customer shared a location.",
    parameters: {
      type: "object",
      properties: {
        lat: {
          type: "number",
          description: "Customer latitude, from a shared WhatsApp location.",
        },
        lng: {
          type: "number",
          description: "Customer longitude, from a shared WhatsApp location.",
        },
        city: {
          type: "string",
          description:
            "Station name, or the customer's town, suburb, village or landmark anywhere in Zimbabwe (e.g. 'Bulawayo', 'Msasa', 'Glen View, Harare', 'Nyanga').",
        },
        fuel_type: {
          type: "string",
          enum: ["blend", "diesel", "any"],
          description:
            "Filter to stations that actually have this product in stock. Default 'any'.",
        },
        only_open_24h: {
          type: "boolean",
          description: "Only return stations that operate 24 hours.",
        },
        limit: {
          type: "number",
          description: "How many stations to return. Default 3.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to a human agent. Do NOT call this for complaints or problems at a station — those go to the station itself (give its site cell number). Call this for problems not linked to a station (e.g. a RedanFlexi in-app payment), refunds, fraud or account disputes, bulk enquiries of 5,000L or more, anything you cannot ground in the knowledge base, or whenever the customer asks for a person.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          enum: [
            "explicit_request",
            "complaint",
            "account_dispute",
            "bulk",
            "out_of_knowledge",
            "system_error",
            "suspected_fraud",
          ],
          description: "Why the conversation is being escalated.",
        },
        summary: {
          type: "string",
          description:
            "One or two sentences the human agent can read to pick up the conversation without re-reading it all.",
        },
      },
      required: ["reason", "summary"],
      additionalProperties: false,
    },
  },
];

/** Anthropic Messages API tool shape. */
export function toAnthropicTools() {
  return TOOL_SPECS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
    strict: true,
  }));
}

/**
 * OpenAI-compatible tool shape. Used by OpenAI, Google Gemini (compat layer),
 * Groq, OpenRouter, Mistral, Together and Ollama alike.
 *
 * `strict` is deliberately omitted: it is an OpenAI-specific extension and
 * several compatible backends reject or mishandle it. Tool arguments are
 * validated on our side in `executeTool` instead.
 */
export function toOpenAITools() {
  return TOOL_SPECS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export type EscalationTicket = {
  reason: string;
  summary: string;
  channels: { inAppChat: string; email: string; phone: string };
  createdAt: string;
};

export const SUPPORT_CHANNELS = {
  inAppChat: "RedanFlexi in-app chat (24/7)",
  email: "customersupport@redan.co.zw",
  phone: "08677 009583",
};

export async function executeTool(
  name: string,
  input: Record<string, any>,
): Promise<{ result: string; escalation?: EscalationTicket }> {
  switch (name) {
    case "find_nearest_stations": {
      // Smaller free-tier models sometimes emit numbers as strings; coerce
      // rather than silently dropping the customer's location.
      const num = (v: unknown) => {
        const n = typeof v === "string" ? Number(v) : v;
        return typeof n === "number" && Number.isFinite(n) ? n : undefined;
      };

      const search = findStations({
        lat: num(input.lat),
        lng: num(input.lng),
        city: typeof input.city === "string" ? input.city : undefined,
        fuelType:
          input.fuel_type === "blend" || input.fuel_type === "diesel"
            ? input.fuel_type
            : "any",
        onlyOpen24h: input.only_open_24h === true || input.only_open_24h === "true",
      });
      const matches = search.stations;
      const limit = num(input.limit) ?? 3;
      const lat = num(input.lat);
      const lng = num(input.lng);
      const sharedLocationOnly =
        lat !== undefined && lng !== undefined && typeof input.city !== "string";

      if (matches.length === 0 && sharedLocationOnly && !STATIONS_HAVE_LOCATIONS) {
        return {
          result: JSON.stringify({
            stations: [],
            note: "Station map locations are not loaded yet, so stations cannot be ranked by distance. Ask the customer which town or suburb they are in, then search by that name.",
          }),
        };
      }

      if (matches.length === 0) {
        return {
          result: JSON.stringify({
            stations: [],
            note: `No Redan station in the database matches${input.city ? ` "${input.city}", and it is not a place in Zimbabwe we can locate` : " those filters"}. Do NOT quote prices or hours from any other station as though they answered this question. Ask the customer for the nearest town, suburb or growth point (or to share their location), and search again; if that fails, offer a human handoff.`,
          }),
        };
      }

      const shown = matches.slice(0, limit);
      const nearest = shown[0].distanceKm;
      const where = search.place ? describePlace(search.place) : undefined;
      const pin = sharedLocationOnly ? nearestPlace(lat!, lng!) : null;
      let note: string | undefined;
      if (search.nearestOnly && where) {
        note = `Redan has no station in ${where}. These are the nearest Redan stations to it, by straight-line distance (road distance is longer). Tell the customer there is no station in ${search.place!.name} itself, then give these as the nearest, each with its town and roughly how far it is. Do NOT present them as being in ${search.place!.name}.${
          nearest > 100
            ? ` The nearest is over 100 km away, so say plainly that Redan has no station close to ${search.place!.name}.`
            : ""
        }${
          search.place!.alternatives.length > 0
            ? ` "${input.city}" could also mean ${search.place!.alternatives.map(describePlace).join(" or ")}; if the customer may be there instead, ask which one.`
            : ""
        }`;
      } else if (matches.length > limit) {
        note = `Showing ${limit} of ${matches.length} matching stations${where ? `, nearest to ${where} first` : ""}. Ask the customer for their suburb or a nearby landmark to narrow it down.`;
      }

      return {
        result: JSON.stringify({
          ...(where && { searched_place: where }),
          ...(pin && { customer_is_near: describePlace(pin) }),
          stations: shown.map(formatStation),
          total_matching: search.nearestOnly ? shown.length : matches.length,
          ...(note && { note }),
          data_status: STATION_DATA_IS_PLACEHOLDER
            ? "SEED DATA — tell the customer prices are indicative and to confirm at the station"
            : "live",
        }),
      };
    }

    case "escalate_to_human": {
      const ticket: EscalationTicket = {
        reason: String(input.reason ?? "unspecified"),
        summary: String(input.summary ?? ""),
        channels: SUPPORT_CHANNELS,
        createdAt: new Date().toISOString(),
      };

      // Production: POST this to the CRM / ticketing system and return the real
      // ticket reference so the customer can quote it.
      return {
        result: JSON.stringify({
          escalated: true,
          tell_customer:
            "If you looked up a station for this complaint, first give that station's details exactly as the station tool returned them (name, site cell number, site manager if listed, hours). Then say the support team will follow up, and give the three support channels.",
          channels: SUPPORT_CHANNELS,
        }),
        escalation: ticket,
      };
    }

    default:
      return {
        result: JSON.stringify({ error: `Unknown tool: ${name}` }),
      };
  }
}
