import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, type NavTile } from "@/components/nav-tiles";
import { Atom, FlaskConical, Leaf } from "lucide-react";

export const Route = createFileRoute("/quiz/subjects")({
  head: () => ({
    meta: [
      { title: "Subject-wise Quiz — Neet Buddy" },
      { name: "description", content: "Choose Physics, Chemistry or Biology and start a chapter-wise NEET quiz." },
      { property: "og:title", content: "Subject-wise Quiz — Neet Buddy" },
      { property: "og:description", content: "Choose Physics, Chemistry or Biology and start a chapter-wise NEET quiz." },
    ],
  }),
  component: SubjectQuizPage,
});

const TILES: NavTile[] = [
  { to: "/subjects/$subject", params: { subject: "Physics" }, label: "Physics", desc: "Chapter-wise practice with difficulty filters.", Icon: Atom },
  { to: "/subjects/$subject", params: { subject: "Chemistry" }, label: "Chemistry", desc: "Physical, Organic and Inorganic chapters.", Icon: FlaskConical },
  { to: "/subjects/$subject", params: { subject: "Biology" }, label: "Biology", desc: "Botany and Zoology, NCERT-aligned.", Icon: Leaf },
];

function SubjectQuizPage() {
  return (
    <PageShell eyebrow="Practice" title="Subject-wise quiz" description="Pick a subject to choose chapters and start.">
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
