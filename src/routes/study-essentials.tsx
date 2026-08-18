import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { BookOpen, Highlighter, ScrollText, Layers, GraduationCap, BookMarked, FlaskConical, FileText, ListChecks } from "lucide-react";
import { ShortNotesBrowser } from "@/components/short-notes-browser";

export const Route = createFileRoute("/study-essentials")({
  head: () => ({
    meta: [
      { title: "Study Essentials — Neet Buddy" },
      { name: "description", content: "NCERT highlights, highlighted NCERT, short notes and flashcards for NEET revision." },
    ],
  }),
  component: StudyEssentialsPage,
});


function StudyEssentialsPage() {
  const [view, setView] = useState<"home" | "short_notes">("home");

  // ---------- Short Notes flow: subject → class → chapter downloads ----------
  if (view === "short_notes") {
    return (
      <PageShell eyebrow="Study Essentials" title="Short Notes" description="Crisp chapter-wise revision notes, subject &amp; class wise.">
        <ShortNotesBrowser onBack={() => setView("home")} />
      </PageShell>
    );
  }

  const tiles: { key: string; label: string; desc: string; Icon: typeof BookOpen; onClick?: () => void; to?: "/ncert-highlights" | "/highlighted-ncert" | "/flashcards" | "/pyqs" | "/neetlab" | "/study-view" | "/daily-checklist" }[] = [
    { key: "ncert", label: "NCERT Highlights", desc: "Chapter-wise NCERT key points and facts.", Icon: GraduationCap, to: "/ncert-highlights" },
    { key: "hncert", label: "Highlighted NCERT", desc: "Important NCERT lines, highlighted for you.", Icon: Highlighter, to: "/highlighted-ncert" },
    { key: "notes", label: "Short Notes", desc: "Crisp chapter-wise revision notes.", Icon: ScrollText, onClick: () => setView("short_notes") },
    { key: "cards", label: "Flashcards", desc: "Quick-recall cards for active revision.", Icon: Layers, to: "/flashcards" },
    { key: "pyqs", label: "NEET PYQs", desc: "Full papers from 2016–2025 in CBT mode.", Icon: BookMarked, to: "/pyqs" },
    { key: "neetlab", label: "NEET Lab", desc: "Interactive 3D models, simulations and virtual labs.", Icon: FlaskConical, to: "/neetlab" },
    { key: "materials", label: "Study Materials", desc: "PDFs, modules and resources shared by mentors.", Icon: FileText, to: "/study-view" },
    { key: "checklist", label: "Daily Checklist", desc: "Track your daily syllabus targets.", Icon: ListChecks, to: "/daily-checklist" },
  ];

  return (
    <PageShell
      eyebrow="Study Essentials"
      title="Study Essentials"
      description="Everything you need to revise — NCERT highlights, short notes and flashcards."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => {
          const inner = (
            <div className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
                <t.Icon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-base font-bold leading-tight">{t.label}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            </div>
          );
          return t.to
            ? <Link key={t.key} to={t.to}>{inner}</Link>
            : <button key={t.key} type="button" onClick={t.onClick} className="text-left">{inner}</button>;
        })}
      </div>
    </PageShell>
  );
}
