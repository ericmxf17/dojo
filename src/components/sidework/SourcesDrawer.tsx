import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecord, useSideWork } from "@/lib/sidework/context";
import type { SourceRef } from "@/lib/sidework/types";
import { ErrorState } from "./states";
import { RecordFields } from "./RecordFields";

function SourceItem({ s }: { s: SourceRef }) {
  const [open, setOpen] = useState(false);
  const q = useRecord(open ? s.record_id : null);
  return (
    <li className="panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-3 text-left"
      >
        <FileText className="mt-0.5 size-4 shrink-0 text-cobalt" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{s.filename}</span>
          <span className="block text-xs text-muted-foreground">
            Row {s.row_number} · External ID {s.external_id}
          </span>
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-border p-3">
          {q.isLoading && <p className="text-sm text-muted-foreground">Loading record…</p>}
          {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} title="Couldn't load this record" />}
          {q.data && <RecordFields record={q.data} />}
        </div>
      )}
    </li>
  );
}

export function SourcesDrawer() {
  const { sources, closeSources } = useSideWork();
  return (
    <Sheet open={!!sources} onOpenChange={(o) => !o && closeSources()}>
      <SheetContent className="w-full overflow-y-auto bg-background sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-normal">Sources</SheetTitle>
          <SheetDescription>{sources?.title}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          {sources && sources.sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No supporting records.</p>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted-foreground">
                {sources?.sources.length} supporting record{sources?.sources.length === 1 ? "" : "s"}. Open one to see its normalized fields.
              </p>
              <ul className="space-y-2">
                {sources?.sources.map((s, i) => <SourceItem key={`${s.record_id}-${i}`} s={s} />)}
              </ul>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
