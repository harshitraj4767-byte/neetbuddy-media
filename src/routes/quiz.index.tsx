import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, type NavTile } from "@/components/nav-tiles";
import { BookOpenCheck, Sparkles, Swords, Trophy } from "lucide-react";

export const Route = createFileRoute("/quiz/")({
  head: () => ({
    meta: [
      { title: "Quiz Hub — Neet Buddy" },
      { name: "description", content: "Subject-wise quizzes, AI generated tests, battlegrounds and live contests in one place." },
      { property: "og:title", content: "Quiz Hub — Neet Buddy" },
      { property: "og:description", content: "Subject-wise quizzes, AI generated tests, battlegrounds and live contests in one place." },
    ],
  }),
  component: QuizHub,
});

const TILES: NavTile[] = [
  { to: "/quiz/subjects", label: "Subject-wise quiz", desc: "Practice Physics, Chemistry or Biology chapter-wise.", Icon: BookOpenCheck },
  { to: "/generate", label: "Generate test", desc: "Build a custom AI test with your own filters.", Icon: Sparkles },
  { to: "/battlegrounds", label: "Battlegrounds", desc: "1v1 live quiz battles against other aspirants.", Icon: Swords },
  { to: "/contests", label: "Contests", desc: "Daily and weekly ranked contests with prizes.", Icon: Trophy },
];

function QuizHub() {
  return (
    <PageShell eyebrow="Practice" title="Quiz" description="Pick how you want to practise today.">
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
