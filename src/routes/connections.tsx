import { createFileRoute, Link } from "@tanstack/react-router";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
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
        <Link
          key={p.id}
          to="/providers/$provider"
          params={{ provider: p.id }}
          className="flex items-center justify-between border-b border-border py-6"
        >
          <div>
            <h2 className="text-xl font-medium">{p.name}</h2>
            <p className="mt-2 text-muted-foreground">{p.description}</p>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground">{setup[p.id]}</p>
          </div>
          <span className="text-sm text-muted-foreground">{p.id === "resy" ? "Approval required" : "Setup →"}</span>
        </Link>
      ))}
    </div>
  );
}
