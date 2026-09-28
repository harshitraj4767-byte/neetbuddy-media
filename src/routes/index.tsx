import { createFileRoute } from "@tanstack/react-router";
import { SiteUnavailable } from "../components/site-unavailable";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "This site can’t be reached" },
      { name: "description", content: "The requested site is unavailable." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "This site can’t be reached" },
      { property: "og:description", content: "The requested site is unavailable." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return <SiteUnavailable />;
}
