import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, Info, Minus, TriangleAlert, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/sidework/states";
import { useBriefing, useSideWork } from "@/lib/sidework/context";
import { formatCents, formatDate, formatPercent, formatSignedCents } from "@/lib/sidework/format";
import type { Alert, Briefing, MetricChange, MoneyMetric, SourceRef } from "@/lib/sidework/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Side Work" },
      { name: "description", content: "Your daily restaurant briefing: sales, estimated wages, purchases, and what needs attention." },
      { property: "og:title", content: "Overview — Side Work" },
      { property: "og:description", content: "Your daily restaurant briefing, with the records behind every finding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function ChangeLine({ change, prevDate }: { change?: MetricChange | undefined; prevDate?: string | undefined }) {
  if (!prevDate) return <p className="text-xs text-muted-foreground">No previous-day records to compare.</p>;
  if (!change || change.amount_cents === null) return <p className="text-xs text-muted-foreground">Can't compare — records missing on one of the days.</p>;
  const d = change.amount_cents;
  const Icon = d === 0 ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  const word = d === 0 ? "Unchanged" : d > 0 ? "Up" : "Down";
  return (
    <p className="flex items-center gap-1 text-xs text-foreground/80">
      <Icon className="size-3.5 text-cobalt" aria-hidden />
      <span>
        {word}
        {d !== 0 && ` ${formatSignedCents(d).replace(/^[+−]/, "")}`}
        {d !== 0 && change.percent !== null && ` (${Math.abs(change.percent).toFixed(1)}%)`} vs {formatDate(prevDate, { short: true })}
      </span>
    </p>
  );
}

function MetricCard({ label, metric, change, prevDate, note, onSources }: { label: string; metric: MoneyMetric; change?: MetricChange | undefined; prevDate?: string | undefined; note?: string; onSources: () => void }) {
  return (
    <div className="panel flex flex-col gap-2 p-5">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {metric.amount_cents === null ? (
        <span className="font-display text-4xl text-muted-foreground">Missing</span>
      ) : (
        <span className="num font-display text-4xl md:text-[2.75rem] leading-none">{formatCents(metric.amount_cents, { whole: true })}</span>
      )}
      <ChangeLine change={change} prevDate={prevDate} />
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <button type="button" onClick={onSources} disabled={!metric.record_count} className="mt-auto self-start text-xs text-cobalt underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline">
        {metric.record_count ? `${metric.record_count} source record${metric.record_count > 1 ? "s" : ""}` : "No records for this date"}
      </button>
    </div>
  );
}

const SEV: Record<Alert["severity"], { label: string; cls: string }> = {
  high: { label: "Needs a look", cls: "bg-alert-soft text-primary border-primary/30" },
  medium: { label: "Worth checking", cls: "bg-warning-soft text-warning border-warning/30" },
  low: { label: "For your info", cls: "bg-cobalt-soft text-cobalt border-cobalt/30" },
};

