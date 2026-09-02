import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Brain, ClipboardList, BookOpen, LineChart, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const ITEMS = [
  { to: "/dashboard", label: "Home", icon: Home, match: ["/dashboard"] },
  { to: "/quiz", label: "Quiz", icon: Brain, match: ["/quiz", "/subjects", "/generate", "/battlegrounds", "/contest"] },
  { to: "/test", label: "Test", icon: ClipboardList, match: ["/test", "/mocks", "/pyqs"] },
  { to: "/study", label: "Study", icon: GraduationCap, match: ["/study"] },
  { to: "/study-essentials", label: "Books", icon: BookOpen, match: ["/study-essentials", "/ncert-key-points", "/ncert-highlights", "/highlighted-ncert", "/flashcards", "/neetlab", "/study-view"] },
  { to: "/analyse", label: "Analyse", icon: LineChart, match: ["/analyse", "/ai-path", "/score-predictor", "/progress", "/bookmarks", "/mistakes", "/analytics", "/improvement"] },
] as const;

// Full-screen exam / auth surfaces must stay chrome-free.
const HIDDEN_PREFIXES = ["/login", "/quiz/", "/battle/", "/pyqs/result", "/contest/", "/ncert-practice"];

export function BottomNav() {
  const { user } = useAuth();
  const loc = useRouterState({ select: (s) => s.location });
  const pathname = loc.pathname;
  // Laptops/desktops use the top navbar — the tab bar is mobile/tablet only.
  const [isSmall, setIsSmall] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsSmall(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  // Full-screen readers/players pass ?mode= — their own action bar owns the
  // bottom of the screen, so the tab bar must get out of the way.
  const inPlayer =
    pathname.startsWith("/ncert-key-points") && /(?:^|[?&])mode=/.test(loc.searchStr ?? "");
  const hidden = !isSmall || !user || inPlayer || pathname === "/" || HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (hidden) return;
    const prev = document.body.style.paddingBottom;
    document.body.style.paddingBottom = "4.5rem";
    return () => { document.body.style.paddingBottom = prev; };
  }, [hidden]);

  if (hidden) return null;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {ITEMS.map((item) => {
          const active = item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
          return (
            <li key={item.to} className="flex-1">
              <Link
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className={cn("h-6 w-6", active && "scale-110")} strokeWidth={active ? 2.4 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
