import { createFileRoute } from "@tanstack/react-router";

import { OryzoPage } from "@/components/OryzoPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ORYZO — Made for mugs. Built for tables." },
      {
        name: "description",
        content:
          "Meet ORYZO: the world's most unnecessarily sophisticated cork coaster. Designed by Lusion.",
      },
      { property: "og:title", content: "ORYZO — Made for mugs. Built for tables." },
      {
        property: "og:description",
        content: "The world's most unnecessarily sophisticated cork coaster. Designed by Lusion.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OryzoPage,
});