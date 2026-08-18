import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, type NavTile } from "@/components/nav-tiles";
import { Route as RouteIcon, Target, LineChart, Bookmark, AlertTriangle, BarChart3, TrendingUp, Trophy } from "lucide-react";

export const Route = createFileRoute("/analyse")({
  head: () => ({
    meta: [
      { title: "Analyse — Neet Buddy" },
      { name: "description", content: "AI study path, score predictor, weekly progress, bookmarks, mistakes and deep NEET analytics." },
      { property: "og:title", content: "Analyse — Neet Buddy" },
      { property: "og:description", content: "AI study path, score predictor, weekly progress, bookmarks, mistakes and deep NEET analytics." },
    ],
  }),
  component: AnalyseHub,
});

const TILES: NavTile[] = [
  { to: "/ai-path", label: "AI study path", desc: "A personalised plan built from your performance.", Icon: RouteIcon },
  { to: "/score-predictor", label: "Score predictor", desc: "Estimate your NEET score and rank.", Icon: Target },
  { to: "/progress", label: "Weekly progress report", desc: "Week-on-week accuracy and consistency.", Icon: LineChart },
  { to: "/bookmarks", label: "Bookmarks", desc: "Every question you saved for later.", Icon: Bookmark },
  { to: "/mistakes", label: "My mistakes", desc: "Revisit and fix what you got wrong.", Icon: AlertTriangle },
  { to: "/analytics", label: "Deep analytics", desc: "Subject, chapter and difficulty breakdowns.", Icon: BarChart3 },
  { to: "/improvement", label: "Improvement areas", desc: "Weakest chapters ranked by impact.", Icon: TrendingUp },
  { to: "/leaderboard", label: "Leaderboard", desc: "See where you stand against everyone.", Icon: Trophy },
];

function AnalyseHub() {
  return (
    <PageShell eyebrow="Insights" title="Analyse" description="Understand your prep with data, not guesswork.">
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
