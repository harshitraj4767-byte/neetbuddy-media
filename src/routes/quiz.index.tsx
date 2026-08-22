import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, HubQuickLinks, type NavTile } from "@/components/nav-tiles";
import { BookOpenCheck, Sparkles, Swords, Brain, Bookmark, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/quiz/")({
  head: () => ({
    meta: [
      { title: "Quiz Hub — Neet Buddy" },
      { name: "description", content: "Subject-wise quizzes, AI generated tests, and the live Arena in one place." },
      { property: "og:title", content: "Quiz Hub — Neet Buddy" },
      { property: "og:description", content: "Subject-wise quizzes, AI generated tests, and the live Arena in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuizHub,
});

const TILES: NavTile[] = [
  { to: "/quiz/subjects", label: "Subject-wise quiz", tag: "Chapters", accent: "blue", desc: "Practice Physics, Chemistry or Biology chapter-wise.", Icon: BookOpenCheck, image: "/illustrations/i3d-subject-wise-quiz.png", imageAlt: "3D open book icon" },
  { to: "/generate", label: "Generate test", tag: "AI", accent: "emerald", desc: "Build a custom AI test with your own filters.", Icon: Sparkles, image: "/illustrations/i3d-generate-test.png", imageAlt: "3D test paper with pencil icon" },
  { to: "/arena", label: "Arena", tag: "Live", accent: "amber", desc: "Contests, 1v1 battlegrounds and tournaments in one place.", Icon: Swords, image: "/illustrations/i3d-arena.png", imageAlt: "3D trophy with crossed swords icon" },
];

function QuizHub() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Practice"
        title="Quiz your way"
        highlight="to success"
        description="Pick how you want to practise today — chapters, AI tests or the live Arena."
        Icon={Brain}
        accent="violet"
        image="/illustrations/hub-quiz.png"
        imageAlt="Trophy, dartboard and winners podium"
      />
      <HubQuickLinks
        links={[
          { to: "/bookmarks", label: "Bookmarks", Icon: Bookmark, accent: "amber" },
          { to: "/mistakes", label: "My mistakes", Icon: AlertTriangle, accent: "rose" },
        ]}
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
