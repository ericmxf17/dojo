import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, Download, FileUp, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/sidework/states";
import { fieldLabel, formatField } from "@/components/sidework/RecordFields";
import { useImports, useSideWork, useTemplates } from "@/lib/sidework/context";
import { MAX_FILE_BYTES, templateCsv } from "@/lib/sidework/csv";
import { kindLabel, RECORD_KINDS, type ImportPreview, type RecordKind } from "@/lib/sidework/types";

export const Route = createFileRoute("/imports")({
  head: () => ({
    meta: [
      { title: "Imports — Side Work" },
      {
        name: "description",
        content:
          "Upload sales, purchases, employee hours, and inventory CSV files, preview them, then confirm.",
      },
      { property: "og:title", content: "Imports — Side Work" },
      { property: "og:description", content: "Preview and confirm restaurant CSV imports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportsPage,
});

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportsPage() {
  const { mode, baseUrl } = useSideWork();
  return <ImportForm key={`${mode}:${baseUrl}`} />;
}

function ImportForm() {
  const { api, keyBase, mode } = useSideWork();
  const qc = useQueryClient();
  const [kind, setKind] = useState<RecordKind>("sales");
  const [file, setFile] = useState<File | null>(null);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const templates = useTemplates();
  const imports = useImports();

  const preview = useMutation({
    mutationFn: (f: File) => api.previewImport(kind, f),
    onSettled: () => qc.invalidateQueries({ queryKey: [...keyBase, "imports"] }),
  });
  const commit = useMutation({
    mutationFn: (id: string) => api.commitImport(id),
    onSuccess: (res) => {
      // Refresh everything that reads records: briefing, inventory, records, alerts.
      qc.invalidateQueries({ queryKey: keyBase });
      toast.success(
        mode === "sample"
          ? `Imported ${res.row_count} record${res.row_count === 1 ? "" : "s"} into local sample data (this browser only).`
          : `Imported ${res.row_count} record${res.row_count === 1 ? "" : "s"}.`,
      );
      preview.reset();
      setFile(null);
    },
  });

  function choose(f: File | undefined | null) {
    setLocalError(null);
    setFile(null);
    preview.reset();
    commit.reset();
    if (!f || preview.isPending || commit.isPending) return;
    if (!/\.csv$/i.test(f.name)) {
      setLocalError(
        "Only .csv files are supported. PDFs, receipt photos, and Excel files can't be read — export a UTF-8 CSV instead.",
      );
      return;
    }
    if (f.size > MAX_FILE_BYTES) {
      setLocalError(`“${f.name}” is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 2 MB.`);
      return;
    }
    setFile(f);
    preview.mutate(f);
  }

  const p = preview.data;
  const canConfirm = p && p.status === "previewed" && p.errors.length === 0 && !commit.isPending;

  return (
    <div>
      <PageHeader title="Import records">
        Upload a CSV, review exactly what Side Work read, then confirm. Nothing is saved until you
        press “Confirm import.”
      </PageHeader>
      {mode === "sample" && (
        <p className="mb-6 rounded-md border border-warning/40 bg-warning-surface px-3 py-2 text-sm text-warning">
          Sample data mode: imports are kept in this browser only and are not sent to a server.
        </p>
      )}

      <section className="panel space-y-6 p-5 md:p-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">1. What kind of records?</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {RECORD_KINDS.map((k) => (
              <Button
                variant="ghost"
                key={k.kind}
                type="button"
                role="radio"
                aria-checked={kind === k.kind}
                disabled={preview.isPending || commit.isPending}
                onClick={() => {
                  setKind(k.kind);
                  preview.reset();
                  setFile(null);
                }}
                className={`rounded-md border px-4 py-2 text-sm ${kind === k.kind ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary hover:text-primary"}`}
              >
                {k.label}
              </Button>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="mb-2 text-sm font-medium">
            2. Upload a {kindLabel(kind).toLowerCase()} CSV
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              choose(e.dataTransfer.files?.[0]);
            }}
            className={`flex flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed px-6 py-12 text-center transition-colors ${drag ? "border-primary bg-secondary" : "border-border bg-background"}`}
          >
            <FileUp className="size-8 text-primary" aria-hidden />
            <p className="font-display text-2xl">Drop your CSV here</p>
            <p className="text-sm text-muted-foreground">or</p>
            <Button
              variant="outline"
              disabled={preview.isPending || commit.isPending}
              onClick={() => inputRef.current?.click()}
            >
              Choose a file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose CSV file"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="max-w-md text-xs text-muted-foreground">
              UTF-8 CSV only · up to 2 MB and 10,000 records · first row must be the template
              headers. Money is in dollars (72.00 = $72.00); dates are YYYY-MM-DD.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Templates:</span>
          {templates.isLoading && <span className="text-muted-foreground">Loading…</span>}
          {templates.error && (
            <span className="text-primary">
              Couldn't load templates.{" "}
              <Button variant="ghost" className="underline" onClick={() => templates.refetch()}>
                Retry
              </Button>
            </span>
          )}
          {templates.data?.map((t) => (
            <Button
              key={t.kind}
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => download(t.filename, templateCsv(t))}
            >
              <Download /> {kindLabel(t.kind)}
            </Button>
          ))}
        </div>
      </section>

      {localError && (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-md border border-primary/40 bg-warning-surface p-4 text-sm text-primary"
        >
          <X className="mt-0.5 size-4" aria-hidden /> {localError}
        </div>
      )}
      {preview.isPending && (
        <div className="panel mt-6 flex items-center gap-2 p-5 text-sm" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Reading {file?.name}…
        </div>
      )}
      {preview.error && (
        <div className="mt-6">
          <ErrorState
            error={preview.error}
            title="Couldn't preview this file"
            onRetry={file ? () => preview.mutate(file) : undefined}
          />
        </div>
      )}
      {p && (
        <PreviewPanel
          p={p}
          canConfirm={!!canConfirm}
          commit={commit}
          onCancel={() => {
            preview.reset();
            setFile(null);
          }}
        />
      )}

      <section className="mt-12">
        <h2 className="mb-4 font-display text-3xl">Import history</h2>
        {imports.isLoading && <LoadingBlock />}
        {imports.error && <ErrorState error={imports.error} onRetry={() => imports.refetch()} />}
        {imports.data && imports.data.length === 0 && (
          <EmptyState title="No imports yet">Upload a CSV above to get started.</EmptyState>
        )}
        {imports.data && imports.data.length > 0 && (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Records</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.data.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-[260px] truncate font-medium">
                      {i.filename}
                    </TableCell>
                    <TableCell>{kindLabel(i.kind)}</TableCell>
                    <TableCell className="num text-right">{i.row_count}</TableCell>
                    <TableCell>
                      <StatusPill s={i.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {i.created_at
                        ? new Date(i.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ s }: { s: ImportPreview["status"] }) {
  const map = {
    committed: ["Imported", "bg-secondary text-primary"],
    previewed: ["Not confirmed", "bg-muted text-muted-foreground"],
    invalid: ["Has errors", "bg-warning-surface text-primary"],
  } as const;
  const [label, cls] = map[s] ?? [s, "bg-muted"];
  return <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function PreviewPanel({
  p,
  canConfirm,
  commit,
  onCancel,
}: {
  p: ImportPreview;
  canConfirm: boolean;
  commit: ReturnType<typeof useMutation<ImportPreview, Error, string>>;
  onCancel: () => void;
}) {
  const cols = p.preview[0] ? Object.keys(p.preview[0]) : [];
  const fileErrors = p.errors.filter((e) => e.row === null);
  const rowErrors = p.errors.filter((e) => e.row !== null);
  return (
    <section className="panel mt-6 p-5 md:p-6" aria-labelledby="preview-h">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="preview-h" className="font-display text-3xl">
            3. Review
          </h2>
          <p className="text-sm text-muted-foreground">
            {p.filename} · {kindLabel(p.kind)} · <span className="num">{p.row_count}</span> record
            {p.row_count === 1 ? "" : "s"}
          </p>
        </div>
        {p.errors.length === 0 ? (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <CheckCircle2 className="size-4" aria-hidden />{" "}
            {p.status === "committed"
              ? "Already imported — no duplicate records added"
              : "Ready to import"}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-primary">
            <TriangleAlert className="size-4" aria-hidden /> {p.errors.length} problem
            {p.errors.length > 1 ? "s" : ""} found
          </span>
        )}
      </div>

      {p.errors.length > 0 && (
        <div
          role="alert"
          className="mb-4 rounded-md border border-primary/30 bg-warning-surface p-4"
        >
          <p className="mb-2 text-sm font-medium text-primary">
            Fix these in your file and upload it again. Nothing has been imported.
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {fileErrors.map((e, i) => (
              <li key={`f${i}`}>{e.message}</li>
            ))}
            {rowErrors.map((e, i) => (
              <li key={`r${i}`}>
                <span className="font-medium">Row {e.row}</span>
                {e.field && <span className="text-muted-foreground"> · {e.field}</span>}:{" "}
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cols.length > 0 && (
        <div className="mb-4 max-h-96 overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {cols.map((c) => (
                  <TableHead key={c} className="whitespace-nowrap">
                    {fieldLabel(c)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.preview.map((r, i) => (
                <TableRow key={i}>
                  {cols.map((c) => (
                    <TableCell key={c} className="num whitespace-nowrap">
                      {formatField(c, r[c])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {p.preview.length < p.row_count && (
        <p className="mb-4 text-xs text-muted-foreground">
          Showing the first {p.preview.length} of {p.row_count} records.
        </p>
      )}

      {commit.error && (
        <div className="mb-4">
          <ErrorState
            error={commit.error}
            title="Import wasn't saved"
            onRetry={canConfirm ? () => commit.mutate(p.id) : undefined}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={!canConfirm} onClick={() => commit.mutate(p.id)}>
          {commit.isPending && <Loader2 className="animate-spin" />} Confirm import
        </Button>
        <Button variant="ghost" disabled={commit.isPending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
