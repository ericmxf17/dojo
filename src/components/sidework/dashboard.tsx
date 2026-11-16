import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Loader2,
  Mic,
  MicOff,
  Send,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBriefing, useSideWork } from "@/lib/sidework/context";
import { classifyAssistantIntent, trailingWeek } from "@/lib/sidework/assistant";
import { formatCents, formatDate, formatPercent, formatSignedCents } from "@/lib/sidework/format";
import type { Alert, Briefing, SourceRef } from "@/lib/sidework/types";
import type { PayrollReport, ServiceSummary } from "@/lib/sidework/workspace-types";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { ErrorState, LoadingBlock } from "./states";

type Artifact =
  | { kind: "overview"; summary: ServiceSummary; briefing: Briefing }
  | { kind: "sales"; summary: ServiceSummary; briefing: Briefing }
  | { kind: "payroll"; report: PayrollReport }
  | { kind: "purchases"; briefing: Briefing }
  | { kind: "attention"; alerts: Alert[]; missing: string[] };

type Turn = {
  id: string;
  question: string;
  answer: string;
  artifact?: Artifact;
  sources: SourceRef[];
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const suggestions = [
  "Summarize last night's service",
  "Show payroll expenses for this week",
  "What needs attention?",
];

export function Dashboard() {
  const { api, date, openSources } = useSideWork();
  const { workspace } = useWorkspace();
  const summary = useWorkspaceQuery(["service", date], () => workspace.serviceSummary(date));
  const briefing = useBriefing();
  const [text, setText] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    setVoiceAvailable(
      Boolean(speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition),
    );
    return () => recognition.current?.stop();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, pending]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    setText("");
    setError(null);
    setPending(true);
    try {
      const intent = classifyAssistantIntent(q);
      let turn: Turn;
      if (intent === "payroll") {
        const range = trailingWeek(date);
        const report = await workspace.payrollPreview(range.start, range.end);
        turn = {
          id: crypto.randomUUID(),
          question: q,
          answer: report.missing_data
            ? `I couldn't find labor records from ${formatDate(range.start, { short: true })} through ${formatDate(range.end, { short: true })}.`
            : `Here is the payroll preparation view for the seven-day period ending ${formatDate(date)}.`,
          artifact: { kind: "payroll", report },
          sources: report.employees.flatMap((employee) => employee.sources),
        };
      } else if (intent === "overview" || intent === "sales") {
        const [service, report] = await Promise.all([
          workspace.serviceSummary(date),
          api.briefing(date),
        ]);
        turn = {
          id: crypto.randomUUID(),
          question: q,
          answer:
            intent === "overview"
              ? `Here is the clearest view of the imported records for ${formatDate(date)}.`
              : `Here is the service summary for ${formatDate(date)}.`,
          artifact: { kind: intent, summary: service, briefing: report },
          sources: [...service.sales_sources, ...service.labor_sources],
        };
      } else if (intent === "purchases") {
        const report = await api.briefing(date);
        turn = {
          id: crypto.randomUUID(),
          question: q,
          answer: `Here is the recorded supplier spend for ${formatDate(date)}.`,
          artifact: { kind: "purchases", briefing: report },
          sources: report.metrics.recorded_purchases.sources,
        };
      } else if (intent === "attention") {
        const report = await api.briefing(date);
        turn = {
          id: crypto.randomUUID(),
          question: q,
          answer: report.alerts.length
            ? `I found ${report.alerts.length} item${report.alerts.length === 1 ? "" : "s"} worth checking.`
            : "No configured alerts were triggered by the available records.",
          artifact: { kind: "attention", alerts: report.alerts, missing: report.missing_data },
          sources: report.alerts.flatMap((alert) => alert.sources),
        };
      } else {
        const response = await api.ask(q, date);
        turn = {
          id: crypto.randomUUID(),
          question: q,
          answer: response.answer,
          sources: response.sources,
        };
      }
      setTurns((current) => [...current, turn]);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  };

  const toggleVoice = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const next = new Constructor();
    recognition.current = next;
    next.lang = "en-US";
    next.interimResults = false;
    next.continuous = false;
    next.onresult = (event) => {
      setText(event.results[0]?.[0]?.transcript ?? "");
    };
    next.onerror = () => setListening(false);
    next.onend = () => setListening(false);
    setListening(true);
    next.start();
  };

  if (summary.isLoading || briefing.isLoading) return <LoadingBlock />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />;
  const service = summary.data;
  const report = briefing.data;
  const ratio =
    service?.net_sales_cents && service.estimated_base_wages_cents !== null
      ? (service.estimated_base_wages_cents / service.net_sales_cents) * 100
      : null;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <section aria-label="Key service figures" className="grid grid-cols-3 border-y border-border">
        <Metric label="Net sales" value={formatCents(service?.net_sales_cents, { whole: true })} />
        <Metric label="Team hours" value={service?.total_hours ?? "—"} />
        <Metric
          label="Base wages"
          value={formatCents(service?.estimated_base_wages_cents, { whole: true })}
        />
      </section>

      <section className="mx-auto mt-14 max-w-3xl">
        {turns.length === 0 && (
          <div className="mb-8 text-center">
            <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-full bg-secondary text-primary">
              <Sparkles className="size-5" />
            </div>
            <h1 className="text-3xl font-medium tracking-tight md:text-4xl">
              What do you need to know?
            </h1>
          </div>
        )}

        <div className="space-y-8" aria-live="polite">
          {turns.map((turn) => (
            <div key={turn.id}>
              <div className="ml-auto max-w-[78%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                {turn.question}
              </div>
              <div className="mt-4">
                <div className="mb-3 flex items-start gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                    <Sparkles className="size-3.5" />
                  </span>
                  <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                    {turn.answer}
                  </p>
                </div>
                {turn.artifact && (
                  <GeneratedArtifact
                    artifact={turn.artifact}
                    onSources={() => openSources(turn.question, turn.sources)}
                    hasSources={turn.sources.length > 0}
                  />
                )}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-primary">
                <Loader2 className="size-3.5 animate-spin" />
              </span>
              Building a view from your records…
            </div>
          )}
          <div ref={endRef} />
        </div>

        {error && (
          <div className="mt-5">
            <ErrorState error={error} title="Sidework couldn't build that view" />
          </div>
        )}

        <form
          className={`z-10 mt-8 rounded-2xl border bg-card p-2 shadow-[0_18px_55px_rgba(32,79,47,0.12)] md:sticky md:bottom-5 ${listening ? "border-primary" : "border-border"}`}
          onSubmit={(event) => {
            event.preventDefault();
            void ask(text);
          }}
        >
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(text);
              }
            }}
            rows={2}
            aria-label="Ask Sidework"
            placeholder={
              listening ? "Listening…" : "Ask about sales, payroll, purchases, or inventory"
            }
            className="w-full resize-none bg-transparent px-3 py-2 text-base outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleVoice}
              disabled={!voiceAvailable}
              aria-label={listening ? "Stop voice input" : "Start voice input"}
              title={
                voiceAvailable ? "Use voice input" : "Voice input is not supported by this browser"
              }
              className={listening ? "bg-secondary text-primary" : "text-muted-foreground"}
            >
              {listening ? <MicOff /> : <Mic />}
            </Button>
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim() || pending}
              aria-label="Send question"
            >
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        </form>

        {turns.length === 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion}
                onClick={() => void ask(suggestion)}
                className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </section>

      {report && ratio !== null && turns.length === 0 && (
        <p className="mt-10 text-center text-xs text-muted-foreground">
          {formatDate(date, { weekday: true })} · Base wages were {formatPercent(ratio, 1)} of
          recorded net sales
        </p>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-5 text-center first:text-left last:text-right md:px-8">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums md:text-3xl">{value}</p>
    </div>
  );
}

