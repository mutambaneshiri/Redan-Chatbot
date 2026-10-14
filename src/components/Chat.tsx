"use client";

import { useEffect, useRef, useState } from "react";
import { RichText } from "./RichText";
import { FuelPumpIcon, LocationIcon, SendIcon } from "./Icons";

type Msg = { role: "user" | "assistant"; content: string };

const TOOL_LABELS: Record<string, string> = {
  find_nearest_stations: "Checking stations and prices",
  escalate_to_human: "Connecting you to the support team",
};

// Each box shows `label`; tapping it sends `prompt` as the customer's message.
const SUGGESTIONS = [
  { label: "Do you want coupons?", prompt: "Where can I get coupons?" },
  { label: "Find my nearest station", prompt: "Find my nearest station" },
  {
    label: "How do I redeem a RedanFlexi coupon?",
    prompt: "How do I redeem a RedanFlexi coupon?",
  },
  { label: "What are FlexiBucks?", prompt: "What are FlexiBucks?" },
  {
    label: "My coupon expired — what now?",
    prompt: "My coupon expired — what now?",
  },
];

const GREETING =
  "Mhoroi! Salibonani! Hi! I'm the Redan assistant.\nEnhancing your experience on the move.\n\nHow can I be of service today? You can write to me in Shona, isiNdebele or English.";

export default function Chat({ usingSeedData }: { usingSeedData: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );

  const logRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, activeTool, busy]);

  function shareLocation() {
    if (!navigator.geolocation) {
      setError("Your browser can't share location. Just type your town instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        });
        setError(null);
      },
      () => setError("Couldn't get your location. Type your town instead."),
      { timeout: 8000 },
    );
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;

    const next: Msg[] = [...messages, { role: "user", content: trimmed }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setError(null);

    // Placeholder assistant bubble that fills in as deltas arrive.
    setMessages([...next, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Drop the client-side greeting; the model doesn't need it.
          messages: next.slice(1),
          location,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: any;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }

          if (event.type === "text") {
            acc += event.text;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: acc };
              return copy;
            });
          } else if (event.type === "tool_start") {
            setActiveTool(event.name);
          } else if (event.type === "tool_end") {
            setActiveTool(null);
          } else if (event.type === "error") {
            acc += (acc ? "\n\n" : "") + event.message;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: acc };
              return copy;
            });
          }
        }
      }

      if (!acc) {
        setMessages((prev) => prev.slice(0, -1));
        setError("No response received. Please try again.");
      }
    } catch {
      setMessages((prev) => prev.slice(0, -1));
      setError("Connection problem. Please try again.");
    } finally {
      setBusy(false);
      setActiveTool(null);
    }
  }

  const lastIsEmptyAssistant =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].content === "";

  return (
    <div className="shell">
      <header className="header">
        <div className="logo">
          <FuelPumpIcon size={22} />
        </div>
        <div>
          <h1>Redan Assistant</h1>
          <p>Coupons · Fuel cards · RedanFlexi · Station finder</p>
        </div>
      </header>

      {usingSeedData && (
        <div className="banner">
          Demo mode — station prices and hours are development seed data, not
          Redan&apos;s live feed.
        </div>
      )}

      <div className="log" ref={logRef}>
        {messages.map((m, i) => {
          if (m.content === "" && m.role === "assistant") return null;
          return (
            <div key={i} className={`row ${m.role === "user" ? "user" : "bot"}`}>
              {m.role === "assistant" && <BotAvatar />}
              <div className="bubble">
                {m.role === "assistant" ? (
                  <RichText text={m.content} />
                ) : (
                  m.content
                )}
              </div>
            </div>
          );
        })}

        {activeTool && (
          <div className="tool-chip">
            <span className="dot" />
            {TOOL_LABELS[activeTool] ?? "Working"}…
          </div>
        )}

        {busy && lastIsEmptyAssistant && !activeTool && (
          <div className="row bot">
            <BotAvatar />
            <div className="bubble typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}

        {error && <div className="error-note">{error}</div>}
      </div>

      {messages.length <= 1 && (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} onClick={() => send(s.prompt)} disabled={busy}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <button
          className={`icon-btn ${location ? "active" : ""}`}
          onClick={shareLocation}
          title={
            location
              ? `Location shared (${location.lat}, ${location.lng})`
              : "Share my location"
          }
          aria-label="Share my location"
        >
          <LocationIcon />
        </button>

        <textarea
          ref={taRef}
          rows={1}
          value={input}
          placeholder="Ask about coupons, stations, RedanFlexi…"
          onChange={(e) => {
            setInput(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
              if (taRef.current) taRef.current.style.height = "auto";
            }
          }}
        />

        <button
          className="send-btn"
          onClick={() => {
            send(input);
            if (taRef.current) taRef.current.style.height = "auto";
          }}
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          <SendIcon />
        </button>
      </div>

      <div className="r-badge" aria-hidden="true">
        R
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="avatar" aria-hidden="true">
      <FuelPumpIcon size={16} />
    </div>
  );
}
