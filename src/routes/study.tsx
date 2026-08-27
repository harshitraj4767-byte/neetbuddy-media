import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Sparkles, ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import studyMascot from "@/assets/study-mascot.png";

export const Route = createFileRoute("/study")({
  head: () => ({
    meta: [
      { title: "Study — Coming Soon | Neet Buddy" },
      { name: "description", content: "The all-new Study hub is coming to Neet Buddy. Stay tuned for something big." },
      { property: "og:title", content: "Study — Coming Soon | Neet Buddy" },
      { property: "og:description", content: "The all-new Study hub is coming to Neet Buddy. Stay tuned for something big." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudyPage,
});

function StudyPage() {
  return (
    <PageShell>
      <div className="relative flex min-h-[70vh] flex-col items-center justify-center overflow-hidden rounded-[2rem] border border-primary/15 bg-gradient-to-br from-card via-background to-card p-6 text-center shadow-glow sm:p-12">
        {/* Soft background orbs */}
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />

        {/* Floating mascot */}
        <div className="relative z-10 mb-6 flex justify-center sm:mb-8">
          <img
            src={studyMascot}
            alt="Dr. Vanshu Study mascot"
            width={320}
            height={320}
            className="h-56 w-56 object-contain drop-shadow-2xl transition-transform duration-500 hover:scale-105 sm:h-72 sm:w-72"
            loading="eager"
          />
        </div>

        {/* Coming-soon badge */}
        <div className="relative z-10 mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-gradient-primary px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary-foreground shadow-elegant">
          <Sparkles className="h-3.5 w-3.5" />
          Coming soon
        </div>

        {/* Main headline */}
        <h1 className="relative z-10 max-w-2xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">
          Something very big is coming
        </h1>

        <p className="relative z-10 mt-4 max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
          Stay tuned — a brand-new Study hub is landing on Neet Buddy to supercharge your prep.
        </p>

        {/* CTA back to dashboard */}
        <div className="relative z-10 mt-8">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant transition-opacity hover:opacity-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* Decorative footer line */}
        <div className="relative z-10 mt-10 flex items-center gap-2 text-xs font-medium text-muted-foreground/80">
          <GraduationCap className="h-4 w-4 text-primary" />
          <span>Neet Buddy Study Zone</span>
        </div>
      </div>
    </PageShell>
  );
}
