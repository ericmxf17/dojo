import { createFileRoute, notFound } from "@tanstack/react-router";
import { Provider } from "@/components/sidework/provider";
import { PROVIDERS } from "@/lib/sidework/workspace-types";
export const Route = createFileRoute("/providers/$provider")({
  beforeLoad: ({ params }) => {
    if (!PROVIDERS.some((p) => p.id === params.provider)) throw notFound();
  },
  head: ({ params }) => {
    const p = PROVIDERS.find((p) => p.id === params.provider);
    const title = `${p?.name ?? "Provider"} workspace — sidework`;
    const description = `${p?.description ?? "Restaurant tools"}: mapped imports and honest connection status.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProviderPage,
});
function ProviderPage() {
  const { provider } = Route.useParams();
  return <Provider key={provider} provider={provider} />;
}
