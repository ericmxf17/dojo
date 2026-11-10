import { createFileRoute } from "@tanstack/react-router";
import { Documents } from "@/components/sidework/documents";
export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "Legal Documents — sidework" },
      {
        name: "description",
        content: "Keep document metadata, immutable file versions and deadlines together.",
      },
      { property: "og:title", content: "Legal Documents — sidework" },
      {
        property: "og:description",
        content: "Keep document metadata, immutable file versions and deadlines together.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Documents,
});
