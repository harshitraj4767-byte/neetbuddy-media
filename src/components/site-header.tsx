import { publicMediaAsset } from "@/lib/media-assets";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, LogOut, Sun, Moon, ChevronDown, User, Crown, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { NotificationBell } from "@/components/notification-bell";
import { avatarUrl } from "@/lib/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      aria-label="Toggle dark mode"
      onClick={toggle}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

type Item = { to: string; label: string };
type Group = { label: string; to?: string; items?: Item[] };

const GROUPS: Group[] = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Checklist", to: "/daily-checklist" },
  {
    label: "Practice",
    items: [
      { to: "/daily", label: "Daily DPP" },
      { to: "/dpp", label: "Sub-wise Quiz" },
      { to: "/mocks", label: "Mock Tests" },
      { to: "/pyqs", label: "NEET PYQs" },
      { to: "/generate", label: "Generate Test" },
    ],
  },
  {
    label: "Study",
    items: [
      { to: "/study-essentials", label: "Study Essentials" },
      { to: "/pyqs", label: "NEET PYQs" },
      { to: "/flashcards", label: "Flashcards" },
      { to: "/ncert-key-points", label: "NCERT Nuggets" },
      { to: "/highlighted-ncert", label: "Highlighted NCERT" },
      { to: "/neetlab", label: "NEETLab" },
      { to: "/bookmarks", label: "Bookmarks" },
    ],
  },
  {
    label: "AI Tools",
    items: [
      { to: "/ai-path", label: "AI Study Path" },
      { to: "/score-predictor", label: "Score Predictor" },
      { to: "/progress", label: "Progress Report" },
      { to: "/analytics", label: "Analytics" },
    ],
  },
  {
    label: "Compete",
    items: [
      { to: "/contests", label: "Contests" },
      { to: "/battlegrounds", label: "Battlegrounds" },
      { to: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    label: "Plans",
    items: [
      { to: "/premium", label: "Batches" },
      { to: "/subscription", label: "Subscription" },
      { to: "/referrals", label: "Refer a Friend" },
    ],
  },
  {
    label: "More",
    items: [
      { to: "/about", label: "About us" },
      { to: "/community", label: "Community" },
      { to: "/feedback", label: "Feedback" },
      { to: "/dedicated-program", label: "Collaborator Program" },
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/terms", label: "Terms of Service" },
      { to: "/refund", label: "Refund Policy" },
      { to: "/delete-account", label: "Delete Account" },
    ],
  },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, profile, isAdmin, signOut } = useAuth();
  const navGroups: Group[] = GROUPS;
  const displayName = (profile?.full_name?.trim() || (user?.email ? user.email.split("@")[0] : "")) ?? "";
  const avatar = user ? avatarUrl(displayName || user.id, profile?.avatar_url ?? null) : null;

  return (
    <header className="sticky top-0 z-50 w-full px-2 pt-2 sm:px-4 sm:pt-3 lg:px-8">
      <div className="site-header-frame mx-auto flex h-14 max-w-[1700px] w-full items-center justify-between rounded-2xl px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <Link to="/dashboard" className="flex shrink-0 items-center gap-2">
          <img src={publicMediaAsset("icons/icon-192.png")} alt="Neet Buddy" className="h-9 w-9 shrink-0 rounded-xl shadow-glow" />
          <div className="leading-none">
            <div className="whitespace-nowrap text-base font-bold tracking-tight">Neet <span className="text-gradient-primary">Buddy</span></div>
            <div className="hidden whitespace-nowrap text-[10px] uppercase tracking-[0.18em] text-muted-foreground xl:block">Crack NEET, Smarter</div>
          </div>
        </Link>


        <nav className="mx-2 hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex">
          {navGroups.map((g) => {
            if (g.to) {
              const active = path.startsWith(g.to);
              return (
                <Link
                  key={g.label}
                  to={g.to}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {g.label}
                </Link>
              );
            }
            const groupActive = (g.items ?? []).some((i) => path === i.to || path.startsWith(i.to + "/"));
            return (
              <DropdownMenu key={g.label}>
                <DropdownMenuTrigger className={cn(
                  "inline-flex items-center gap-0.5 rounded-full px-3 py-2 text-sm font-medium transition-colors focus:outline-none",
                  groupActive
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}>
                  {g.label} <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">{g.label}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {g.items!.map((i) => {
                    const active = path === i.to || path.startsWith(i.to + "/");
                    return (
                      <DropdownMenuItem key={i.label} asChild>
                        <Link to={i.to} className={cn(active && "bg-secondary font-semibold text-foreground")}>{i.label}</Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>


        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <ThemeToggle />
          {user && <NotificationBell />}
          <div className="hidden items-center gap-2 lg:flex">
            {user ? (
              <>
                <Button
                  asChild
                  size="sm"
                  className="relative gap-1 overflow-hidden bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 font-semibold text-white shadow-elegant ring-1 ring-amber-300/40 transition hover:shadow-lg hover:brightness-110"
                >
                  <Link to="/premium">
                    <Crown className="h-4 w-4" />
                    <span className="hidden xl:inline">Premium</span>
                    <Sparkles className="h-3.5 w-3.5 opacity-80" />
                  </Link>
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-border bg-secondary/60 py-1 pl-1 pr-2 transition-colors hover:bg-secondary focus:outline-none">
                    {avatar ? (
                      <img src={avatar} alt={displayName || "Profile"} className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <User className="h-5 w-5" />
                    )}
                    <span className="hidden max-w-[7rem] truncate text-sm font-semibold xl:inline">{displayName || "Profile"}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuLabel className="truncate">{displayName || "Account"}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild><Link to="/profile">My profile</Link></DropdownMenuItem>
                    <DropdownMenuItem asChild><Link to="/subscription">Subscription</Link></DropdownMenuItem>
                    {isAdmin && <DropdownMenuItem asChild><Link to="/admin">Admin</Link></DropdownMenuItem>}
                    {isAdmin && <DropdownMenuItem asChild><Link to="/admin-inbox">Inbox</Link></DropdownMenuItem>}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => signOut()} className="text-destructive focus:text-destructive">
                      <LogOut className="mr-2 h-4 w-4" /> Log out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link to="/login">Log in</Link></Button>
                <Button asChild size="sm" className="bg-gradient-primary shadow-elegant hover:opacity-95"><Link to="/login">Get started</Link></Button>
              </>
            )}
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open menu"
                className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border transition-colors hover:bg-secondary"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-sm overflow-y-auto p-0">
              <SheetHeader className="border-b border-border/60 bg-gradient-to-br from-primary/5 to-amber-500/5 px-5 py-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <img src={publicMediaAsset("icons/icon-192.png")} alt="" className="h-8 w-8 rounded-lg" />
                  Neet <span className="text-gradient-primary">Buddy</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-3 p-4">
                {user && (
                  <Link
                    to="/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary"
                  >
                    {avatar ? (
                      <img src={avatar} alt={displayName || "Profile"} className="h-10 w-10 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary"><User className="h-5 w-5" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{displayName || "Your profile"}</div>
                      <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    </div>
                  </Link>
                )}
                {user && (
                  <Button asChild className="w-full gap-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 font-semibold text-white shadow-elegant ring-1 ring-amber-300/40 hover:brightness-110">
                    <Link to="/premium" onClick={() => setOpen(false)}>
                      <Crown className="h-4 w-4" /> Go Premium
                      <Sparkles className="ml-1 h-3.5 w-3.5 opacity-80" />
                    </Link>
                  </Button>
                )}
                {navGroups.map((g) => {
                  if (g.to) {
                    const active = path === g.to || path.startsWith(g.to + "/");
                    return (
                      <Link
                        key={g.label}
                        to={g.to}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                          active ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "hover:bg-secondary",
                        )}
                      >
                        {g.label}
                      </Link>
                    );
                  }
                  const groupActive = (g.items ?? []).some((i) => path === i.to || path.startsWith(i.to + "/"));
                  return (
                    <div key={g.label} className={cn("rounded-lg border p-2 transition-colors", groupActive ? "border-primary/40 bg-primary/5" : "border-border bg-card/50")}>
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{g.label}</div>
                      <div className="mt-1 grid gap-0.5">
                        {g.items!.map((i) => {
                          const active = path === i.to || path.startsWith(i.to + "/");
                          return (
                            <Link
                              key={i.label}
                              to={i.to}
                              onClick={() => setOpen(false)}
                              className={cn(
                                "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                                active ? "bg-primary/15 font-semibold text-primary" : "hover:bg-secondary",
                              )}
                            >
                              {i.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <div className="mt-2 flex flex-wrap gap-2">
                  {user ? (
                    <>
                      {isAdmin && (
                        <Button asChild variant="outline" className="flex-1 min-w-[45%]">
                          <Link to="/admin" onClick={() => setOpen(false)}>Admin</Link>
                        </Button>
                      )}
                      {isAdmin && (
                        <Button asChild variant="outline" className="flex-1 min-w-[45%]">
                          <Link to="/admin-inbox" onClick={() => setOpen(false)}>Inbox</Link>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="flex-1 gap-1"
                        onClick={() => { setOpen(false); signOut(); }}
                      >
                        <LogOut className="h-4 w-4" /> Log out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button asChild variant="outline" className="flex-1">
                        <Link to="/login" onClick={() => setOpen(false)}>Log in</Link>
                      </Button>
                      <Button asChild className="flex-1 bg-gradient-primary">
                        <Link to="/login" onClick={() => setOpen(false)}>Get started</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
