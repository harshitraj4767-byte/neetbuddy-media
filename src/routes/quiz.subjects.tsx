import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { Atom, FlaskConical, Leaf, BookOpenCheck } from "lucide-react";

export const Route = createFileRoute("/quiz/subjects")({
  head: () => ({
    meta: [
      { title: "Subject-wise Quiz — Neet Buddy" },
      { name: "description", content: "Choose Physics, Chemistry or Biology and start a chapter-wise NEET quiz." },
      { property: "og:title", content: "Subject-wise Quiz — Neet Buddy" },
      { property: "og:description", content: "Choose Physics, Chemistry or Biology and start a chapter-wise NEET quiz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubjectQuizPage,
});

const TILES: NavTile[] = [
  { to: "/subjects/$subject", params: { subject: "Physics" }, label: "Physics", tag: "Numericals", accent: "blue", desc: "Chapter-wise practice with difficulty filters.", Icon: Atom },
  { to: "/subjects/$subject", params: { subject: "Chemistry" }, label: "Chemistry", tag: "P + O + I", accent: "orange", desc: "Physical, Organic and Inorganic chapters.", Icon: FlaskConical },
  { to: "/subjects/$subject", params: { subject: "Biology" }, label: "Biology", tag: "360 marks", accent: "emerald", desc: "Botany and Zoology, NCERT-aligned.", Icon: Leaf },
];

function SubjectQuizPage() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Practice"
        title="Subject-wise"
        highlight="Quiz"
        description="Pick a subject, choose chapters and start practising instantly."
        Icon={BookOpenCheck}
        accent="emerald"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
