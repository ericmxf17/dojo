import { useSideWork } from "@/lib/sidework/context";
import { formatCents, formatDate } from "@/lib/sidework/format";
import { kindLabel, type RecordValue, type StoredRecord } from "@/lib/sidework/types";

export function fieldLabel(k: string) {
  return k
    .replace(/_cents$/, "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function formatField(k: string, v: RecordValue | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (k.endsWith("_cents") && typeof v === "number") return formatCents(v);
  if (k.endsWith("_date") && typeof v === "string") return formatDate(v);
  return String(v);
}

export function RecordFields({ record }: { record: StoredRecord }) {
  const s = record.source;
  const { baseUrl } = useSideWork();
  const sourceUrl = s.url ? `${baseUrl.replace(/\/+$/, "")}${s.url}` : null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <dt className="text-muted-foreground">Type</dt>
      <dd>{kindLabel(record.kind)}</dd>
      {Object.entries(record.data).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{fieldLabel(k)}</dt>
          <dd className="num">{formatField(k, v)}</dd>
        </div>
      ))}
      <dt className="text-muted-foreground">File</dt>
      <dd className="break-all">{s.filename}</dd>
      <dt className="text-muted-foreground">Row</dt>
      <dd>{s.row_number}</dd>
      <dt className="text-muted-foreground">Import ID</dt>
      <dd className="break-all font-mono text-xs leading-5">{s.import_id}</dd>
      {s.url && (
        <>
          <dt className="text-muted-foreground">Link</dt>
          <dd>
            <a
              className="text-primary underline"
              href={sourceUrl ?? undefined}
              target="_blank"
              rel="noreferrer"
            >
              Open API source record
            </a>
          </dd>
        </>
      )}
    </dl>
  );
}
