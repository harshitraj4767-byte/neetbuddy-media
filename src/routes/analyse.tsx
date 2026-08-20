import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { Route as RouteIcon, Target, LineChart, Bookmark, AlertTriangle, BarChart3, TrendingUp, Trophy, Sparkles } from "lucide-react";

export const Route = createFileRoute("/analyse")({
  head: () => ({
    meta: [
      { title: "Analyse — Neet Buddy" },
      { name: "description", content: "AI study path, score predictor, weekly progress, bookmarks, mistakes and deep NEET analytics." },
      { property: "og:title", content: "Analyse — Neet Buddy" },
      { property: "og:description", content: "AI study path, score predictor, weekly progress, bookmarks, mistakes and deep NEET analytics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalyseHub,
});

const TILES: NavTile[] = [
  { to: "/ai-path", label: "AI study path", tag: "AI", accent: "violet", desc: "A personalised plan built from your performance.", Icon: RouteIcon },
  { to: "/score-predictor", label: "Score predictor", tag: "Rank", accent: "blue", desc: "Estimate your NEET score and rank.", Icon: Target },
  { to: "/progress", label: "Weekly progress report", tag: "Weekly", accent: "emerald", desc: "Week-on-week accuracy and consistency.", Icon: LineChart },
  { to: "/bookmarks", label: "Bookmarks", tag: "Saved", accent: "amber", desc: "Every question you saved for later.", Icon: Bookmark },
  { to: "/mistakes", label: "My mistakes", tag: "Fix these", accent: "rose", desc: "Revisit and fix what you got wrong.", Icon: AlertTriangle },
  { to: "/analytics", label: "Deep analytics", tag: "Charts", accent: "cyan", desc: "Subject, chapter and difficulty breakdowns.", Icon: BarChart3 },
  { to: "/improvement", label: "Improvement areas", tag: "Impact", accent: "orange", desc: "Weakest chapters ranked by impact.", Icon: TrendingUp },
  { to: "/leaderboard", label: "Leaderboard", tag: "Ranks", accent: "pink", desc: "See where you stand against everyone.", Icon: Trophy },
];

function AnalyseHub() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Insights"
        title="Analyse"
        highlight="your prep"
        description="Understand your preparation with data, not guesswork."
        Icon={Sparkles}
        accent="violet"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
