import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  TriangleAlert,
  FileText,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBriefing } from "@/lib/sidework/context";
import { formatCents, formatDate } from "@/lib/sidework/format";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { ErrorState, LoadingBlock } from "./states";
export function Dashboard() {
  const { workspace, date, openSources } = useWorkspace();
  const summary = useWorkspaceQuery(["service", date], () => workspace.serviceSummary(date));
  const briefing = useBriefing();
  const docs = useWorkspaceQuery(["documents"], () => workspace.documents());
  const end = new Date(date + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 14);
  const events = useWorkspaceQuery(["calendar", date], () =>
    workspace.calendar(date, end.toISOString().slice(0, 10)),
  );
  const s = summary.data;
  const b = briefing.data;
  const ratio =
    s?.net_sales_cents && s.estimated_base_wages_cents !== null
      ? Math.round((s.estimated_base_wages_cents / s.net_sales_cents) * 10000) / 100
      : null;
  const metrics = [
    {
      label: "Total net sales",
      value:
        s?.net_sales_cents == null ? "Missing" : formatCents(s.net_sales_cents, { whole: true }),
      sources: s?.sales_sources ?? [],
      note:
        b?.changes_vs_previous_day.net_sales?.amount_cents === 0
          ? "Unchanged from previous service"
          : "Compared with previous recorded service",
    },
    {
      label: "Employee hours",
      value: s?.total_hours ?? "Missing",
      sources: s?.labor_sources ?? [],
      note: "Imported labor hours",
    },
    {
      label: "Estimated base wages",
      value:
        s?.estimated_base_wages_cents == null
          ? "Missing"
          : formatCents(s.estimated_base_wages_cents, { whole: true }),
      sources: s?.labor_sources ?? [],
      note:
        b?.changes_vs_previous_day.estimated_wages?.amount_cents != null
          ? formatCents(b.changes_vs_previous_day.estimated_wages.amount_cents) +
            " change vs previous service"
          : "Imported hours × hourly rates",
    },
    {
      label: "Wage-to-sales ratio",
      value: ratio === null ? "Missing" : ratio.toFixed(2) + "%",
      sources: [...(s?.sales_sources ?? []), ...(s?.labor_sources ?? [])],
      note: "Base wages ÷ net sales",
    },
  ];
  return (
    <div>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-3 text-sm text-primary">SERVICE OVERVIEW</p>
          <h1 className="text-4xl font-medium md:text-5xl">A clearer picture of service.</h1>
          <p className="mt-4 text-base text-muted-foreground">
            {formatDate(date, { weekday: true })}
            {b?.previous_day && <span> · Previous service: {formatDate(b.previous_day.date)}</span>}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/records">
            View records <ArrowUpRight />
          </Link>
        </Button>
      </div>
      {summary.isLoading && <LoadingBlock />}
      {summary.error && <ErrorState error={summary.error} onRetry={() => summary.refetch()} />}{" "}
      {s && (
        <section
          aria-label="Service figures"
          className="workspace-grid divide-x divide-border overflow-hidden rounded-md border border-border bg-card"
        >
          {metrics.map((m) => (
            <div className="flex min-h-[200px] flex-col p-6" key={m.label}>
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="metric-number mt-5">{m.value}</p>
              <p className="mt-3 text-xs text-muted-foreground">{m.note}</p>
              <Button
                variant="link"
                className="mt-3 h-auto justify-start p-0 text-xs"
                disabled={!m.sources.length}
                onClick={() => openSources(m.label, m.sources)}
              >
                Supporting records <ArrowUpRight />
              </Button>
            </div>
          ))}
        </section>
      )}
      <div className="mt-10 grid gap-9 lg:grid-cols-[1.5fr_1fr]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-medium">Needs attention</h2>
            <span className="text-sm text-muted-foreground">{b?.alerts.length ?? 0} items</span>
          </div>
          {briefing.error && (
            <ErrorState error={briefing.error} onRetry={() => briefing.refetch()} />
          )}
          <div className="divide-y divide-border border-y border-border">
            {b?.alerts.map((a) => (
              <div key={a.id} className="flex gap-4 py-5">
                <TriangleAlert className="mt-1 size-5 shrink-0 text-warning" />
                <div className="flex-1">
                  <h3 className="font-medium">{a.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{a.message}</p>
                  <Button
                    variant="link"
                    className="mt-2 h-auto p-0 text-sm"
                    onClick={() => openSources(a.title, a.sources)}
                  >
                    View sources <ArrowRight />
                  </Button>
                </div>
              </div>
            ))}
            {b && b.alerts.length === 0 && (
              <p className="py-6 text-muted-foreground">
                No configured alerts for the available records.
              </p>
            )}
          </div>
          <div className="mt-8">
            <h2 className="mb-4 text-2xl font-medium">Service comparison</h2>
            {b?.previous_day ? (
              <div className="border-y border-border py-6">
                <div className="mb-5 flex justify-between text-sm">
                  <span>Net sales</span>
                  <span>
                    {formatCents(b.metrics.net_sales.amount_cents)} /{" "}
                    {formatCents(b.previous_day.metrics.net_sales.amount_cents)}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-sm bg-muted">
                  <div className="h-full w-full bg-primary" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {formatDate(date)} compared with {formatDate(b.previous_day.date)}. Recorded
                  purchases: {formatCents(b.metrics.recorded_purchases.amount_cents)}.
                </p>
                <Button
                  variant="link"
                  className="mt-2 h-auto p-0"
                  onClick={() =>
                    openSources("Recorded purchases", b.metrics.recorded_purchases.sources)
                  }
                >
                  Purchase sources <ArrowUpRight />
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Previous service records are unavailable.</p>
            )}
          </div>
        </section>
        <div>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-medium">Coming up</h2>
              <Button variant="link" asChild className="p-0">
                <Link to="/calendar">
                  <ArrowUpRight />
                  <span className="sr-only">Open calendar</span>
                </Link>
              </Button>
            </div>
            {events.error && <ErrorState error={events.error} />}
            <div className="divide-y divide-border border-y border-border">
              {events.data?.slice(0, 4).map((e) => (
                <Link key={e.id} to="/calendar" className="flex items-center gap-4 py-4">
                  <CalendarDays className="size-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(e.date)} · {e.kind.replace(/_/g, " ")}
                    </p>
                  </div>
                  <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                </Link>
              ))}
              {events.data?.length === 0 && (
                <p className="py-5 text-muted-foreground">
                  Nothing scheduled in the next two weeks.
                </p>
              )}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-medium">Document deadlines</h2>
            {docs.error && <ErrorState error={docs.error} />}
            <div className="divide-y divide-border">
              {docs.data
                ?.filter((d) => d.status === "active" && d.deadline)
                .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""))
                .slice(0, 3)
                .map((d) => (
                  <Link
                    key={d.id}
                    to="/documents"
                    className="flex gap-3 border-b border-border py-4"
                  >
                    <FileText className="size-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(d.deadline)}
                        {d.deadline && d.deadline < date ? " · Overdue" : ""}
                      </p>
                    </div>
                  </Link>
                ))}
            </div>
          </section>
          <section className="mt-8">
            <h2 className="mb-4 text-2xl font-medium">Data coverage</h2>
            {["sales", "labor", "purchases", "inventory"].map((k) => (
              <div
                key={k}
                className="flex items-center justify-between border-b border-border py-3 text-sm"
              >
                <span className="capitalize">{k === "labor" ? "Employee hours" : k}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {b && !b.missing_data.includes(k) ? (
                    <>
                      <Check className="size-4 text-primary" />
                      Available
                    </>
                  ) : (
                    "Missing"
                  )}
                </span>
              </div>
            ))}
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Imported business-date records do not establish complete service coverage.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
