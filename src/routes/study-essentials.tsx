import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { NavTiles, HubHero, type NavTile } from "@/components/nav-tiles";
import { BookOpen, Highlighter, ScrollText, Layers, GraduationCap, BookMarked, FlaskConical, FileText, ListChecks } from "lucide-react";
import { ShortNotesBrowser } from "@/components/short-notes-browser";

export const Route = createFileRoute("/study-essentials")({
  head: () => ({
    meta: [
      { title: "Study Essentials — Neet Buddy" },
      { name: "description", content: "NCERT highlights, highlighted NCERT, short notes and flashcards for NEET revision." },
      { property: "og:title", content: "Study Essentials — Neet Buddy" },
      { property: "og:description", content: "NCERT highlights, highlighted NCERT, short notes and flashcards for NEET revision." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StudyEssentialsPage,
});

function StudyEssentialsPage() {
  const [view, setView] = useState<"home" | "short_notes">("home");

  if (view === "short_notes") {
    return (
      <PageShell eyebrow="Study Essentials" title="Short Notes" description="Crisp chapter-wise revision notes, subject & class wise.">
        <ShortNotesBrowser onBack={() => setView("home")} />
      </PageShell>
    );
  }

  const tiles: NavTile[] = [
    { to: "/ncert-highlights", label: "NCERT Highlights", tag: "Key Points", accent: "blue", desc: "Chapter-wise NCERT key points and facts.", Icon: GraduationCap },
    { to: "/highlighted-ncert", label: "Highlighted NCERT", tag: "Important", accent: "amber", desc: "Important NCERT lines, highlighted for you.", Icon: Highlighter },
    { label: "Short Notes", tag: "Revision", accent: "emerald", desc: "Crisp chapter-wise revision notes.", Icon: ScrollText, onClick: () => setView("short_notes") },
    { to: "/flashcards", label: "Flashcards", tag: "Recall", accent: "violet", desc: "Quick-recall cards for active revision.", Icon: Layers },
    { to: "/pyqs", label: "NEET PYQs", tag: "2016–2025", accent: "pink", desc: "Full papers in real CBT mode.", Icon: BookMarked },
    { to: "/neetlab", label: "NEET Lab", tag: "3D + Sims", accent: "cyan", desc: "Interactive 3D models, simulations and virtual labs.", Icon: FlaskConical },
    { to: "/study-view", label: "Study Materials", tag: "PDFs", accent: "orange", desc: "Modules and resources shared by mentors.", Icon: FileText },
    { to: "/daily-checklist", label: "Daily Checklist", tag: "Habit", accent: "rose", desc: "Track your daily syllabus targets.", Icon: ListChecks },
  ];

  return (
    <PageShell>
      <HubHero
        eyebrow="Study Essentials"
        title="Everything to"
        highlight="revise faster"
        description="NCERT highlights, short notes, flashcards, labs and materials — all in one place."
        Icon={BookOpen}
        accent="emerald"
        image="/illustrations/hub-books.png"
        imageAlt="Stack of books with notes and a flask"
      />
      <NavTiles tiles={tiles} />
    </PageShell>
  );
}
