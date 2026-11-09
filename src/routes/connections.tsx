import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileSpreadsheet, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorState, LoadingBlock, PageHeader } from "@/components/sidework/states";
import { useIntegrations } from "@/lib/sidework/context";
import type { Integration } from "@/lib/sidework/types";

export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Side Work" },
      { name: "description", content: "How Side Work brings in records alongside Toast, Resy, and CSV imports." },
      { property: "og:title", content: "Connections — Side Work" },
      { property: "og:description", content: "Side Work works alongside your existing restaurant tools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connections,
});

function Connections() {
  const q = useIntegrations();
  const [req, setReq] = useState<Integration | null>(null);
  return (
    <div>
      <PageHeader title="Connections">
        Side Work works alongside the tools you already use. Toast and Resy keep doing their jobs; Side Work helps you read across them.
      </PageHeader>
      {q.isLoading && <LoadingBlock />}
      {q.error && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {q.data && (
        <div className="grid gap-4 md:grid-cols-3">
          {q.data.map((i) => {
            const available = i.status === "available" || i.status === "connected";
            return (
              <div key={i.id} className="panel flex flex-col gap-3 p-5">
                <div className="flex items-center gap-2">
                  {i.id === "csv" ? <FileSpreadsheet className="size-5 text-cobalt" aria-hidden /> : <Plug className="size-5 text-muted-foreground" aria-hidden />}
                  <h2 className="font-display text-2xl">{i.name}</h2>
                </div>
                <span className={`self-start rounded-sm px-2 py-0.5 text-xs font-medium ${available ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                  {i.status === "available" ? "Available" : i.status === "connected" ? "Connected" : "Not connected"}
                </span>
                <p className="flex-1 text-sm text-muted-foreground">{i.description}</p>
                {i.id === "csv" ? (
                  <Button asChild variant="outline" className="self-start"><Link to="/imports">Go to imports</Link></Button>
                ) : (
                  <Button variant="outline" className="self-start" onClick={() => setReq(i)}>View setup requirements</Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <Dialog open={!!req} onOpenChange={(o) => !o && setReq(null)}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-normal">Connecting {req?.name}</DialogTitle>
            <DialogDescription>A direct {req?.name} connection isn’t available yet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>To bring {req?.name} records in automatically, Side Work would need:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Authorized access granted by {req?.name} for your restaurant account.</li>
              <li>A Side Work connector for {req?.name}, which hasn’t been built yet.</li>
            </ul>
            <p className="text-muted-foreground">Until then, export reports from {req?.name} as CSV and use the matching Side Work template on the Imports page.</p>
          </div>
          <Button asChild className="self-start"><Link to="/imports" onClick={() => setReq(null)}>Go to imports</Link></Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
