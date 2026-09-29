import { useEffect, useState, useCallback } from "@tanstack/react-router";
import { useEffect as useReactEffect, useState as useReactState, useCallback as useReactCallback } from "react";
import { Bell, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Notif = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return ;
  if (s < 3600) return ;
  if (s < 86400) return ;
  return ;
}

const KIND_COLOR: Record<string, string> = {
  contest: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  contest_result: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  dpp: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  deposit: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  withdraw: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useReactState<Notif[] | null>(null);
  const [busy, setBusy] = useReactState(false);

  const load = useReactCallback(async () => {
    try {
      const res = await fetch("/api/notifications.php", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setItems(data);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to load notifications:", e);
    }
    setItems([
      {
        id: "notif-dpp-100",
        kind: "dpp",
        title: "100 Daily DPPs Live",
        body: "100 fresh Daily Practice Problem sets are ready to practice.",
        link: "/dpp",
        read_at: null,
        created_at: new Date().toISOString(),
      }
    ]);
  }, []);

  useReactEffect(() => {
    if (!user) return;
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user, load]);

  const markOne = async (id: string) => {
    setItems((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)) : []));
    try {
      await fetch("/api/notifications.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "read", id }),
      });
    } catch {}
  };

  const markAll = async () => {
    setBusy(true);
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, read_at: new Date().toISOString() })) : []));
    try {
      await fetch("/api/notifications.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "read_all" }),
      });
    } catch {} finally {
      setBusy(false);
    }
  };

  if (!user) return null;
  const unread = (items ?? []).filter((n) => !n.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="text-sm font-bold">Notifications</div>
          {unread > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={busy}
              onClick={markAll}
            >
              <Check className="h-3 w-3" /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items === null ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const dot = KIND_COLOR[n.kind] ?? "bg-muted text-foreground";
                const body = (
                  <div
                    className={cn(
                      "flex items-start gap-2 px-3 py-2.5 transition hover:bg-secondary/50",
                      !n.read_at && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase",
                        dot,
                      )}
                    >
                      {n.kind.charAt(0)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-semibold">{n.title}</p>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                          {timeAgo(n.created_at)}
                        </span>
                      </div>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                    </div>
                    {!n.read_at && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <a href={n.link} onClick={() => !n.read_at && markOne(n.id)} className="block">
                        {body}
                      </a>
                    ) : (
                      <button onClick={() => !n.read_at && markOne(n.id)} className="w-full text-left">
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
