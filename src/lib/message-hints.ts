import type { ChatTurn } from "./providers";
import { stationsMentionedIn } from "./stations";

/**
 * Small models (ministral-14b) are unreliable at two things: telling Shona
 * from isiNdebele, and calling the station tool when a station is named inside
 * a Shona or isiNdebele sentence. Both are easy to detect in code, so we work
 * them out here and attach a short note to the customer's latest message
 * telling the model what to do. The customer never sees the note.
 */

// Words that are distinctive to each language. Common short words shared by
// both, or with English, are left out on purpose.
const SHONA = new Set([
  "mhoro", "mhoroi", "hevoi", "makadii", "makadini", "ndoda", "ndinoda", "ndingawana",
  "ndingawanepi", "kupi", "hongu", "ndatenda", "ndinotenda", "ndoita", "sei",
  "yangu", "wangu", "nezve", "zvakadii", "ndiri", "ndapota", "ndokumbirawo",
  "ndibatsirei", "ndiudzei", "riini", "chii", "mangwanani", "masikati",
  "manheru", "ndingaite", "zvino", "kuziva", "dhiziri", "peturu", "mafuta",
  "makobvu", "mukobvu", "matete", "mutete",
]);
const NDEBELE = new Set([
  "salibonani", "sawubona", "lotjhani", "linjani", "unjani", "ngicela",
  "ngiyacela", "ngifuna", "ngingathola", "ngingawathola", "ngaphi", "yebo",
  "ngiyabonga", "ukwazi", "kanjani", "ngisize", "ngitshele", "nini", "yami",
  "wami", "khona", "kuphi", "ngingenzani", "ngiyafuna",
]);

// Complaint words in Shona and isiNdebele, which small models misread (e.g.
// "yarambwa", refused, taken as "expired").
const COMPLAINT = new Set([
  // Shona
  "yarambwa", "rambwa", "rakarambwa", "yakarambwa", "kunyunyuta", "ndinonyunyuta",
  "dambudziko", "ndabirwa", "kubirwa", "mashoma", "yakaipa", "yakashata",
  // isiNdebele
  "yaliwa", "kwaliwa", "ukukhalaza", "ngiyakhalaza", "inkinga", "ngebiwe",
  "amancane", "kubi",
]);

// English complaint words. The model usually spots English complaints, but
// tends to drop the "call the station" step once the station is named.
const COMPLAINT_EN = new Set([
  "complain", "complaint", "complaining", "contaminated", "contamination",
  "dirty", "refused", "rejected", "declined", "rude", "overcharged", "cheated",
  "stolen", "theft", "misfiring", "damaged", "broke", "shortchanged",
]);

/** True when a message reports a problem, in Shona, isiNdebele or English. */
export function isComplaint(text: string): boolean {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).some(
    (w) => COMPLAINT.has(w) || COMPLAINT_EN.has(w),
  );
}

const PRODUCT = /\b(coupons?|vouchers?|fuel ?cards?|cards?|top ?-?ups?|topping up|load(ing)?|redanflexi|flexi)\b/i;
const PRICE = /\b(price|prices|cost|costs|how much|rate|marii|imarii|malini|yimalini)\b/i;

/** True when the customer asks what coupons / card or Flexi top-ups cost. */
export function isPurchasePriceQuestion(text: string): boolean {
  return PRODUCT.test(text) && PRICE.test(text);
}

/** "petrol" or "diesel" when a price question names just one of the two. */
export function singleFuelAsked(text: string): "petrol" | "diesel" | null {
  if (!PRICE.test(text)) return null;
  const petrol = /\b(petrol|blend|e20|unleaded|peturu|matete|mutete)\b/i.test(text);
  const diesel = /\b(diesel|d50|dhiziri|makobvu|mukobvu)\b/i.test(text);
  if (petrol && !diesel) return "petrol";
  if (diesel && !petrol) return "diesel";
  return null;
}

// Account opening: the bot first asks how the customer wants to open the
// account ("Reply 1, 2 or 3"). Short answers like "2" or "At a station" must
// be read as that choice, not as a station search.
type AccountMethod = "online" | "station" | "headOffice";

function askedAccountChoice(prev: string | undefined): boolean {
  return !!prev && /open an account/i.test(prev) && /reply 1, 2 or 3/i.test(prev);
}

export function accountMethodChosen(text: string): AccountMethod | null {
  const t = text.trim().toLowerCase();
  if (/^(1|one)\b|\bfirst\b|online|\bform\b|e-?mail|website/.test(t)) return "online";
  if (/^(3|three)\b|\bthird\b|head ?office|\bhq\b|borrowdale|northridge/.test(t)) return "headOffice";
  if (/^(2|two)\b|\bsecond\b|station|garage|\bsite\b|walk ?in|chiteshi|esiteshini/.test(t)) return "station";
  return null;
}

