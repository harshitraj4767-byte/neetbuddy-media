import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { Route as RouteIcon, Target, LineChart, TrendingUp, Sparkles } from "lucide-react";

export const Route = createFileRoute("/analyse")({
  head: () => ({
    meta: [
      { title: "Analyse — Neet Buddy" },
      { name: "description", content: "AI study path, score predictor, weekly progress and improvement areas." },
      { property: "og:title", content: "Analyse — Neet Buddy" },
      { property: "og:description", content: "AI study path, score predictor, weekly progress and improvement areas." },
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
  { to: "/improvement", label: "Improvement areas", tag: "Impact", accent: "orange", desc: "Weakest chapters ranked by impact.", Icon: TrendingUp, image: "/illustrations/i3d-improvement-areas.png", imageAlt: "3D magnifier with chart icon" },
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
        imageAlt="Magnifying glass over neon performance charts"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