function GeneratedArtifact({
  artifact,
  hasSources,
  onSources,
}: {
  artifact: Artifact;
  hasSources: boolean;
  onSources: () => void;
}) {
  if (artifact.kind === "payroll") {
    const max = Math.max(
      ...artifact.report.employees.map((employee) => employee.base_wages_cents),
      1,
    );
    return (
      <ArtifactFrame
        title="Payroll summary"
        icon={<Wallet className="size-4" />}
        hasSources={hasSources}
        onSources={onSources}
      >
        <div className="grid grid-cols-3 gap-4 border-b border-border pb-5">
          <ArtifactMetric
            label="Base wages"
            value={formatCents(artifact.report.totals.base_wages_cents, { whole: true })}
          />
          <ArtifactMetric label="Hours" value={artifact.report.total_hours} />
          <ArtifactMetric label="Employees" value={String(artifact.report.employees.length)} />
        </div>
        <div className="mt-5 space-y-4">
          {artifact.report.employees.slice(0, 5).map((employee) => (
            <div key={employee.employee}>
              <div className="mb-1.5 flex justify-between gap-4 text-sm">
                <span>{employee.employee}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCents(employee.base_wages_cents, { whole: true })}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, (employee.base_wages_cents / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </ArtifactFrame>
    );
  }
  if (artifact.kind === "sales" || artifact.kind === "overview") {
    const ratio =
      artifact.summary.net_sales_cents && artifact.summary.estimated_base_wages_cents !== null
        ? (artifact.summary.estimated_base_wages_cents / artifact.summary.net_sales_cents) * 100
        : null;
    return (
      <ArtifactFrame
        title={artifact.kind === "overview" ? "Operating snapshot" : "Service summary"}
        icon={<BarChart3 className="size-4" />}
        hasSources={hasSources}
        onSources={onSources}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <ArtifactMetric
            label="Net sales"
            value={formatCents(artifact.summary.net_sales_cents, { whole: true })}
          />
          <ArtifactMetric label="Team hours" value={artifact.summary.total_hours ?? "—"} />
          <ArtifactMetric label="Wage ratio" value={formatPercent(ratio, 1)} />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-sm">
          <span className="text-muted-foreground">Change from previous recorded service</span>
          <span className="font-medium tabular-nums">
            {formatSignedCents(artifact.briefing.changes_vs_previous_day.net_sales?.amount_cents)}
          </span>
        </div>
      </ArtifactFrame>
    );
  }
  if (artifact.kind === "purchases") {
    const metric = artifact.briefing.metrics.recorded_purchases;
    const change = artifact.briefing.changes_vs_previous_day.recorded_purchases;
    return (
      <ArtifactFrame
        title="Supplier spend"
        icon={<Wallet className="size-4" />}
        hasSources={hasSources}
        onSources={onSources}
      >
        <div className="flex flex-wrap items-end justify-between gap-5">
          <ArtifactMetric
            label="Recorded purchases"
            value={formatCents(metric.amount_cents, { whole: true })}
          />
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Change from previous service</p>
            <p className="mt-1 text-lg font-medium tabular-nums">
              {formatSignedCents(change?.amount_cents)}
            </p>
          </div>
        </div>
        <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
          Recorded purchases are cash purchase records, not cost of goods sold.
        </p>
      </ArtifactFrame>
    );
  }
  return (
    <ArtifactFrame
      title="Items to check"
      icon={<AlertTriangle className="size-4" />}
      hasSources={hasSources}
      onSources={onSources}
    >
      {artifact.alerts.length ? (
        <div className="divide-y divide-border">
          {artifact.alerts.slice(0, 4).map((alert) => (
            <div key={alert.id} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium">{alert.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.message}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nothing in the configured rules needs attention for this date.
        </p>
      )}
      {artifact.missing.length > 0 && (
        <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
          Missing data: {artifact.missing.join(", ")}
        </p>
      )}
    </ArtifactFrame>
  );
}

function ArtifactFrame({
  title,
  icon,
  hasSources,
  onSources,
  children,
}: {
  title: string;
  icon: ReactNode;
  hasSources: boolean;
  onSources: () => void;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_14px_45px_rgba(32,79,47,0.07)]">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex items-center gap-2.5 text-sm font-medium text-primary">
          {icon}
          {title}
        </div>
        {hasSources && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSources}
            className="text-xs text-muted-foreground"
          >
            Sources <ArrowUpRight className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function ArtifactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums">{value}</p>
    </div>
  );
}
