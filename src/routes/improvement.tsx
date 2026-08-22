import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { TrendingUp, Bookmark, AlertTriangle, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/improvement")({
  head: () => ({
    meta: [
      { title: "Improvement Zone — Neet Buddy" },
      { name: "description", content: "Fix your mistakes, revisit bookmarked questions and dig into deep NEET analytics." },
      { property: "og:title", content: "Improvement Zone — Neet Buddy" },
      { property: "og:description", content: "Fix your mistakes, revisit bookmarked questions and dig into deep NEET analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImprovementZone,
});

const TILES: NavTile[] = [
  { to: "/mistakes", label: "My mistakes", tag: "Fix these", accent: "rose", desc: "Revisit and fix what you got wrong.", Icon: AlertTriangle, image: "/illustrations/i3d-my-mistakes.png", imageAlt: "3D warning triangle icon" },
  { to: "/bookmarks", label: "Bookmarks", tag: "Saved", accent: "amber", desc: "Every question you saved for later.", Icon: Bookmark, image: "/illustrations/i3d-bookmarks.png", imageAlt: "3D bookmark ribbon icon" },
  { to: "/analytics", label: "Deep analytics", tag: "Charts", accent: "cyan", desc: "Subject, chapter and difficulty breakdowns.", Icon: BarChart3, image: "/illustrations/i3d-deep-analytics.png", imageAlt: "3D pie and bar chart icon" },
];

function ImprovementZone() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Improve"
        title="Improvement"
        highlight="zone"
        description="Weak chapters, past mistakes and saved questions — everything you need to level up."
        Icon={TrendingUp}
        accent="orange"
        image="/illustrations/hub-improvement.png"
        imageAlt="Magnifying glass over rising bar charts"
        compact
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
