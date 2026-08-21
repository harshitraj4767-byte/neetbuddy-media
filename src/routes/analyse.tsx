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
  { to: "/ai-path", label: "AI study path", tag: "AI", accent: "violet", desc: "A personalised plan built from your performance.", Icon: RouteIcon, image: "/illustrations/i3d-ai-study-path.png", imageAlt: "3D AI chip icon" },
  { to: "/score-predictor", label: "Score predictor", tag: "Rank", accent: "blue", desc: "Estimate your NEET score and rank.", Icon: Target, image: "/illustrations/i3d-score-predictor.png", imageAlt: "3D dartboard with charts icon" },
  { to: "/progress", label: "Weekly progress report", tag: "Weekly", accent: "emerald", desc: "Week-on-week accuracy and consistency.", Icon: LineChart, image: "/illustrations/i3d-weekly-progress.png", imageAlt: "3D rising bar chart icon" },
  { to: "/bookmarks", label: "Bookmarks", tag: "Saved", accent: "amber", desc: "Every question you saved for later.", Icon: Bookmark, image: "/illustrations/i3d-bookmarks.png", imageAlt: "3D bookmark ribbon icon" },
  { to: "/mistakes", label: "My mistakes", tag: "Fix these", accent: "rose", desc: "Revisit and fix what you got wrong.", Icon: AlertTriangle, image: "/illustrations/i3d-my-mistakes.png", imageAlt: "3D warning triangle icon" },
  { to: "/analytics", label: "Deep analytics", tag: "Charts", accent: "cyan", desc: "Subject, chapter and difficulty breakdowns.", Icon: BarChart3, image: "/illustrations/i3d-deep-analytics.png", imageAlt: "3D pie and bar chart icon" },
  { to: "/improvement", label: "Improvement areas", tag: "Impact", accent: "orange", desc: "Weakest chapters ranked by impact.", Icon: TrendingUp, image: "/illustrations/i3d-improvement-areas.png", imageAlt: "3D magnifier with chart icon" },
  { to: "/leaderboard", label: "Leaderboard", tag: "Ranks", accent: "pink", desc: "See where you stand against everyone.", Icon: Trophy, image: "/illustrations/i3d-leaderboard.png", imageAlt: "3D golden trophy icon" },
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
        image="/illustrations/hub-analyse.png"
        imageAlt="Dartboard and performance charts"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
