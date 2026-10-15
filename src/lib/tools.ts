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
      "Find Redan service stations by town, suburb or station name (or by distance when station locations are loaded). Returns phone, opening hours, fuel availability (blend/diesel), lubricants, refreshments, LPG gas, price if listed, and a maps link. Use this for ANY question about stations, a station's hours or phone, or what a station sells — never answer those from memory. Prefer a town or suburb name; also pass lat/lng if the customer shared a location.",
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
            "Town, suburb or city name, used when no coordinates are available (e.g. 'Bulawayo', 'Msasa').",
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

      const matches = findStations({
        lat: num(input.lat),
        lng: num(input.lng),
        city: typeof input.city === "string" ? input.city : undefined,
        fuelType:
          input.fuel_type === "blend" || input.fuel_type === "diesel"
            ? input.fuel_type
            : "any",
        onlyOpen24h: input.only_open_24h === true || input.only_open_24h === "true",
      });
      const limit = num(input.limit) ?? 3;
      const sharedLocationOnly =
        num(input.lat) !== undefined && typeof input.city !== "string";

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
            note: `No Redan station in the database matches${input.city ? ` "${input.city}"` : " those filters"}. Do NOT quote prices or hours from any other station as though they answered this question. Tell the customer you have no station listed there, and either suggest they name a larger nearby town or offer a human handoff.`,
          }),
        };
      }

      return {
        result: JSON.stringify({
          stations: matches.slice(0, limit).map(formatStation),
          total_matching: matches.length,
          ...(matches.length > limit && {
            note: `Showing ${limit} of ${matches.length} matching stations. Ask the customer for their suburb or a nearby landmark to narrow it down.`,
          }),
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
