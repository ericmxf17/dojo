import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Check, Files, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatCents, formatDate } from "@/lib/sidework/format";
import { downloadFile } from "@/lib/sidework/workspace-api";
import type { Adjustment, PayrollReport } from "@/lib/sidework/workspace-types";
import { useWorkspace, useWorkspaceQuery } from "./workspace-hooks";
import { PageHeader, ErrorState, LoadingBlock, EmptyState } from "./states";
export function Payroll() {
  const { workspace, keyBase, openSources } = useWorkspace();
  const qc = useQueryClient();
  const [start, setStart] = useState("2026-11-08");
  const [end, setEnd] = useState("2026-11-09");
  const [adjustments, setAdjustments] = useState<Record<string, Adjustment>>({});
  const [review, setReview] = useState(false);
  const [notice, setNotice] = useState("");
  const preview = useWorkspaceQuery(["payroll", start, end], () =>
    workspace.payrollPreview(start, end),
  );
  const runs = useWorkspaceQuery(["runs"], () => workspace.payrollRuns());
  const save = useMutation({
    mutationFn: () =>
      workspace.createPayroll(start, end, Object.values(adjustments), crypto.randomUUID()),
    onSuccess: () => {
      setReview(false);
      setNotice("Payroll preparation draft saved.");
      qc.invalidateQueries({ queryKey: [...keyBase, "workspace", "runs"] });
    },
  });
  const exporter = useMutation({
    mutationFn: async ({ run, format }: { run: PayrollReport; format: "csv" | "html" }) =>
      downloadFile(
        await workspace.exportPayroll(run, format),
        `sidework-payroll-${run.start}-${run.end}.${format}`,
      ),
  });
  const employees = preview.data?.employees ?? [];
  const total = employees.reduce((n, e) => {
    const a = adjustments[e.employee];
    return (
      n +
      e.base_wages_cents +
      (a?.tips_cents ?? 0) +
      (a?.bonus_cents ?? 0) +
      (a?.reimbursement_cents ?? 0)
    );
  }, 0);
  return (
    <div>
      <PageHeader title="Payroll, brought together." />
      <p className="-mt-4 mb-7 text-muted-foreground">
        Review imported hours and owner-entered adjustments. Save one consolidated preparation
        draft.
      </p>
      <div className="mb-7 flex flex-wrap items-end gap-4">
        <label className="field">
          Start date
          <input
            aria-label="Payroll start date"
            type="date"
            value={start}
            onChange={(e) => {
              if (e.target.value) {
                setStart(e.target.value);
                setAdjustments({});
              }
            }}
          />
        </label>
        <label className="field">
          End date
          <input
            aria-label="Payroll end date"
            type="date"
            value={end}
            onChange={(e) => {
              if (e.target.value) {
                setEnd(e.target.value);
                setAdjustments({});
              }
            }}
          />
        </label>
        <p className="pb-2 text-sm text-muted-foreground">Both dates included</p>
        <Button
          className="ml-auto"
          disabled={!employees.length || preview.isFetching || !!preview.error}
          onClick={() => setReview(true)}
        >
          <Check />
          Review & save draft
        </Button>
      </div>
      {notice && (
        <p role="status" className="mb-5 text-primary">
          {notice}
        </p>
      )}
      {preview.isLoading && <LoadingBlock />}
      {preview.error && <ErrorState error={preview.error} onRetry={() => preview.refetch()} />}{" "}
      {preview.data?.missing_data && (
        <EmptyState title="No labor records in this period">
          No draft can be created until labor records are imported.
        </EmptyState>
      )}
      {employees.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Hours</th>
                  <th>Base wages</th>
                  <th>Tips ($)</th>
                  <th>Bonus ($)</th>
                  <th>Reimbursement ($)</th>
                  <th>Sources</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.employee}>
                    <td className="font-medium">{e.employee}</td>
                    <td>{e.hours}</td>
                    <td>{formatCents(e.base_wages_cents)}</td>
                    {(["tips_cents", "bonus_cents", "reimbursement_cents"] as const).map((k) => (
                      <td key={k}>
                        <input
                          aria-label={`${e.employee} ${k.replace("_cents", "")}`}
                          type="number"
                          min="0"
                          max="1000000"
                          step="0.01"
                          value={(adjustments[e.employee]?.[k] ?? 0) / 100}
                          onChange={(event) =>
                            setAdjustments((a) => ({
                              ...a,
                              [e.employee]: {
                                employee: e.employee,
                                tips_cents: a[e.employee]?.tips_cents ?? 0,
                                bonus_cents: a[e.employee]?.bonus_cents ?? 0,
                                reimbursement_cents: a[e.employee]?.reimbursement_cents ?? 0,
                                [k]: Math.round(Number(event.target.value) * 100),
                              },
                            }))
                          }
                        />
                      </td>
                    ))}
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Supporting records for ${e.employee}`}
                        onClick={() => openSources(e.employee, e.sources)}
                      >
                        <ArrowUpRight />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-4 border-b border-border py-6">
            <div>
              <p className="text-sm text-muted-foreground">Total imported hours</p>
              <p className="mt-2 text-3xl font-medium">{preview.data?.total_hours}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated draft total</p>
              <p className="mt-2 text-3xl font-medium">{formatCents(total)}</p>
            </div>
          </div>
        </>
      )}
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
        Payroll preparation draft only. No payroll is submitted or money moved. Taxes, deductions,
        overtime premiums and final net pay are not calculated. Resolve duplicate employee names and
        shifts before review.
      </p>
      <section className="mt-10">
        <h2 className="mb-5 text-2xl font-medium">Saved drafts</h2>
        {runs.isLoading && <LoadingBlock />}
        {runs.error && <ErrorState error={runs.error} />}{" "}
        {runs.data?.length === 0 && <EmptyState title="No saved payroll drafts" />}
        {runs.data?.map((run) => (
          <div
            key={run.id}
            className="flex flex-wrap items-center justify-between gap-4 border-y border-border py-5"
          >
            <div className="flex gap-3">
              <Files className="mt-1 size-5 text-primary" />
              <div>
                <h3 className="font-medium">Payroll preparation draft</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatDate(run.start)} – {formatDate(run.end)} · {run.total_hours} hours ·{" "}
                  {formatCents(run.totals.estimated_total_cents)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={exporter.isPending}
                onClick={() => exporter.mutate({ run, format: "csv" })}
              >
                <Download />
                CSV
              </Button>
              <Button
                variant="outline"
                disabled={exporter.isPending}
                onClick={() => exporter.mutate({ run, format: "html" })}
              >
                <Download />
                Printable HTML
              </Button>
            </div>
          </div>
        ))}
        {exporter.error && <ErrorState error={exporter.error} />}
      </section>
      <Dialog open={review} onOpenChange={setReview}>
        <DialogContent className="bg-card">
          <DialogTitle>Review payroll preparation draft</DialogTitle>
          <DialogDescription>
            {formatDate(start)} through {formatDate(end)}, inclusive. This saves an immutable
            snapshot of the current imported hours and entered adjustments.
          </DialogDescription>
          <p className="text-3xl font-medium">{formatCents(total)}</p>
          <p className="text-sm text-muted-foreground">
            {employees.length} employees · {preview.data?.total_hours} imported hours. Confirm
            employee aliases, all shifts, tips and adjustments before saving. This is not final net
            pay.
          </p>
          {save.error && <ErrorState error={save.error} />}
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save preparation draft"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
