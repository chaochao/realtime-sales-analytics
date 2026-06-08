"use client";
import { useState, useEffect, useRef } from "react";
import type { Filter, Ambiguity } from "@/src/lib/types";

type Msg =
  | { role: "user"; text: string }
  | { role: "agent"; text: string }
  | { role: "clarify"; text: string; ambiguity: Ambiguity; baseFilter: Filter };

type PendingConfirm = { filter: Filter; interpretation: string; correction?: { term: string; field: string }; draft?: Filter };

export function ChatPanel({
  onResults,
  insights,
  onDismissInsight,
}: {
  onResults: (filter: Filter | null) => void;
  insights: string[];
  onDismissInsight: (index: number) => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Correction flow state:
  // 1. Agent returns a result → pendingConfirm holds the interpreted filter awaiting Yes/No.
  // 2. User clicks No → correctionBase (the current filter) and correctionDraft (the raw LLM
  //    parse) are saved, pendingConfirm is cleared, and the input becomes a correction prompt.
  // 3. User types a correction → the next query carries correctionBase so the agent refines
  //    rather than restarting. If the resolved value differs from correctionDraft, a correction
  //    is saved to the DB via /api/correction so it applies automatically in the future.
  // 4. pendingAmbiguity tracks an unresolved term when the agent asks the user to pick a candidate.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [correctionBase, setCorrectionBase] = useState<Filter | null>(null);
  const [pendingAmbiguity, setPendingAmbiguity] = useState<Ambiguity | null>(null);
  const [correctionDraft, setCorrectionDraft] = useState<Filter | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingConfirm, loading]);

  async function queryApi(text: string, baseFilter?: Filter) {
    return fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, baseFilter, today: new Date().toLocaleDateString("en-CA") }),
    }).then((r) => r.json());
  }

  async function send(text: string) {
    setMessages((m) => [...m, { role: "user", text }]);
    const base = correctionBase ?? pendingConfirm?.filter ?? null;
    const carryAmbiguity = base ? pendingAmbiguity : null;
    const localCorrectionDraft = base ? (correctionDraft ?? pendingConfirm?.draft ?? null) : null;
    setPendingConfirm(null);
    setCorrectionBase(null);
    setPendingAmbiguity(null);
    setCorrectionDraft(null);
    setLoading(true);
    try {
      const res = await queryApi(text, base ?? undefined);
      if (res.status === "clarify") {
        const amb: Ambiguity = res.ambiguities[0];
        const label = amb.candidates.length
          ? `Did you mean one of these for ${String(amb.field)} "${amb.term}"?`
          : `No ${String(amb.field)} matching "${amb.term}" found.`;
        const partial = res.partialFilter ?? {};
        setMessages((m) => [...m, { role: "clarify", text: label, ambiguity: amb, baseFilter: partial }]);
        setCorrectionBase(partial);
        setPendingAmbiguity(amb);
      } else {
        let correction: { term: string; field: string } | undefined;
        if (carryAmbiguity && ["salesRep", "customer"].includes(carryAmbiguity.field as string)) {
          correction = { term: carryAmbiguity.term, field: carryAmbiguity.field as string };
        } else if (localCorrectionDraft) {
          for (const field of ["salesRep", "customer"] as const) {
            const originalTerm = localCorrectionDraft[field] as string | undefined;
            const newValue = (res.filter as Record<string, string>)[field];
            if (originalTerm && newValue && originalTerm.trim().toLowerCase() !== newValue.trim().toLowerCase()) {
              correction = { term: originalTerm, field };
              break;
            }
          }
        }
        setPendingConfirm({ filter: res.filter, interpretation: res.interpretation, draft: res.draft, correction });
      }
    } finally {
      setLoading(false);
    }
  }

  function choose(amb: Ambiguity, value: string, baseFilter: Filter) {
    const filter = { ...baseFilter, [amb.field]: value } as Filter;
    const interpretation = Object.entries(filter)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `${k} = ${v}`)
      .join(", ") || "no filters";
    const correction = ["salesRep", "customer"].includes(amb.field as string)
      ? { term: amb.term, field: amb.field as string }
      : undefined;
    setPendingConfirm({ filter, interpretation, correction });
  }

  function handleYes() {
    if (!pendingConfirm) return;
    onResults(pendingConfirm.filter);
    setMessages((m) => [...m, { role: "agent", text: `Showing: ${pendingConfirm.interpretation}` }]);
    if (pendingConfirm.correction) {
      const { term, field } = pendingConfirm.correction;
      const resolvedValue = (pendingConfirm.filter as Record<string, unknown>)[field];
      if (resolvedValue) {
        fetch("/api/correction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term, field, resolvedValue, baseFilter: {} }),
        });
      }
    }
    setPendingConfirm(null);
  }

  function handleNoClick() {
    setCorrectionBase(pendingConfirm?.filter ?? null);
    setCorrectionDraft(pendingConfirm?.draft ?? null);
    setPendingConfirm(null);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white border border-slate-100 shadow-sm p-4">
      <div className="mb-2 text-sm font-medium text-slate-700">Ask about your sales</div>
      <div ref={messagesRef} className="flex-1 space-y-2 overflow-auto min-h-0">
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

        {pendingConfirm && !loading && (
          <div>
            <span className="inline-block rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800">
              I&apos;m reading this as: <strong>{pendingConfirm.interpretation}</strong>. Is that right?
            </span>
            <div className="mt-1 flex gap-2">
              <button
                onClick={handleYes}
                className="rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs text-green-700 hover:bg-green-100"
              >
                Yes, apply
              </button>
              <button
                onClick={handleNoClick}
                className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                No
              </button>
            </div>
          </div>
        )}

        {insights.map((t, i) => (
          <div key={`ins-${i}`} className="relative inline-block max-w-full">
            <span className="inline-block rounded-lg bg-amber-50 border border-amber-200 pl-3 pr-6 py-2 text-sm text-amber-900">
              📈 {t}
            </span>
            <button
              onClick={() => onDismissInsight(i)}
              className="absolute top-2 right-2 text-amber-400 hover:text-amber-700 text-xs leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
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
          placeholder={correctionBase ? "How should I correct this?" : "e.g. Show me John's deals in the West"}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
      {(messages.length > 0 || pendingConfirm) && (
        <button
          onClick={() => { setMessages([]); setPendingConfirm(null); setCorrectionBase(null); setCorrectionDraft(null); setPendingAmbiguity(null); onResults(null); }}
          className="mt-2 text-xs text-slate-400 hover:text-slate-600 text-center"
        >
          Clear
        </button>
      )}
    </div>
  );
}