const ACCOUNT_CHOICE_NOTES: Record<AccountMethod, string> = {
  online:
    "The customer chose to open the account ONLINE (option 1). Give the application form download link from the knowledge base, say to email the completed form to sales@redan.co.zw, and list the four requirements. Do not call find_nearest_stations.",
  station:
    "The customer chose to open the account AT A SERVICE STATION (option 2). Do NOT call find_nearest_stations yet. Explain they can walk into any Redan service station and the account is created instantly, list the four requirements, then offer to find their nearest station if they tell you their town or suburb.",
  headOffice:
    "The customer chose to open the account AT HEAD OFFICE (option 3). Give the Head Office address and hours (Monday to Friday, 8 a.m. to 5 p.m.) and list the four requirements. Do not call find_nearest_stations.",
};

// Requests for directions, in English, Shona and isiNdebele.
const DIRECTIONS =
  /\b(direct me|directions?|take me|get there|get to|how do i get|navigate|navigation|route|guide me|show me the way|nzira|ndiendese|ndiratidze|ndiperekedze|indlela|ngikhombise)\b/i;

export function wantsDirections(text: string): boolean {
  return DIRECTIONS.test(text);
}

// The customer wants the station nearest to *them* — as opposed to naming a
// town ("nearest station in Gweru", which needs no location). Only the
// self-referential phrasings, so sharing a GPS location genuinely helps.
// English, Shona and isiNdebele.
const NEARBY_SELF =
  /\b(near(est)? me|near my|stations? near me|close to me|around me|next to me|by me|(nearest|closest)[^.?!]{0,20}to me|my nearest|my (current )?location|where am i|padyo neni|pedyo neni|iri pedyo|eduze kwami|eseduze)\b/i;

/**
 * True when the customer is asking for the station closest to where they are,
 * so offering to share a location (web button / WhatsApp location request) is
 * useful. False when they name a place, since a lookup already answers that.
 */
export function wantsNearbyStation(text: string): boolean {
  return NEARBY_SELF.test(text);
}

const HEAD_OFFICE_RE = /\b(head ?office|hq|headquarters|main office)\b/i;

/**
 * Destination and optional starting point named in a directions request:
 * "from Redan Glenara to Head Office", "take me to Westgate", "direct me
 * there" (no destination: use the conversation).
 */
export function routeIn(text: string): { to: string | null; from: string | null } {
  const pick = (part: string): string | null => {
    if (HEAD_OFFICE_RE.test(part)) return "Head Office";
    const st = stationsMentionedIn(part);
    if (st.length) return st[0];
    const m = part.match(/\b(?:to|from)\s+(.+)/i);
    if (!m || /^(there|here|me|it|that|where i am|my (current )?location)\b/i.test(m[1].trim())) return null;
    return m[1].replace(/[?.!]+$/, "").trim();
  };
  const fromTo = text.match(/\bfrom\s+(.+?)\s+to\s+(.+)/i);
  if (fromTo) return { from: pick(`from ${fromTo[1]}`), to: pick(`to ${fromTo[2]}`) };
  const toFrom = text.match(/\bto\s+(.+?)\s+from\s+(.+)/i);
  if (toFrom) return { from: pick(`from ${toFrom[2]}`), to: pick(`to ${toFrom[1]}`) };
  const to = HEAD_OFFICE_RE.test(text) ? "Head Office" : (stationsMentionedIn(text)[0] ?? null);
  return { from: null, to };
}

/**
 * The station the conversation was last about: in the newest message that
 * names any, the one named first (the top of a "nearest stations" list).
 */
export function lastStationDiscussed(history: ChatTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const text = history[i].content.toLowerCase();
    const found = stationsMentionedIn(history[i].content);
    if (found.length === 0) continue;
    const at = (name: string) => {
      const k = text.indexOf(name.toLowerCase());
      return k < 0 ? Infinity : k;
    };
    return [...found].sort((x, y) => at(x) - at(y))[0];
  }
  return null;
}

/** A question about coupons whose expiry date is June 2026. */
export function isJune2026CouponQuestion(text: string): boolean {
  const t = text.toLowerCase();
  const coupon = /coupon|voucher|makuponi|macoupon/.test(t);
  const june2026 =
    /(june|jun|chikumi|nhlangulana)[^0-9]{0,6}(20)?26/.test(t) ||
    /\b0?6\s*[\/.-]\s*(20)?26\b/.test(t) ||
    /20?26\s*[\/.-]\s*0?6\b/.test(t);
  return coupon && june2026;
}

export type Language = "shona" | "ndebele" | "english";

/** Best guess at the language of one message, from distinctive words. */
export function detectLanguage(text: string): Language {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let shona = 0;
  let ndebele = 0;
  for (const w of words) {
    if (SHONA.has(w)) shona++;
    if (NDEBELE.has(w)) ndebele++;
  }
  if (shona === 0 && ndebele === 0) return "english";
  return ndebele > shona ? "ndebele" : "shona";
}

const FULL_LOCAL_LANGUAGE = process.env.REPLY_LANGUAGE_MODE === "full";

