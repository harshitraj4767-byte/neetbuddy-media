import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { Target, BookMarked, CalendarCheck, Infinity as InfinityIcon, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/test")({
  head: () => ({
    meta: [
      { title: "Tests — Neet Buddy" },
      { name: "description", content: "Full NEET mock tests, previous year papers, daily DPPs and Infinite Run in real CBT mode." },
      { property: "og:title", content: "Tests — Neet Buddy" },
      { property: "og:description", content: "Full NEET mock tests, previous year papers, daily DPPs and Infinite Run in real CBT mode." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TestHub,
});

const TILES: NavTile[] = [
  { to: "/mocks", label: "Mock tests", tag: "180Q", accent: "blue", desc: "Full-length NEET mocks in real CBT mode.", Icon: Target, image: "/illustrations/i3d-mock-tests.png", imageAlt: "3D mock test clipboard icon" },
  { to: "/pyqs", label: "Previous year tests", tag: "2016–2025", accent: "violet", desc: "Attempt original NEET question papers.", Icon: BookMarked, image: "/illustrations/i3d-previous-year-tests.png", imageAlt: "3D previous year papers book icon" },
  { to: "/dpp", label: "Daily practice (DPP)", tag: "Daily", accent: "emerald", desc: "Today's curated daily practice problems.", Icon: CalendarCheck, image: "/illustrations/i3d-dpp.png", imageAlt: "3D daily practice calendar icon" },
  { to: "/infinite-run", label: "Infinite Run", tag: "Streak", accent: "orange", desc: "Endless question streak — how far can you go?", Icon: InfinityIcon, image: "/illustrations/i3d-infinite-run.png", imageAlt: "3D infinity streak icon" },
];

function TestHub() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Exams"
        title="Test"
        highlight="like exam day"
        description="Timed, full-length and CBT-accurate — everything you need before the real thing."
        Icon={ClipboardList}
        accent="blue"
        image="/illustrations/hub-test.png"
        imageAlt="Mock test checklist with a stopwatch"
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