function AlertCard({ a, onSources }: { a: Alert; onSources: (t: string, s: SourceRef[]) => void }) {
  const sev = SEV[a.severity];
  return (
    <li className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start">
      <TriangleAlert className={`size-5 shrink-0 ${a.severity === "high" ? "text-primary" : "text-warning"}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <span className={`mb-1.5 inline-block rounded-sm border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${sev.cls}`}>{sev.label}</span>
        <h3 className="font-medium">{a.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{a.message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => onSources(a.title, a.sources)}>
        View sources <ArrowRight />
      </Button>
    </li>
  );
}

function Chart({ b }: { b: Briefing }) {
  const days = [b.previous_day, { date: b.date, metrics: b.metrics }].filter(Boolean) as { date: string; metrics: Briefing["metrics"] }[];
  const data = days.map((d) => ({
    day: formatDate(d.date, { short: true }),
    "Net sales": d.metrics.net_sales.amount_cents === null ? null : d.metrics.net_sales.amount_cents / 100,
    "Estimated wages": d.metrics.estimated_wages.amount_cents === null ? null : d.metrics.estimated_wages.amount_cents / 100,
  }));
  const fmt = (v: unknown) => (typeof v === "number" ? `$${v.toLocaleString()}` : "Missing");
  return (
    <div className="panel p-5">
      <h2 className="font-display text-2xl">Sales and estimated wages</h2>
      <p className="mb-4 text-sm text-muted-foreground">{days.length > 1 ? `${formatDate(days[0]?.date)} compared with ${formatDate(b.date)}.` : `Only ${formatDate(b.date)} has records.`}</p>
      <div className="h-64" role="img" aria-label={data.map((d) => `${d.day}: net sales ${fmt(d["Net sales"])}, estimated wages ${fmt(d["Estimated wages"])}`).join(". ")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={6} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `$${v}`} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip formatter={fmt} cursor={{ fill: "var(--muted)" }} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Net sales" fill="var(--chart-1)" radius={[2, 2, 0, 0]} maxBarSize={56}>
              <LabelList dataKey="Net sales" position="top" formatter={fmt} style={{ fontSize: 11, fill: "var(--foreground)" }} />
            </Bar>
            <Bar dataKey="Estimated wages" fill="var(--chart-2)" radius={[2, 2, 0, 0]} maxBarSize={56}>
              <LabelList dataKey="Estimated wages" position="top" formatter={fmt} style={{ fontSize: 11, fill: "var(--foreground)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Coverage({ b }: { b: Briefing }) {
  const items = [
    { key: "sales", label: "Sales", ok: !b.missing_data.includes("sales") },
    { key: "labor", label: "Employee hours", ok: !b.missing_data.includes("labor") },
    { key: "purchases", label: "Purchases", ok: !b.missing_data.includes("purchases") },
    { key: "inventory", label: "Inventory snapshot", ok: !b.missing_data.includes("inventory"), extra: b.inventory_as_of && b.inventory_as_of !== b.date ? `Latest: ${formatDate(b.inventory_as_of, { short: true })}` : undefined },
  ];
  return (
    <div className="panel p-5">
      <h2 className="font-display text-2xl">Data coverage</h2>
      <p className="mb-3 text-sm text-muted-foreground">Records available for {formatDate(b.date, { short: true })}.</p>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-2 text-sm">
            {i.ok ? <Check className="size-4 text-success" aria-hidden /> : <X className="size-4 text-primary" aria-hidden />}
            <span>{i.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{i.ok ? "Available" : i.extra ?? "Missing"}</span>
          </li>
        ))}
      </ul>
      {b.missing_data.length > 0 && (
        <Link to="/imports" className="mt-3 inline-block text-xs text-cobalt underline-offset-4 hover:underline">
          Import missing records
        </Link>
      )}
    </div>
  );
}

function Overview() {
  const { date, openSources } = useSideWork();
  const q = useBriefing();
  return (
    <div>
      <PageHeader title="Your daily briefing.">A clearer picture of your restaurant, one service at a time.</PageHeader>
      <p className="-mt-5 mb-8 text-sm font-medium text-cobalt">{formatDate(date, { weekday: true })}</p>
      {q.isLoading && <LoadingBlock rows={4} label="Loading briefing" />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load the briefing" />}
      {q.data && <BriefingView b={q.data} openSources={openSources} />}
    </div>
  );
}

function BriefingView({ b, openSources }: { b: Briefing; openSources: (t: string, s: SourceRef[]) => void }) {
  const prev = b.previous_day?.date;
  const m = b.metrics;
  const prevRatio = b.previous_day?.metrics.estimated_wage_to_sales_percent;
  const nothing = b.missing_data.length >= 4;
  return (
    <div className="space-y-10">
      {nothing && (
        <div className="panel p-5 text-sm">
          No records are imported for {formatDate(b.date)}. <Link to="/imports" className="text-cobalt underline">Import records</Link> or choose another business date — the sample data covers November 8–9, 2026.
        </div>
      )}
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Net sales" metric={m.net_sales} change={b.changes_vs_previous_day.net_sales} prevDate={prev} onSources={() => openSources("Net sales", m.net_sales.sources)} />
        <MetricCard label="Estimated base wages" metric={m.estimated_wages} change={b.changes_vs_previous_day.estimated_wages} prevDate={prev} note="Hours × hourly rate" onSources={() => openSources("Estimated base wages", m.estimated_wages.sources)} />
        <MetricCard label="Recorded purchases" metric={m.recorded_purchases} change={b.changes_vs_previous_day.recorded_purchases} prevDate={prev} onSources={() => openSources("Recorded purchases", m.recorded_purchases.sources)} />
        <div className="panel flex flex-col gap-2 p-5">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Est. wage-to-sales ratio</span>
          <span className={`num font-display text-4xl md:text-[2.75rem] leading-none ${m.estimated_wage_to_sales_percent === null ? "text-muted-foreground" : ""}`}>
            {m.estimated_wage_to_sales_percent === null ? "Missing" : formatPercent(m.estimated_wage_to_sales_percent)}
          </span>
          <p className="text-xs text-foreground/80">
            {prev && prevRatio != null && m.estimated_wage_to_sales_percent !== null
              ? `${formatPercent(prevRatio)} on ${formatDate(prev, { short: true })} (${(m.estimated_wage_to_sales_percent - prevRatio >= 0 ? "+" : "−") + Math.abs(m.estimated_wage_to_sales_percent - prevRatio).toFixed(2)} points)`
              : "No previous-day ratio to compare."}
          </p>
          <p className="text-xs text-muted-foreground">Estimated base wages ÷ net sales</p>
        </div>
      </section>
      <p className="-mt-6 text-xs text-muted-foreground">Percent changes compare each figure with the previous business day’s recorded total.</p>

      <section aria-labelledby="attention">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 id="attention" className="font-display text-3xl">Needs attention</h2>
          <span className="text-sm text-muted-foreground">{b.alerts.length} item{b.alerts.length === 1 ? "" : "s"}</span>
        </div>
        {b.alerts.length === 0 ? (
          <div className="panel p-5 text-sm text-muted-foreground">No configured alerts were triggered by the available records for {formatDate(b.date)}.</div>
        ) : (
          <ul className="space-y-3">
            {b.alerts.map((a) => <AlertCard key={a.id} a={a} onSources={openSources} />)}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Chart b={b} />
        <Coverage b={b} />
      </section>

      <aside className="flex gap-3 rounded-md border border-border bg-muted/60 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
        <ul className="space-y-1">
          {b.limitations.map((l) => <li key={l}>{l}</li>)}
        </ul>
      </aside>
    </div>
  );
}
