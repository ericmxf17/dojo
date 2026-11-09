import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState, PageHeader } from "@/components/sidework/states";
import { useSideWork } from "@/lib/sidework/context";
import { formatDate } from "@/lib/sidework/format";
import type { AskResponse } from "@/lib/sidework/types";

export const Route = createFileRoute("/ask")({
  head: () => ({
    meta: [
      { title: "Ask Side Work" },
      { name: "description", content: "Ask specific questions about your imported restaurant records and see the sources." },
      { property: "og:title", content: "Ask Side Work" },
      { property: "og:description", content: "Answers about your imported records, with sources." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Ask,
});

const EXAMPLES = ["What were sales?", "What were labor costs?", "What were purchases?", "What needs attention today?"];

function Ask() {
  const { mode, baseUrl } = useSideWork();
  return <AskPanel key={`${mode}:${baseUrl}`} />;
}

function AskPanel() {
  const { api, date, openSources } = useSideWork();
  const [text, setText] = useState("");
  const [history, setHistory] = useState<AskResponse[]>([]);
  const m = useMutation({
    mutationFn: (q: string) => api.ask(q, date),
    onSuccess: (r) => setHistory((h) => [r, ...h]),
  });
  const send = (q: string) => {
    if (!q.trim()) return;
    setText(q);
    m.mutate(q.trim());
  };
  return (
    <div className="max-w-3xl">
      <PageHeader title="Ask Side Work">
        This early version answers a few specific questions about your imported records for {formatDate(date)}. It looks up records; it doesn’t guess, forecast, or give advice.
      </PageHeader>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about sales, labor, purchases, or alerts" aria-label="Your question" className="h-11 bg-card" />
        <Button type="submit" className="h-11" disabled={m.isPending || !text.trim()}>
          {m.isPending ? <Loader2 className="animate-spin" /> : <Send />} Ask
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => (
          <button key={e} type="button" disabled={m.isPending} onClick={() => send(e)} className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-cobalt hover:border-cobalt">
            {e}
          </button>
        ))}
      </div>
      {m.error && <div className="mt-6"><ErrorState error={m.error} onRetry={() => m.mutate(text)} title="Couldn't get an answer" /></div>}
      <ul className="mt-8 space-y-4">
        {history.map((r, i) => (
          <li key={history.length - i} className="panel p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{r.question} · {formatDate(r.on, { short: true })}</p>
            <p className="mt-2 whitespace-pre-line">{r.answer}</p>
            {!r.supported && (
              <div className="mt-3 flex flex-wrap gap-2">
                {(r.supported_questions?.length ? r.supported_questions : EXAMPLES).map((e) => (
                  <button key={e} type="button" disabled={m.isPending} onClick={() => send(e)} className="text-sm text-cobalt underline-offset-4 hover:underline">{e}</button>
                ))}
              </div>
            )}
            {r.sources.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-xs text-muted-foreground">Sources:</span>
                {r.sources.map((s, j) => (
                  <button key={`${s.record_id}-${j}`} type="button" onClick={() => openSources(r.question, [s])} className="rounded-sm bg-cobalt-soft px-1.5 py-0.5 font-mono text-xs text-cobalt hover:underline">
                    {s.external_id}
                  </button>
                ))}
                <button type="button" onClick={() => openSources(r.question, r.sources)} className="text-xs text-cobalt underline">View all</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
