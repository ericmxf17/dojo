import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/sidework/states";
import { useInventory, useSideWork } from "@/lib/sidework/context";
import { formatDate } from "@/lib/sidework/format";
import type { InventoryItem, InventoryStatus } from "@/lib/sidework/types";

export const Route = createFileRoute("/pantry")({
  head: () => ({
    meta: [
      { title: "Digital Pantry — Side Work" },
      { name: "description", content: "Recorded inventory snapshots with low-stock and recorded expiration flags." },
      { property: "og:title", content: "Digital Pantry — Side Work" },
      { property: "og:description", content: "Recorded inventory snapshots, batches, and expiration dates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pantry,
});

const STATUS: Record<InventoryStatus, [string, string]> = {
  ok: ["No flags", "bg-muted text-muted-foreground"],
  low_stock: ["At or below low-stock threshold", "bg-alert-soft text-primary"],
  expiration_approaching: ["Recorded expiration approaching", "bg-warning-soft text-warning"],
  expiration_passed: ["Recorded expiration passed", "bg-alert-soft text-primary"],
};

type Filter = "all" | "low" | "expiring";

function Pantry() {
  const { openSources, date } = useSideWork();
  const q = useInventory();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo(() => {
    let it: InventoryItem[] = q.data?.items ?? [];
    if (search) it = it.filter((i) => i.ingredient.toLowerCase().includes(search.toLowerCase()));
    if (filter === "low") it = it.filter((i) => i.statuses.includes("low_stock"));
    if (filter === "expiring") it = it.filter((i) => i.statuses.includes("expiration_approaching") || i.statuses.includes("expiration_passed"));
    return it;
  }, [q.data, search, filter]);

  return (
    <div>
      <PageHeader title="Digital Pantry">
        What your most recent inventory snapshot recorded. This isn’t live stock tracking — sales and purchases don’t change these quantities.
      </PageHeader>
      {q.isLoading && <LoadingBlock />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && !q.data.as_of && (
        <EmptyState title={`No inventory snapshot on or before ${formatDate(date)}`} action={<Button asChild size="sm" variant="outline"><Link to="/imports">Import inventory</Link></Button>}>
          Import an inventory CSV to see recorded quantities and expiration dates.
        </EmptyState>
      )}
      {q.data?.as_of && (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ingredients" aria-label="Search ingredients" className="bg-card pl-8" />
            </div>
            <div className="flex gap-1" role="group" aria-label="Filter">
              {([["all", "All"], ["low", "Low stock"], ["expiring", "Expiration approaching"]] as const).map(([v, l]) => (
                <Button key={v} size="sm" variant={filter === v ? "default" : "outline"} aria-pressed={filter === v} onClick={() => setFilter(v)} className={filter === v ? "bg-cobalt text-cobalt-foreground hover:bg-cobalt/90" : "bg-card"}>
                  {l}
                </Button>
              ))}
            </div>
            <span className="text-sm text-muted-foreground sm:ml-auto">Snapshot: {formatDate(q.data.as_of)}</span>
          </div>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ingredient</TableHead>
                  <TableHead className="text-right">Recorded quantity</TableHead>
                  <TableHead>Snapshot date</TableHead>
                  <TableHead>Recorded expiration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead><span className="sr-only">Sources</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No ingredients match.</TableCell></TableRow>
                )}
                {items.map((i) => {
                  const key = `${i.ingredient}|${i.unit}`;
                  const multi = i.batches.length > 1;
                  return (
                    <Fragment key={key}>
                      <TableRow>
                        <TableCell className="font-medium">
                          {multi ? (
                            <button className="flex items-center gap-1 text-left" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                              <ChevronDown className={`size-4 transition-transform ${open === key ? "rotate-180" : ""}`} aria-hidden />
                              {i.ingredient} <span className="text-xs font-normal text-muted-foreground">({i.batches.length} batches)</span>
                            </button>
                          ) : i.ingredient}
                        </TableCell>
                        <TableCell className="num whitespace-nowrap text-right">
                          {i.quantity} {i.unit}
                          {i.low_stock_threshold !== null && <span className="block text-xs text-muted-foreground">threshold {i.low_stock_threshold} {i.unit}</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(i.snapshot_date, { short: true })}</TableCell>
                        <TableCell className="whitespace-nowrap">{i.expiration_dates.length ? i.expiration_dates.map((d) => formatDate(d, { short: true })).join(", ") : "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {i.statuses.map((s) => <span key={s} className={`whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS[s][1]}`}>{STATUS[s][0]}</span>)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="text-cobalt" onClick={() => openSources(`${i.ingredient} (${i.unit})`, i.sources)}>View sources</Button>
                        </TableCell>
                      </TableRow>
                      {multi && open === key && i.batches.map((b) => (
                        <TableRow key={b.record_id} className="bg-muted/40">
                          <TableCell className="pl-10 text-sm text-muted-foreground">Batch {b.batch_id ?? "—"}</TableCell>
                          <TableCell className="num text-right text-sm">{b.quantity} {i.unit}</TableCell>
                          <TableCell />
                          <TableCell className="text-sm">{formatDate(b.expiration_date, { short: true })}</TableCell>
                          <TableCell colSpan={2} className="text-xs text-muted-foreground">{b.source.filename}, row {b.source.row_number}</TableCell>
                        </TableRow>
                      ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Expiration flags come from the dates you recorded; Side Work can’t tell whether food is safe to use. Different units for the same ingredient are listed separately.
          </p>
        </>
      )}
    </div>
  );
}
