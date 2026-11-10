import { createFileRoute } from "@tanstack/react-router";
import { Payroll } from "@/components/sidework/payroll";
export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [
      { title: "Payroll preparation — sidework" },
      {
        name: "description",
        content: "Review employee hours and save consolidated payroll preparation drafts.",
      },
      { property: "og:title", content: "Payroll preparation — sidework" },
      {
        property: "og:description",
        content: "Review employee hours and save consolidated payroll preparation drafts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Payroll,
});
