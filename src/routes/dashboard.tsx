import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/sidework/dashboard";
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — sidework" },
      {
        name: "description",
        content:
          "Ask Sidework about restaurant operations and receive source-backed visual answers.",
      },
      { property: "og:title", content: "Dashboard — sidework" },
      {
        property: "og:description",
        content: "A simpler, conversational view of restaurant operations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
