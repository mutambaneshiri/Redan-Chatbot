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
  "mhoro", "mhoroi", "makadii", "makadini", "ndoda", "ndinoda", "ndingawana",
  "ndingawanepi", "kupi", "hongu", "ndatenda", "ndinotenda", "ndoita", "sei",
  "yangu", "wangu", "nezve", "zvakadii", "ndiri", "ndapota", "ndokumbirawo",
  "ndibatsirei", "ndiudzei", "riini", "chii", "mangwanani", "masikati",
  "manheru", "ndingaite", "zvino", "kuziva",
]);
const NDEBELE = new Set([
  "salibonani", "sawubona", "lotjhani", "linjani", "unjani", "ngicela",
  "ngiyacela", "ngifuna", "ngingathola", "ngingawathola", "ngaphi", "yebo",
  "ngiyabonga", "ukwazi", "kanjani", "ngisize", "ngitshele", "nini", "yami",
  "wami", "khona", "kuphi", "ngingenzani", "ngiyafuna",
]);

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

function languageNote(lang: Language): string | null {
  if (lang === "english") return null;
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
  const lang = languageNote(detectLanguage(last.content));
  if (lang) notes.push(lang);

  const named = stationsMentionedIn(last.content);
  if (named.length > 0) {
    notes.push(
      `This message names ${named.map((n) => `Redan ${n}`).join(", ")}. Call find_nearest_stations with city "${named[0]}" before answering.`,
    );
  }

  if (notes.length === 0) return history;
  const note = `\n\n[Server note for the assistant — not written by the customer: ${notes.join(" ")}]`;
  return [...history.slice(0, -1), { ...last, content: last.content + note }];
}
