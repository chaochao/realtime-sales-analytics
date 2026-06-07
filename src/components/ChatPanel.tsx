"use client";
import { useState } from "react";
import type { Filter, Ambiguity } from "@/src/lib/types";

type Msg =
  | { role: "user"; text: string }
  | { role: "agent"; text: string }
  | { role: "clarify"; text: string; ambiguity: Ambiguity; baseFilter: Filter };

export function ChatPanel({
  onResults,
  insights,
}: {
  onResults: (filter: Filter | null) => void;
  insights: string[];
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }]);
    setLoading(true);
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }).then((r) => r.json());

      if (res.status === "clarify") {
        const amb: Ambiguity = res.ambiguities[0];
        const label = amb.candidates.length
          ? `Did you mean one of these for ${String(amb.field)} "${amb.term}"?`
          : `No ${String(amb.field)} matching "${amb.term}" found.`;
        setMessages((m) => [...m, { role: "clarify", text: label, ambiguity: amb, baseFilter: {} }]);
      } else {
        setMessages((m) => [...m, { role: "agent", text: `Showing: ${res.interpretation}` }]);
        onResults(res.filter ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  async function choose(amb: Ambiguity, value: string, baseFilter: Filter) {
    const res = await fetch("/api/correction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term: amb.term, field: amb.field, resolvedValue: value, baseFilter }),
    }).then((r) => r.json());
    setMessages((m) => [
      ...m,
      { role: "agent", text: `Got it — "${amb.term}" = ${value}. Showing: ${res.interpretation}` },
    ]);
    onResults(res.filter ?? null);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white border border-slate-100 shadow-sm p-4">
      <div className="mb-2 text-sm font-medium text-slate-700">Ask about your sales</div>
      <div className="flex-1 space-y-2 overflow-auto min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            <span className={`inline-block rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-800"
            }`}>
              {m.text}
            </span>
            {m.role === "clarify" && m.ambiguity.candidates.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {m.ambiguity.candidates.map((c) => (
                  <button
                    key={c}
                    onClick={() => choose(m.ambiguity, c, m.baseFilter)}
                    className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {insights.map((t, i) => (
          <div key={`ins-${i}`}>
            <span className="inline-block rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              📈 {t}
            </span>
          </div>
        ))}
        {loading && (
          <div className="text-xs text-slate-400">Thinking…</div>
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) { send(input.trim()); setInput(""); }
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Show me John's deals in the West"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {messages.length > 0 && (
        <button
          onClick={() => { setMessages([]); onResults(null); }}
          className="mt-2 text-xs text-slate-400 hover:text-slate-600 text-center"
        >
          Clear
        </button>
      )}
    </div>
  );
}
