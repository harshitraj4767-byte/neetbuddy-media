import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
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
  /** Optional 3D illustration shown instead of the lucide icon badge. */
  image?: string;
  imageAlt?: string;
  onClick?: () => void;
};

const ACCENT: Record<TileAccent, { icon: string; tag: string; glow: string; wash: string }> = {
  blue: { icon: "from-blue-500 to-indigo-500", tag: "bg-blue-500/15 text-blue-700 dark:text-blue-300", glow: "hover:border-blue-500/40", wash: "from-blue-100 via-sky-50 to-indigo-100 dark:from-blue-950/60 dark:via-sky-950/40 dark:to-indigo-950/60" },
  emerald: { icon: "from-emerald-500 to-teal-500", tag: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", glow: "hover:border-emerald-500/40", wash: "from-emerald-100 via-teal-50 to-green-100 dark:from-emerald-950/60 dark:via-teal-950/40 dark:to-green-950/60" },
  orange: { icon: "from-orange-500 to-amber-500", tag: "bg-orange-500/15 text-orange-700 dark:text-orange-300", glow: "hover:border-orange-500/40", wash: "from-orange-100 via-amber-50 to-yellow-100 dark:from-orange-950/60 dark:via-amber-950/40 dark:to-yellow-950/60" },
  violet: { icon: "from-violet-500 to-purple-500", tag: "bg-violet-500/15 text-violet-700 dark:text-violet-300", glow: "hover:border-violet-500/40", wash: "from-violet-100 via-purple-50 to-indigo-100 dark:from-violet-950/60 dark:via-purple-950/40 dark:to-indigo-950/60" },
  pink: { icon: "from-pink-500 to-rose-500", tag: "bg-pink-500/15 text-pink-700 dark:text-pink-300", glow: "hover:border-pink-500/40", wash: "from-pink-100 via-rose-50 to-fuchsia-100 dark:from-pink-950/60 dark:via-rose-950/40 dark:to-fuchsia-950/60" },
  cyan: { icon: "from-cyan-500 to-sky-500", tag: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300", glow: "hover:border-cyan-500/40", wash: "from-cyan-100 via-sky-50 to-blue-100 dark:from-cyan-950/60 dark:via-sky-950/40 dark:to-blue-950/60" },
  amber: { icon: "from-amber-500 to-yellow-500", tag: "bg-amber-500/15 text-amber-700 dark:text-amber-300", glow: "hover:border-amber-500/40", wash: "from-amber-100 via-yellow-50 to-orange-100 dark:from-amber-950/60 dark:via-yellow-950/40 dark:to-orange-950/60" },
  rose: { icon: "from-rose-500 to-red-500", tag: "bg-rose-500/15 text-rose-700 dark:text-rose-300", glow: "hover:border-rose-500/40", wash: "from-rose-100 via-red-50 to-orange-100 dark:from-rose-950/60 dark:via-red-950/40 dark:to-orange-950/60" },
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
      {tile.image ? (
        <div
          className={cn(
            "relative flex h-[6.75rem] w-[6.75rem] shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/40 bg-gradient-to-br shadow-md dark:border-white/10 sm:h-32 sm:w-32",
            a.wash,
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:10px_10px] text-foreground/40"
          />
          <span
            aria-hidden
            className={cn("pointer-events-none absolute -bottom-6 -right-6 h-16 w-16 rounded-full bg-gradient-to-br opacity-30 blur-2xl", a.icon)}
          />
          <img
            src={tile.image}
            alt={tile.imageAlt ?? ""}
            loading="lazy"
            width={816}
            height={816}
            className="relative h-[94%] w-[94%] select-none object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.22)] transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div
          className={cn(
            "relative flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md sm:h-24 sm:w-24",
            a.icon,
          )}
        >
          <tile.Icon className="h-12 w-12 sm:h-14 sm:w-14" strokeWidth={2.1} />
        </div>
      )}
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[1.05rem] font-bold leading-tight">{tile.label}</span>
          {tile.tag && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", a.tag)}>{tile.tag}</span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tile.desc}</p>
      </div>
      <ChevronRight className="relative h-6 w-6 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-1 group-hover:text-foreground" />
    </div>
  );
}

/** Shared tile list used by the Quiz / Test / Books / Analyse hub pages. */
export function NavTiles({ tiles }: { tiles: NavTile[] }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", tiles.length % 3 === 0 && "lg:grid-cols-3")}>
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
  image,
  imageAlt,
  variant = "default",
  hideEyebrow = false,
  compact = false,
  children,
}: {
  eyebrow: string;
  title: string;
  highlight?: string;
  description: string;
  Icon: LucideIcon;
  accent?: TileAccent;
  /** Optional 3D illustration shown on the right instead of the icon badge. */
  image?: string;
  imageAlt?: string;
  /** "banner" renders the soft tinted illustration banner used on the hub pages. */
  variant?: "default" | "banner";
  hideEyebrow?: boolean;
  /** Compact mode: smaller padding, title and image for dense screens. */
  compact?: boolean;
  /** Optional chips / stats rendered under the description. */
  children?: ReactNode;
}) {
  const a = ACCENT[accent];
  const banner = variant === "banner";
  return (
    <div
      className={cn(
        "relative isolate mb-6 overflow-hidden rounded-3xl border shadow-soft",
        banner
          ? cn("border-transparent bg-gradient-to-br p-4 sm:p-7", compact && "p-3 sm:p-5", a.wash)
          : cn("border-border/70 bg-card/60 p-4 backdrop-blur-xl sm:p-6", compact && "p-3 sm:p-5"),
      )}
    >
      {/* dotted texture */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] dark:opacity-[0.12] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:14px_14px] text-foreground/40 [mask-image:linear-gradient(to_bottom_right,black,transparent_70%)]"
      />
      {!banner && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-[0.07]", a.icon)}
        />
      )}
      {banner && (
        <svg
          aria-hidden
          viewBox="0 0 400 160"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 w-full text-white/50 dark:text-white/5"
        >
          <path d="M0 120 C 90 70 150 150 240 105 S 340 60 400 92 L400 160 L0 160 Z" fill="currentColor" opacity="0.75" />
          <path d="M0 96 C 80 130 160 60 250 96 S 350 130 400 106 L400 160 L0 160 Z" fill="currentColor" opacity="0.45" />
        </svg>
      )}
      {/* ambient glows */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -right-16 -top-20 h-56 w-56 animate-pulse rounded-full bg-gradient-to-br opacity-30 blur-3xl [animation-duration:7s] sm:h-72 sm:w-72",
          a.icon,
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute -bottom-24 -left-16 h-48 w-48 animate-pulse rounded-full bg-gradient-to-br opacity-20 blur-3xl [animation-duration:9s] sm:h-64 sm:w-64",
          a.icon,
        )}
      />
      {/* diagonal sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent opacity-40 dark:via-white/[0.06]"
      />
      <div className={cn("relative flex items-center gap-3 sm:gap-5", compact && "gap-2 sm:gap-4")}>
        <div className="min-w-0 flex-1">
          {!hideEyebrow && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-current/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm",
                compact && "px-2 py-0.5 text-[9px]",
                a.tag,
              )}
            >
              <Icon className={cn("h-4 w-4", compact && "h-3 w-3")} strokeWidth={2.2} />
              {eyebrow}
            </span>
          )}
          <h1 className={cn(
            "mt-3 text-[clamp(1.35rem,6.2vw,1.75rem)] font-extrabold leading-[1.12] tracking-tight sm:text-4xl",
            compact && "mt-2 text-[clamp(1.1rem,5.2vw,1.5rem)] sm:text-3xl",
          )}>
            {title}
            {highlight && (
              <>
                <br />
                <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", a.icon)}>{highlight}</span>
              </>
            )}
          </h1>
          <span aria-hidden className={cn("mt-3 block h-1 w-8 rounded-full bg-gradient-to-r", a.icon)} />
          <p className={cn(
            "mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground sm:text-sm",
            compact && "mt-1.5 max-w-md text-[11px] sm:text-xs",
          )}>{description}</p>
          {children && <div className={cn("mt-4 flex flex-wrap items-center gap-2", compact && "mt-2 gap-1.5")}>{children}</div>}
        </div>
        {image ? (
          <div className={cn("relative flex shrink-0 items-center justify-center self-center", compact && "self-end")}>
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-[-18%] rounded-full bg-gradient-to-br opacity-30 blur-2xl",
                compact && "inset-[-10%] opacity-25",
                a.icon,
              )}
            />
            <img
              src={image}
              alt={imageAlt ?? ""}
              loading="lazy"
              className={cn(
                "pointer-events-none relative select-none object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.28)]",
                banner
                  ? "h-[150px] w-[46vw] max-w-[260px] sm:h-auto sm:w-[42%] sm:max-w-[360px]"
                  : "h-[140px] w-[43vw] max-w-[240px] sm:h-auto sm:w-[40%] sm:max-w-[330px]",
                compact && banner && "h-[96px] w-[34vw] max-w-[168px] sm:max-w-[210px]",
              )}
            />
          </div>
        ) : (
          <div
            className={cn(
              "hidden h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-br text-white shadow-glow sm:flex",
              compact && "h-16 w-16",
              a.icon,
            )}
          >
            <Icon className={cn("h-12 w-12", compact && "h-8 w-8")} strokeWidth={1.8} />
          </div>
        )}
      </div>
    </div>
  );
}