function languageNote(lang: Language, text: string): string | null {
  if (lang === "english") {
    // A bare station name ("Zindoga") says nothing about language; a real
    // English sentence does, and small models sometimes greet it in Shona or
    // isiNdebele anyway.
    const words = text.trim().split(/\s+/).length;
    return words >= 3
      ? "The customer wrote in English. Reply only in English — no Shona or isiNdebele greetings or sign-offs."
      : null;
  }
  const [name, hello] =
    lang === "shona" ? ["Shona", "Mhoroi"] : ["isiNdebele", "Salibonani"];
  return FULL_LOCAL_LANGUAGE
    ? `The customer wrote in ${name}. Greet with "${hello}" and reply in ${name}.`
    : `The customer wrote in ${name}. Open with "${hello}", then give the whole answer in clear, simple English. Do not write any other ${name} sentences.`;
}

/**
 * Returns the history with a server note appended to the customer's latest
 * message, or the history unchanged when there is nothing to add.
 */
export function withMessageHints(history: ChatTurn[]): ChatTurn[] {
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return history;

  const notes: string[] = [];
  const lang = languageNote(detectLanguage(last.content), last.content);
  if (lang) notes.push(lang);

  const named = stationsMentionedIn(last.content);
  const complaintNow = isComplaint(last.content);
  // The customer is answering our "which station?" question about a
  // complaint they made earlier in the conversation.
  const prevAssistant = [...history].reverse().find((t) => t.role === "assistant");
  const askedForStation = !!prevAssistant && /which\b.*\bstation/i.test(prevAssistant.content);
  const earlierComplaint = history.slice(0, -1).some((t) => t.role === "user" && isComplaint(t.content));
  const inComplaint = complaintNow || (askedForStation && earlierComplaint);

  const accountChoice = askedAccountChoice(prevAssistant?.content)
    ? accountMethodChosen(last.content)
    : null;

  const route = wantsDirections(last.content) ? routeIn(last.content) : null;
  const directionsTo = route
    ? (route.to ?? lastStationDiscussed(history.slice(0, -1)))
    : null;

  if (isJune2026CouponQuestion(last.content)) {
    notes.push(
      "The customer has coupons expiring June 2026. Give exactly two options as a numbered list: 1. Go to Redan Head Office (address and Monday-Friday 8 a.m.-5 p.m. hours from the knowledge base); 2. Visit any nearby Redan service station and ask the attendant to do a coupon inquiry on the system. Then offer to find their nearest station. Don't say the station revalidates coupons. Do not call find_nearest_stations unless they name a place.",
    );
  } else if (directionsTo) {
    const fromPart = route?.from
      ? `, starting from "${route.from}"`
      : " (no starting point given: leave 'from' empty so it starts at the customer's current location)";
    notes.push(
      `The customer wants directions to "${directionsTo}"${route?.to ? "" : " (from earlier in this conversation)"}${fromPart}. Call get_directions with to "${directionsTo}"${route?.from ? ` and from "${route.from}"` : ""}, then give its link as "[Get directions](link)". Never build a maps link yourself.`,
    );
  } else if (accountChoice) {
    notes.push(ACCOUNT_CHOICE_NOTES[accountChoice]);
  } else if (isPurchasePriceQuestion(last.content) && !complaintNow) {
    notes.push(
      "This asks the price of coupons, a fuel card top-up or a RedanFlexi top-up. Use ZERA's published price per litre from the knowledge base, in USD, and do not mention any date. Never use a station's pump price, and do not call find_nearest_stations.",
    );
  } else if (inComplaint && named.length > 0) {
    notes.push(
      `This is a complaint about Redan ${named[0]} (e.g. refused coupon or card, too little fuel, contaminated fuel, bad service). In this reply: 1) call find_nearest_stations with city "${named[0]}" and give its details (site cell number, site manager if listed, hours); 2) tell the customer to call Redan ${named[0]} on that site cell number — the station will guide them on dealing with the problem. Do NOT call escalate_to_human and do not give the support team's contacts.`,
    );
  } else if (complaintNow) {
    notes.push(
      "This is a complaint or problem report (e.g. refused coupon or card, too little fuel, contaminated fuel, bad service) — not a question about expiry. Acknowledge it and ask which Redan station it happened at. Do not call escalate_to_human.",
    );
  } else if (named.length > 0) {
    notes.push(
      `This message names ${named.map((n) => `Redan ${n}`).join(", ")}. Call find_nearest_stations with city "${named[0]}" before answering.`,
    );
    const only = singleFuelAsked(last.content);
    if (only) {
      notes.push(
        `The customer asked only for the ${only} price: give only the ${only === "petrol" ? "petrol" : "Diesel 50"} line, not the ${only === "petrol" ? "diesel" : "petrol"} price or any other detail.`,
      );
    }
  }

  if (notes.length === 0) return history;
  const note = `\n\n[Server note for the assistant — not written by the customer: ${notes.join(" ")}]`;
  return [...history.slice(0, -1), { ...last, content: last.content + note }];
}
