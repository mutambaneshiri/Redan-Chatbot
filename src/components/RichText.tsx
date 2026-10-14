/**
 * Renders the bot's replies as readable chat text.
 *
 * The model answers in light markdown — `[Map](https://…)` for station links
 * and `**bold**` for station names. Rendered as a plain string those show up as
 * punctuation the customer has to copy into another tab, so we turn them into
 * real elements here.
 *
 * Deliberately NOT a markdown library: the input is model output, and the only
 * constructs that need to survive are links and bold. Everything else is
 * escaped by React as ordinary text.
 *
 * Security: only http and https URLs become anchors. The scheme is enforced by
 * the pattern itself, so a `javascript:` or `data:` URL — whether the model
 * invents one or a customer pastes one that gets echoed back — renders as inert
 * text rather than something clickable.
 */

// Explicit import: Next compiles JSX with the automatic runtime, but the
// offline verify script runs this file through tsx, which uses the classic
// React.createElement transform and needs React in scope.
import * as React from "react";

// [label](url) | bare url | **bold**
const TOKEN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)|\*\*([^*\n]+)\*\*/g;

// A URL at the end of a sentence swallows the punctuation; give it back.
function trimTrailing(url: string): [string, string] {
  const m = url.match(/[.,;:!?)\]]+$/);
  if (!m) return [url, ""];
  return [url.slice(0, -m[0].length), m[0]];
}

function Link({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="msg-link">
      {children}
    </a>
  );
}

export function RichText({ text }: { text: string }) {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > cursor) out.push(text.slice(cursor, start));

    const [, label, labelledUrl, bareUrl, bold] = m;

    if (labelledUrl) {
      out.push(
        <Link key={key++} href={labelledUrl}>
          {label}
        </Link>,
      );
    } else if (bareUrl) {
      const [href, tail] = trimTrailing(bareUrl);
      out.push(
        <Link key={key++} href={href}>
          {href}
        </Link>,
      );
      if (tail) out.push(tail);
    } else if (bold) {
      out.push(<strong key={key++}>{bold}</strong>);
    }

    cursor = start + m[0].length;
  }

  if (cursor < text.length) out.push(text.slice(cursor));

  return <>{out}</>;
}
