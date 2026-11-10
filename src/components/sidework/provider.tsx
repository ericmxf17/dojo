import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Download, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { useSideWork, useTemplates } from "@/lib/sidework/context";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
import type { RecordKind } from "@/lib/sidework/types";
import { templateCsv } from "@/lib/sidework/csv";
import { downloadFile } from "@/lib/sidework/workspace-api";
import { EmptyState, ErrorState, LoadingBlock } from "./states";
export function Provider({ provider }: { provider: string }) {
  const p = PROVIDERS.find((p) => p.id === provider);
  const { workspace, date, keyBase, openSources } = useWorkspace();
  const { api } = useSideWork();
  const qc = useQueryClient();
  const [kind, setKind] = useState<RecordKind>(p?.kinds[0] ?? "labor");
  const [notice, setNotice] = useState("");
  const templates = useTemplates();
  const records = useWorkspaceQuery(["provider", provider, date], () =>
    workspace.provider(provider, date),
  );
  const preview = useMutation({
    mutationFn: (file: File) => workspace.providerImport(provider, kind, file),
  });
  const commit = useMutation({
    mutationFn: (id: string) => api.commitImport(id),
    onSuccess: (r) => {
      preview.reset();
      setNotice(`${r.row_count} mapped records imported. Vendor connection remains not connected.`);
      qc.invalidateQueries({ queryKey: keyBase });
    },
  });
  if (!p) return <EmptyState title="Unknown provider workspace" />;
  return (
    <div>
      <p className="mb-3 text-sm text-primary">PROVIDER WORKSPACE</p>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-5xl font-medium">{p.name}</h1>
          <p className="mt-4 text-lg text-muted-foreground">{p.description}</p>
        </div>
        <div className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
          <Circle className="size-3" />
          NOT CONNECTED
        </div>
      </div>
      <div className="mb-8 border-y border-border py-6">
        <h2 className="text-xl font-medium">
          {provider === "resy"
            ? "Connection setup information"
            : "Mapped records, clearly attributed."}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
          {provider === "resy"
            ? "Resy is a setup-only workspace. No reservation data, reservation endpoint, OAuth or sync is available in the existing backend. No guest data has been fetched."
            : "These are owner-uploaded CSV records, not data fetched from the vendor API. Native exports must first be mapped to Side Work’s exact templates. No OAuth or live sync is configured."}
        </p>
      </div>
      {provider !== "resy" && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <label className="field">
              Record category
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value as RecordKind);
                  preview.reset();
                }}
              >
                {p.kinds.map((k) => (
                  <option value={k} key={k}>
                    {k === "labor" ? "Employee hours" : k}
                  </option>
                ))}
              </select>
            </label>
            <label className="field cursor-pointer self-end">
              <span className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
                <Upload className="size-4" />
                Import mapped CSV
              </span>
              <input
                type="file"
                accept=".csv"
                aria-label="Import mapped provider CSV"
                className="sr-only"
                disabled={preview.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) preview.mutate(f);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              variant="outline"
              className="self-end"
              onClick={() => {
                const t = templates.data?.find((t) => t.kind === kind);
                if (t) downloadFile(new Blob([templateCsv(t)], { type: "text/csv" }), t.filename);
              }}
              disabled={!templates.data}
            >
              <Download />
              Download template
            </Button>
          </div>
          {notice && (
            <p role="status" className="mb-4 text-primary">
              {notice}
            </p>
          )}
          {preview.isPending && <LoadingBlock label="Validating mapped CSV" />}
          {preview.error && <ErrorState error={preview.error} />}{" "}
          {preview.data && (
            <div className="mb-7 border-y border-border py-5">
              <h3 className="mb-2 font-medium">
                {preview.data.filename} · {preview.data.row_count} records
              </h3>
              {preview.data.errors.length ? (
                <ul className="space-y-2 text-sm text-destructive">
                  {preview.data.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row ?? "file"}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <div className="max-h-48 overflow-auto">
                    <pre className="text-xs text-muted-foreground">
                      {JSON.stringify(preview.data.preview, null, 2)}
                    </pre>
                  </div>
                  <Button
                    className="mt-4"
                    disabled={commit.isPending || preview.data.status !== "previewed"}
                    onClick={() => {
                      if (preview.data) commit.mutate(preview.data.id);
                    }}
                  >
                    <Check />
                    Confirm mapped import
                  </Button>
                </>
              )}
            </div>
          )}
          {commit.error && <ErrorState error={commit.error} />}
          <section className="mt-10">
            <h2 className="mb-4 text-2xl font-medium">Attributed records</h2>
            {records.isLoading && <LoadingBlock />}
            {records.error && (
              <ErrorState error={records.error} onRetry={() => records.refetch()} />
            )}{" "}
            {records.data?.length === 0 && (
              <EmptyState title="No attributed records for this service date">
                Imported sample totals are not automatically assigned to a provider.
              </EmptyState>
            )}
            {records.data?.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 border-b border-border py-4"
              >
                <div>
                  <p className="font-medium">{r.source.filename}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {r.kind} · Row {r.source.row_number} · {r.source.external_id}
                  </p>
                </div>
                <Button variant="outline" onClick={() => openSources(p.name, [r.source])}>
                  View source
                </Button>
              </div>
            ))}
          </section>
        </>
      )}
      <div className="mt-10">
        <h2 className="text-xl font-medium">Setup status</h2>
        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>Vendor credentials: not configured</li>
          <li>Live connection: not connected</li>
          <li>Background synchronization: unavailable</li>
          <li>
            {provider === "resy"
              ? "Reservation records: unavailable"
              : "Supported mapped categories: " + p.kinds.join(", ")}
          </li>
        </ul>
        <Button asChild variant="link" className="mt-4 px-0">
          <Link to="/imports">View all imports →</Link>
        </Button>
      </div>
    </div>
  );
}
