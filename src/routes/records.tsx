import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/sidework/states";
import { fieldLabel, formatField } from "@/components/sidework/RecordFields";
import { useRecords, useSideWork } from "@/lib/sidework/context";
import { formatDate } from "@/lib/sidework/format";
import { RECORD_KINDS, type RecordKind } from "@/lib/sidework/types";

export const Route = createFileRoute("/records")({
  head: () => ({
    meta: [
      { title: "Records — Side Work" },
      {
        name: "description",
        content:
          "Every imported record, with file, row, and external ID, so you can verify the briefing.",
      },
      { property: "og:title", content: "Records — Side Work" },
      { property: "og:description", content: "Verify the imported records behind your briefing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Records,
});

const PAGE = 25;

function Records() {
  const { date, openSources } = useSideWork();
  const [kind, setKind] = useState<RecordKind>("sales");
  const [onlyDate, setOnlyDate] = useState(true);
  const [page, setPage] = useState(0);
  const q = useRecords(kind, onlyDate ? date : null, PAGE, page * PAGE);
  const cols = q.data?.records[0]
    ? Object.keys(q.data.records[0].data).filter((c) => c !== "external_id")
    : [];
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / PAGE)) : 1;

  return (
    <div>
      <PageHeader title="Records">
        The imported records Side Work is using. Open any row to see where it came from.
      </PageHeader>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={kind}
          onValueChange={(v) => {
            setKind(v as RecordKind);
            setPage(0);
          }}
        >
          <TabsList className="h-auto flex-wrap bg-muted">
            {RECORD_KINDS.map((k) => (
              <TabsTrigger key={k.kind} value={k.kind} className="data-[state=active]:text-primary">
                {k.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Checkbox
            id="only-date"
            checked={onlyDate}
            onCheckedChange={(c) => {
              setOnlyDate(!!c);
              setPage(0);
            }}
          />
          <Label htmlFor="only-date" className="font-normal">
            Only {formatDate(date, { short: true })}
          </Label>
        </div>
      </div>
      {q.isLoading && <LoadingBlock rows={5} />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && q.data.total === 0 && (
        <EmptyState title="No records">
          {onlyDate
            ? `Nothing of this type is imported for ${formatDate(date)}. Try turning off the date filter.`
            : "Nothing of this type has been imported yet."}
        </EmptyState>
      )}
      {q.data && q.data.total > 0 && (
        <>
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>External ID</TableHead>
                  {cols.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {fieldLabel(c)}
                    </TableHead>
                  ))}
                  <TableHead>File · row</TableHead>
                  <TableHead>
                    <span className="sr-only">Details</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.source.external_id}</TableCell>
                    {cols.map((c) => (
                      <TableCell key={c} className="num whitespace-nowrap">
                        {formatField(c, r.data[c])}
                      </TableCell>
                    ))}
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {r.source.filename} · {r.source.row_number}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary"
                        onClick={() =>
                          openSources(`${fieldLabel(r.kind)} record ${r.source.external_id}`, [
                            r.source,
                          ])
                        }
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {q.data.total} record{q.data.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous page"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft />
              </Button>
              <span>
                Page {page + 1} of {pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Next page"
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
