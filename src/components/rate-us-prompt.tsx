import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, HeartHandshake, PartyPopper, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { submitFeedback } from "@/lib/feedback.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function stateKey(userId: string) {
  return `neetiq_rateus_v1_${userId}`;
}

type RateState = { done?: boolean; snooze_until?: number; prompted_login?: string };

function readState(userId: string): RateState {
  try {
    return JSON.parse(localStorage.getItem(stateKey(userId)) ?? "{}");
  } catch {
    return {};
  }
}

function writeState(userId: string, s: RateState) {
  try {
    localStorage.setItem(stateKey(userId), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const RATING_LABEL = ["", "Not great", "Could be better", "It's okay", "Pretty good", "Love it!"];

export function RateUsPrompt() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const submitted = useRef(false);
  const submit = useServerFn(submitFeedback);

  const evaluate = useCallback(() => {
    if (typeof window === "undefined") return false;
    if (!user) return false;
    if (path.startsWith("/login") || path.startsWith("/admin") || path.startsWith("/auth")) return false;
    if (submitted.current) return false;
    const st = readState(user.id);
    if (st.done) return false;
    // Only prompt once per login session (per last_sign_in_at).
    if (st.prompted_login === user.last_sign_in_at) return false;
    if (st.snooze_until && Date.now() < st.snooze_until) return false;
    const loginAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0;
    if (!loginAt || Date.now() < loginAt + FIVE_HOURS_MS) return false;
    return true;
  }, [user, path]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setOpen(false);
      return;
    }
    const tick = () => {
      if (evaluate()) {
        setOpen(true);
        const st = readState(user.id);
        writeState(user.id, { ...st, prompted_login: user.last_sign_in_at ?? undefined });
      }
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [loading, user, evaluate]);

  function dismiss() {
    setOpen(false);
    if (user) {
      const st = readState(user.id);
      writeState(user.id, { ...st, snooze_until: Date.now() + SNOOZE_MS });
    }
  }

  async function send() {
    if (!user || !rating) return;
    setBusy(true);
    try {
      await submit({
        data: {
          rating,
          category: "other",
          message: message.trim().length >= 3
            ? message.trim()
            : `In-app prompt rating: ${rating}/5`,
        },
      });
      submitted.current = true;
      const st = readState(user.id);
      writeState(user.id, { ...st, done: true });
      setOpen(false);
      toast.success("Thank you! Your feedback means a lot 💚");
    } catch (e: any) {
      // Still record as handled so we don't nag on a broken backend.
      const st = readState(user.id);
      writeState(user.id, { ...st, snooze_until: Date.now() + SNOOZE_MS });
      setOpen(false);
      toast.error(e?.message ?? "Could not send feedback");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-sm overflow-hidden rounded-3xl border-border/60 p-0 gap-0">
        <DialogTitle className="sr-only">Rate Neet Buddy</DialogTitle>
        {/* Header */}
        <div className="relative bg-gradient-primary px-6 pb-10 pt-7 text-center text-primary-foreground">
          <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/10 blur-xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-white/10 blur-xl" />
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
            <HeartHandshake className="h-7 w-7" />
          </div>
          <div className="mt-3 text-lg font-extrabold tracking-tight">5 hours of hard work!</div>
          <p className="mt-1 text-xs text-primary-foreground/80">
            You've been grinding on Neet Buddy — how are we doing so far?
          </p>
        </div>

        {/* Body */}
        <div className="-mt-5 rounded-t-3xl bg-card px-6 pb-6 pt-5">
          <div className="flex justify-center gap-2" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                className="transition-transform hover:scale-125 active:scale-90"
              >
                <Star
                  className={cn(
                    "h-8 w-8 drop-shadow-sm transition-colors",
                    (hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
                  )}
                />
              </button>
            ))}
          </div>
          {rating > 0 && (
            <div className="mt-2 text-center text-[11px] font-semibold text-muted-foreground">
              {RATING_LABEL[rating]}
            </div>
          )}

          {rating >= 4 ? (
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
              <PartyPopper className="h-3.5 w-3.5" /> Awesome — tell us what you love!
            </div>
          ) : null}

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder={rating >= 4 ? "What's helping you the most? (optional)" : "What should we fix first? (optional)"}
            className="mt-3 resize-none text-sm"
          />

          <Button
            onClick={send}
            disabled={busy || !rating}
            className="mt-3 h-11 w-full bg-gradient-primary text-sm font-semibold"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send feedback"}
          </Button>
          <button
            type="button"
            onClick={dismiss}
            className="mt-2 w-full text-center text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
