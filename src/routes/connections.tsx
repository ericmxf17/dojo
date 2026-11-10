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
          </div>
          <span className="text-sm text-muted-foreground">Not connected →</span>
        </Link>
      ))}
    </div>
  );
}
