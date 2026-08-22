import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, HubQuickLinks, type NavTile } from "@/components/nav-tiles";
import { Target, BookMarked, CalendarCheck, ClipboardList, BarChart3 } from "lucide-react";
import { useForceLightMode } from "@/hooks/use-force-light";

export const Route = createFileRoute("/test")({
  head: () => ({
    meta: [
      { title: "Tests — Neet Buddy" },
      { name: "description", content: "Full NEET mock tests, previous year papers, and daily DPPs in real CBT mode." },
      { property: "og:title", content: "Tests — Neet Buddy" },
      { property: "og:description", content: "Full NEET mock tests, previous year papers, and daily DPPs in real CBT mode." },
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
];

function TestHub() {
  // Exam surfaces stay in light mode so question images stay legible.
  useForceLightMode();
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
      <HubQuickLinks
        links={[{ to: "/analytics", label: "Do test analysis", Icon: BarChart3, accent: "cyan" }]}
      />
      <NavTiles tiles={TILES} />
    </PageShell>
  );
}
