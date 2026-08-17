import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { RefreshCw, BookMarked, LineChart } from "lucide-react";

export const Route = createFileRoute("/improvement")({
  head: () => ({
    meta: [
      { title: "Improvement Zone — Neet Buddy" },
      { name: "description", content: "Revise your mistakes, review saved questions, and analyse your performance." },
    ],
  }),
  component: ImprovementZone,
});

function ImprovementZone() {
  return (
    <PageShell
      eyebrow="Improve"
      title="Improvement Zone"
      description="Mistakes, bookmarks and performance analysis — all your revision tools in one place."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          to="/mistakes"
          title="My Mistakes"
          desc="Every question you got wrong — filter, revise, retry."
          icon={RefreshCw}
          grad="from-red-500 to-rose-600"
        />
        <Tile
          to="/bookmarks"
          title="Bookmarks"
          desc="Questions you saved to revisit later."
          icon={BookMarked}
          grad="from-pink-500 to-rose-600"
        />
        <Tile
          to="/analytics"
          title="Performance Analysis"
          desc="Attempt-wise analysis, accuracy trends & weak areas."
          icon={LineChart}
          grad="from-teal-500 to-emerald-600"
        />
      </div>
    </PageShell>
  );
}

function Tile({
  to, title, desc, icon: Icon, grad,
}: {
  to: string; title: string; desc: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  grad: string;
}) {
  return (
    <Link to={to as never} className="group">
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-all group-hover:-translate-y-0.5 group-hover:shadow-elegant">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-md`}>
          <Icon className="h-6 w-6" strokeWidth={1.6} />
        </div>
        <div>
          <div className="text-base font-bold">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
    </Link>
  );
}
