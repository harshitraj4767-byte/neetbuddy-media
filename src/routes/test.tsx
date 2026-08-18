import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, type NavTile } from "@/components/nav-tiles";
import { Target, BookMarked, CalendarCheck, Infinity as InfinityIcon } from "lucide-react";

export const Route = createFileRoute("/test")({
  head: () => ({
    meta: [
      { title: "Tests — Neet Buddy" },
      { name: "description", content: "Full NEET mock tests, previous year papers, daily DPPs and Infinite Run in real CBT mode." },
      { property: "og:title", content: "Tests — Neet Buddy" },
      { property: "og:description", content: "Full NEET mock tests, previous year papers, daily DPPs and Infinite Run in real CBT mode." },
    ],
  }),
  component: TestHub,
});

const TILES: NavTile[] = [
  { to: "/mocks", label: "Mock tests", desc: "Full-length 180Q NEET mocks in real CBT mode.", Icon: Target },
  { to: "/pyqs", label: "Previous year tests", desc: "NEET PYQ papers from 2016–2025.", Icon: BookMarked },
  { to: "/dpp", label: "Daily practice (DPP)", desc: "Today's curated daily practice problems.", Icon: CalendarCheck },
  { to: "/infinite-run", label: "Infinite Run", desc: "Endless question streak — how far can you go?", Icon: InfinityIcon },
];

function TestHub() {
  return (
    <PageShell eyebrow="Exams" title="Test" description="Practise exactly like exam day.">
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
