import { runAgentSync, type ChatTurn } from "@/lib/agent";
import { toWhatsAppText } from "@/lib/whatsapp-format";
import { wantsNearbyStation } from "@/lib/message-hints";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * WhatsApp Business Cloud API webhook.
 *
 * The requirements are WhatsApp-first — in particular, station lookup is
 * triggered by WhatsApp location sharing — so this route maps WhatsApp message
 * payloads onto the same agent the web chat uses.
 *
 * NOT production ready as written. Before going live you must add:
 *   1. X-Hub-Signature-256 verification against your app secret.
 *   2. Conversation history storage keyed by phone number (this is stateless,
 *      so every message is treated as a fresh conversation).
 *   3. An async job queue — WhatsApp expects a 200 within seconds, and a
 *      tool-using turn can take longer than that.
 */

// GET: Meta's webhook verification handshake.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  // Status callbacks and other events carry no message — ack and ignore.
  if (!message) return Response.json({ ok: true });

  const from: string = message.from;
  let text: string;

  if (message.type === "location") {
    const { latitude, longitude, name } = message.location ?? {};
    text = `[Customer shared their location: lat ${latitude}, lng ${longitude}${
      name ? `, near ${name}` : ""
    }] Which Redan stations are closest to me?`;
  } else if (message.type === "text") {
    text = String(message.text?.body ?? "").slice(0, 4000);
    // Nearest-station request: send WhatsApp's native location-request button
    // instead of a text reply. When the customer taps it and shares, WhatsApp
    // delivers a `location` message, handled above.
    if (wantsNearbyStation(text)) {
      await sendWhatsAppLocationRequest(
        from,
        "To find the Redan service stations closest to you, tap the button below to share your location. You can also just reply with your town or suburb.",
      );
      return Response.json({ ok: true });
    }
  } else {
    text = `[Customer sent an unsupported ${message.type} message]`;
  }

  const history: ChatTurn[] = [{ role: "user", content: text }];
  const { text: reply, escalated } = await runAgentSync(history);

  if (escalated) {
    // Production: create the CRM ticket here before replying.
    console.log(`[redan] escalation raised for ${from}`);
  }

  // WhatsApp prints markdown links verbatim but auto-links bare URLs, so the
  // reply is flattened before it goes out.
  await sendWhatsAppMessage(from, toWhatsAppText(reply));
  return Response.json({ ok: true });
}

async function sendWhatsAppMessage(to: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.warn("[redan] WhatsApp credentials not set; reply not sent:", body);
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!res.ok) {
    console.error("[redan] WhatsApp send failed:", res.status, await res.text());
  }
}

/** Interactive message with a button that asks the customer to share a pin. */
async function sendWhatsAppLocationRequest(to: string, bodyText: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    console.warn(
      "[redan] WhatsApp credentials not set; location request not sent:",
      bodyText,
    );
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: { text: bodyText },
          action: { name: "send_location" },
        },
      }),
    },
  );

  if (!res.ok) {
    console.error(
      "[redan] WhatsApp location request failed:",
      res.status,
      await res.text(),
    );
  }
}
