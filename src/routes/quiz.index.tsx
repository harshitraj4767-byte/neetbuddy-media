import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { BookOpenCheck, Sparkles, Swords, Trophy, Brain } from "lucide-react";

export const Route = createFileRoute("/quiz/")({
  head: () => ({
    meta: [
      { title: "Quiz Hub — Neet Buddy" },
      { name: "description", content: "Subject-wise quizzes, AI generated tests, battlegrounds and live contests in one place." },
      { property: "og:title", content: "Quiz Hub — Neet Buddy" },
      { property: "og:description", content: "Subject-wise quizzes, AI generated tests, battlegrounds and live contests in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuizHub,
});

const TILES: NavTile[] = [
  { to: "/quiz/subjects", label: "Subject-wise quiz", tag: "Chapters", accent: "blue", desc: "Practice Physics, Chemistry or Biology chapter-wise.", Icon: BookOpenCheck, image: "/illustrations/i3d-subject-wise-quiz.png", imageAlt: "3D open book icon" },
  { to: "/generate", label: "Generate test", tag: "AI", accent: "emerald", desc: "Build a custom AI test with your own filters.", Icon: Sparkles, image: "/illustrations/i3d-generate-test.png", imageAlt: "3D test paper with pencil icon" },
  { to: "/battlegrounds", label: "Battlegrounds", tag: "1v1 Live", accent: "orange", desc: "Live quiz battles against other aspirants.", Icon: Swords, image: "/illustrations/i3d-battlegrounds.png", imageAlt: "3D crossed swords icon" },
  { to: "/contests", label: "Contests", tag: "Ranked", accent: "violet", desc: "Daily and weekly ranked contests with prizes.", Icon: Trophy, image: "/illustrations/i3d-contests.png", imageAlt: "3D contest trophy icon" },
];

function QuizHub() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Practice"
        title="Quiz your way"
        highlight="to success"
        description="Pick how you want to practise today — chapters, AI tests, battles or contests."
        Icon={Brain}
        accent="violet"
        image="/illustrations/hub-quiz.png"
        imageAlt="Trophy, dartboard and winners podium"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
