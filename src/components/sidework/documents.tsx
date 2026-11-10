import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, FileText, Download, Upload, Archive, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { PageHeader, ErrorState, LoadingBlock, EmptyState } from "./states";
import type { CabinetDocument, DocumentInput, Version } from "@/lib/sidework/workspace-types";
import { downloadFile } from "@/lib/sidework/workspace-api";
import { formatDate } from "@/lib/sidework/format";
const empty: DocumentInput = {
  title: "",
  category: "permit",
  deadline: null,
  notes: "",
  status: "active",
};
export function Documents() {
  const { workspace, date, keyBase, mode } = useWorkspace();
  const qc = useQueryClient();
  const q = useWorkspaceQuery(["documents"], () => workspace.documents());
  const [filter, setFilter] = useState("active");
  const [form, setForm] = useState<DocumentInput>(empty);
  const [edit, setEdit] = useState<string | undefined>();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const detail = useWorkspaceQuery(["document", selected], () =>
    selected ? workspace.document(selected) : Promise.resolve(null),
  );
  const refresh = () => qc.invalidateQueries({ queryKey: [...keyBase, "workspace"] });
  const save = useMutation({
    mutationFn: () => workspace.saveDocument(form, edit),
    onSuccess: (d) => {
      setOpen(false);
      setSelected(d.id);
      setNotice("Document metadata saved. Add a file version when ready.");
      refresh();
    },
  });
  const upload = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => workspace.uploadVersion(id, file),
    onSuccess: () => {
      setNotice("New file version saved. Earlier versions are unchanged.");
      refresh();
    },
  });
  const archive = useMutation({
    mutationFn: (d: CabinetDocument) =>
      workspace.saveDocument(
        {
          title: d.title,
          category: d.category,
          deadline: d.deadline,
          notes: d.notes,
          status: d.status === "active" ? "archived" : "active",
        },
        d.id,
      ),
    onSuccess: () => refresh(),
  });
  const dl = useMutation({
    mutationFn: async ({ id, v }: { id: string; v: Version }) =>
      downloadFile(await workspace.downloadVersion(id, v), v.filename),
  });
  const rows =
    q.data?.filter(
      (d) =>
        filter === "all" ||
        (filter === "archived" && d.status === "archived") ||
        (filter === "active" && d.status === "active") ||
        (filter === "overdue" && d.status === "active" && !!d.deadline && d.deadline < date) ||
        (filter === "upcoming" && d.status === "active" && !!d.deadline && d.deadline >= date),
    ) ?? [];
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="A home for your paperwork." />
        <Button
          onClick={() => {
            setForm(empty);
            setEdit(undefined);
            setOpen(true);
          }}
        >
          <Plus />
          New document
        </Button>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {["active", "upcoming", "overdue", "archived", "all"].map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
            className="capitalize"
          >
            {f}
          </Button>
        ))}
      </div>
      {notice && (
        <p role="status" className="mb-5 text-primary">
          {notice}
        </p>
      )}
      {q.isLoading && <LoadingBlock />}
      {q.error && <ErrorState error={q.error} />}{" "}
      {q.data && rows.length === 0 && <EmptyState title="No documents match this filter" />}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((d) => (
          <div key={d.id} className="rounded-md border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <FileText className="size-8 text-primary" />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Edit ${d.title}`}
                onClick={() => {
                  setForm({
                    title: d.title,
                    category: d.category,
                    deadline: d.deadline,
                    notes: d.notes,
                    status: d.status,
                  });
                  setEdit(d.id);
                  setOpen(true);
                }}
              >
                <Pencil />
              </Button>
            </div>
            <h2 className="mt-5 text-xl font-medium">{d.title}</h2>
            <p className="mt-2 text-sm capitalize text-muted-foreground">
              {d.category} · {d.status}
            </p>
            <p className="mt-5 text-sm">
              {d.deadline ? `Review by ${formatDate(d.deadline)}` : "No deadline recorded"}
              {d.deadline && d.deadline < date && d.status === "active" ? " · Overdue" : ""}
            </p>
            <Button variant="link" className="mt-4 p-0" onClick={() => setSelected(d.id)}>
              Open document & versions →
            </Button>
          </div>
        ))}
      </div>
      <p className="mt-7 text-sm text-muted-foreground">
        {mode === "sample"
          ? "Files are saved in this browser using local file storage. They are not uploaded to a server."
          : "File versions are stored by your connected backend."}{" "}
        Review notes are organizational only, not legal advice.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card">
          <DialogTitle>{edit ? "Edit document" : "New document"}</DialogTitle>
          <DialogDescription>
            Save metadata first, then add separate file versions. Replacements never overwrite older
            files.
          </DialogDescription>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <label className="field">
              Title
              <input
                required
                maxLength={250}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="field">
                Category
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {[
                    "license",
                    "permit",
                    "insurance",
                    "lease",
                    "employment",
                    "contract",
                    "other",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Deadline
                <input
                  type="date"
                  value={form.deadline ?? ""}
                  onChange={(e) => setForm({ ...form, deadline: e.target.value || null })}
                />
              </label>
            </div>
            <label className="field">
              Owner notes / review notes
              <textarea
                maxLength={5000}
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </label>
            {save.error && <ErrorState error={save.error} />}
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? "Saving…" : "Save metadata"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-card">
          <DialogTitle>{detail.data?.title ?? "Document"}</DialogTitle>
          <DialogDescription>Immutable file versions · 10 MB per file</DialogDescription>
          {detail.isLoading && <LoadingBlock />}
          {detail.error && <ErrorState error={detail.error} />}{" "}
          {detail.data && (
            <>
              <p className="text-sm text-muted-foreground">
                {detail.data.deadline
                  ? "Deadline: " + formatDate(detail.data.deadline)
                  : "No deadline recorded"}
              </p>
              <div className="border-y border-border py-4">
                <h3 className="mb-2 font-medium">Review notes</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {detail.data.notes || "No review notes yet."}
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Confirm deadlines with the issuer. Record questions for a qualified adviser; no
                  legal interpretation is generated.
                </p>
              </div>
              <h3 className="font-medium">Version history</h3>
              {!detail.data.versions?.length && (
                <p className="text-sm text-muted-foreground">No files uploaded yet.</p>
              )}
              {detail.data.versions?.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium">{v.filename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Version {v.version} · {(v.size_bytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Download version ${v.version}`}
                    disabled={dl.isPending}
                    onClick={() => {
                      if (selected) dl.mutate({ id: selected, v });
                    }}
                  >
                    <Download />
                  </Button>
                </div>
              ))}
              <label className="field">
                Add new file version
                <input
                  aria-label="Add document file version"
                  type="file"
                  disabled={upload.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file && selected) upload.mutate({ id: selected, file });
                    e.target.value = "";
                  }}
                />
              </label>
              {upload.error && <ErrorState error={upload.error} />}{" "}
              {dl.error && <ErrorState error={dl.error} />}
              <Button
                variant="outline"
                disabled={archive.isPending}
                onClick={() => {
                  if (detail.data) archive.mutate(detail.data);
                }}
              >
                <Archive />
                {detail.data.status === "active" ? "Archive document" : "Restore document"}
              </Button>
              {archive.error && <ErrorState error={archive.error} />}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
