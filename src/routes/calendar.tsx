import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "@/components/sidework/calendar";
export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar & Orders — sidework" },
      {
        name: "description",
        content: "Plan restaurant events, deliveries and recurring order drafts.",
      },
      { property: "og:title", content: "Calendar & Orders — sidework" },
      {
        property: "og:description",
        content: "Plan restaurant events, deliveries and recurring order drafts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Calendar,
});
