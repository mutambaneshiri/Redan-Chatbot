/**
 * Convert the model's light markdown into what WhatsApp actually renders.
 *
 * WhatsApp does NOT understand `[label](url)` — it prints the brackets and the
 * URL as literal characters, so the customer has to select and copy the link.
 * It DOES auto-link a bare http(s) URL, turning it into something tappable.
 * Its bold is a single asterisk, not two.
 *
 * So the web chat and WhatsApp need opposite treatments of the same reply:
 * the web renders the markdown (see components/RichText.tsx), WhatsApp gets it
 * flattened to bare URLs.
 */

/** `[Redan Msasa](https://maps…)` -> `Redan Msasa: https://maps…` */
const MD_LINK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** `**text**` -> `*text*` (WhatsApp bold). */
const MD_BOLD = /\*\*([^*\n]+)\*\*/g;

export function toWhatsAppText(reply: string): string {
  return reply
    .replace(MD_LINK, (_m, label: string, url: string) =>
      // A label that already is the URL would read as "https://…: https://…".
      label.trim() === url ? url : `${label.trim()}: ${url}`,
    )
    .replace(MD_BOLD, "*$1*");
}
