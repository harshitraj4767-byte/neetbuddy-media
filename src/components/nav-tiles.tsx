import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

export type NavTile = {
  to: string;
  params?: Record<string, string>;
  label: string;
  desc: string;
  Icon: LucideIcon;
};

/** Shared tile grid used by the Quiz / Test / Analyse hub pages. */
export function NavTiles({ tiles }: { tiles: NavTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiles.map((t) => (
        <Link
          key={t.label}
          to={t.to as never}
          params={t.params as never}
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-white shadow-sm">
            <t.Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-tight">{t.label}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
