import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Trophy, Swords, Crown } from "lucide-react";
import { HubHero } from "@/components/nav-tiles";
import { toast } from "sonner";

export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "Arena — Contests, Battlegrounds & Tournaments · Neet Buddy" },
      { name: "description", content: "Compete live: contests, 1v1 battlegrounds, and bracket tournaments — all in one arena." },
    ],
  }),
  component: ArenaPage,
});

function ArenaPage() {
  return (
    <PageShell>
      <HubHero
        eyebrow="Compete"
        title="Enter the"
        highlight="Arena"
        description="Contests, battlegrounds and tournaments — everything competitive, in one place."
        Icon={Swords}
        accent="amber"
        variant="banner"
        image="/illustrations/hub-arena.png"
        imageAlt="Golden trophy on a podium with crossed swords"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/contests" className="group">
          <Tile
            title="Daily Live Quiz"
            desc="Daily 6 PM live quiz with leaderboards and XP rewards."
            icon={Trophy}
            image="/illustrations/i3d-contests.png"
            grad="from-amber-500 to-orange-600"
            badge="LIVE"
          />
        </Link>
        <Link to="/battlegrounds" className="group">
          <Tile
            title="Battlegrounds"
            desc="Quick 1v1 quiz duels — subject-wise, real opponents."
            icon={Swords}
            image="/illustrations/i3d-battlegrounds.png"
            grad="from-rose-500 to-red-600"
            badge="LIVE"
          />
        </Link>
        <button
          type="button"
          onClick={() => toast.info("Tournaments — Coming Soon", { description: "Bracket-style elimination coming shortly." })}
          className="text-left"
        >
          <Tile
            title="Tournaments"
            desc="Bracket-style elimination rounds with big prize pools."
            icon={Crown}
            image="/illustrations/i3d-arena.png"
            grad="from-fuchsia-500 to-purple-600"
            badge="SOON"
          />
        </button>
      </div>
    </PageShell>
  );
}

function Tile({
  title, desc, icon: Icon, grad, badge, image,
}: {
  title: string; desc: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  grad: string; badge: "LIVE" | "SOON"; image?: string;
}) {
  const isLive = badge === "LIVE";
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-soft transition-all group-hover:-translate-y-0.5 group-hover:shadow-elegant hover:-translate-y-0.5 hover:shadow-elegant">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        {image ? (
          <img
            src={image}
            alt=""
            loading="lazy"
            className="pointer-events-none h-24 w-24 shrink-0 select-none object-contain drop-shadow-[0_10px_22px_rgba(0,0,0,0.22)] sm:h-28 sm:w-28 lg:h-32 lg:w-32"
          />
        ) : (
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${grad} text-white shadow-md`}>
            <Icon className="h-6 w-6" strokeWidth={1.6} />
          </div>
        )}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          isLive ? "bg-red-500/15 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground"
        }`}>
          {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
          {badge}
        </span>
      </div>
      <div>
        <div className="text-base font-bold sm:text-lg">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
