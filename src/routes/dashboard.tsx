import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/sidework/dashboard";
export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — sidework" },
      {
        name: "description",
        content: "Sales, employee hours, estimated base wages and restaurant deadlines.",
      },
      { property: "og:title", content: "Dashboard — sidework" },
      {
        property: "og:description",
        content: "Sales, employee hours, estimated base wages and restaurant deadlines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});
