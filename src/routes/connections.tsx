import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
import { useWorkspace } from "@/components/sidework/workspace-hooks";
export const Route = createFileRoute("/connections")({
  head: () => ({
    meta: [
      { title: "Tools — sidework" },
      {
        name: "description",
        content: "Explore dedicated restaurant provider workspaces and their connection status.",
      },
      { property: "og:title", content: "Tools — sidework" },
      {
        property: "og:description",
        content: "Restaurant tools, mapped records and honest connection states.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Connections,
});
function Connections() {
  const { workspace, mode } = useWorkspace();
  const [testing, setTesting] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});
  const setup: Record<string, string> = {
    toast: "Toast admin enables read-only API access and adds credentials on the server.",
    "7shifts": "Create an access token in Company Settings → Developer Tools.",
    marketman: "Request API Partner credentials from your MarketMan account manager.",
    restaurant365: "Request approved API or Secure Data Share access from Restaurant365.",
    resy: "Partner approval is required; use manual exports until then.",
  };
  return (
    <div>
      <h1 className="mb-8 text-4xl font-medium">Your restaurant tools.</h1>
      {PROVIDERS.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-6 border-b border-border py-6">
          <Link to="/providers/$provider" params={{ provider: p.id }} className="min-w-0 flex-1">
          <div>
            <h2 className="text-xl font-medium">{p.name}</h2>
            <p className="mt-2 text-muted-foreground">{p.description}</p>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">{setup[p.id]}</p>
          </div>
          </Link>
          <div className="shrink-0 text-right">
            {["toast", "7shifts", "marketman"].includes(p.id) ? (
              <button
                type="button"
                disabled={testing === p.id}
                className="rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50"
                onClick={async () => {
                  setTesting(p.id);
                  try {
                    const response = await workspace.testProvider(p.id);
                    setResult((old) => ({ ...old, [p.id]: response.note }));
                  } catch (error) {
                    setResult((old) => ({ ...old, [p.id]: error instanceof Error ? error.message : "Connection failed." }));
                  } finally {
                    setTesting(null);
                  }
                }}
              >
                {testing === p.id ? "Testing…" : "Test connection"}
              </button>
            ) : (
              <span className="text-sm text-muted-foreground">{p.id === "resy" ? "Approval required" : "Setup →"}</span>
            )}
            {result[p.id] && <p className="mt-2 max-w-xs text-xs text-muted-foreground">{result[p.id]}</p>}
            {mode !== "live" && ["toast", "7shifts", "marketman"].includes(p.id) && <p className="mt-2 text-xs text-muted-foreground">Live mode required</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
