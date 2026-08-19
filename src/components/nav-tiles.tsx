import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileAccent =
  | "blue"
  | "emerald"
  | "orange"
  | "violet"
  | "pink"
  | "cyan"
  | "amber"
  | "rose";

export type NavTile = {
  to?: string;
  params?: Record<string, string>;
  label: string;
  desc: string;
  tag?: string;
  accent?: TileAccent;
  Icon: LucideIcon;
  onClick?: () => void;
};

const ACCENT: Record<TileAccent, { icon: string; tag: string; glow: string }> = {
  blue: { icon: "from-blue-500 to-indigo-500", tag: "bg-blue-500/15 text-blue-700 dark:text-blue-300", glow: "hover:border-blue-500/40" },
  emerald: { icon: "from-emerald-500 to-teal-500", tag: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", glow: "hover:border-emerald-500/40" },
  orange: { icon: "from-orange-500 to-amber-500", tag: "bg-orange-500/15 text-orange-700 dark:text-orange-300", glow: "hover:border-orange-500/40" },
  violet: { icon: "from-violet-500 to-purple-500", tag: "bg-violet-500/15 text-violet-700 dark:text-violet-300", glow: "hover:border-violet-500/40" },
  pink: { icon: "from-pink-500 to-rose-500", tag: "bg-pink-500/15 text-pink-700 dark:text-pink-300", glow: "hover:border-pink-500/40" },
  cyan: { icon: "from-cyan-500 to-sky-500", tag: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300", glow: "hover:border-cyan-500/40" },
  amber: { icon: "from-amber-500 to-yellow-500", tag: "bg-amber-500/15 text-amber-700 dark:text-amber-300", glow: "hover:border-amber-500/40" },
  rose: { icon: "from-rose-500 to-red-500", tag: "bg-rose-500/15 text-rose-700 dark:text-rose-300", glow: "hover:border-rose-500/40" },
};

const ORDER: TileAccent[] = ["blue", "emerald", "orange", "violet", "pink", "cyan", "amber", "rose"];

function TileBody({ tile, accent }: { tile: NavTile; accent: TileAccent }) {
  const a = ACCENT[accent];
  return (
    <div
      className={cn(
        "group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-4 text-left",
        "shadow-soft backdrop-blur-xl transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]",
        a.glow,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-30",
          a.icon,
        )}
      />
      <div
        className={cn(
          "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md",
          a.icon,
        )}
      >
        <tile.Icon className="h-6 w-6" strokeWidth={2.2} />
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.95rem] font-bold leading-tight">{tile.label}</span>
          {tile.tag && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", a.tag)}>{tile.tag}</span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tile.desc}</p>
      </div>
      <ChevronRight className="relative h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground" />
    </div>
  );
}

/** Shared tile list used by the Quiz / Test / Books / Analyse hub pages. */
export function NavTiles({ tiles }: { tiles: NavTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiles.map((t, i) => {
        const accent = t.accent ?? ORDER[i % ORDER.length];
        const body = <TileBody tile={t} accent={accent} />;
        if (!t.to) {
          return (
            <button key={t.label} type="button" onClick={t.onClick} className="block w-full text-left">
              {body}
            </button>
          );
        }
        return (
          <Link key={t.label} to={t.to as never} params={t.params as never} className="block">
            {body}
          </Link>
        );
      })}
    </div>
  );
}

/** Gradient hero used at the top of each hub page. */
export function HubHero({
  eyebrow,
  title,
  highlight,
  description,
  Icon,
  accent = "blue",
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description: string;
  Icon: LucideIcon;
  accent?: TileAccent;
}) {
  const a = ACCENT[accent];
  return (
    <div className="relative mb-6 overflow-hidden rounded-3xl border border-border/70 bg-card/60 p-6 shadow-soft backdrop-blur-xl">
      <span
        aria-hidden
        className={cn("pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gradient-to-br opacity-25 blur-3xl", a.icon)}
      />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">{eyebrow}</div>
          <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl">
            {title}
            {highlight && (
              <>
                <br />
                <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", a.icon)}>{highlight}</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div
          className={cn(
            "hidden h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-glow sm:flex",
            a.icon,
          )}
        >
          <Icon className="h-10 w-10" strokeWidth={1.8} />
        </div>
      </div>
    </div>
  );
}
