import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, Loader2, MessageSquareHeart, CheckCircle2, Lightbulb, Bug, MessagesSquare, Shield } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { submitFeedback } from "@/lib/feedback.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feedback")({
  head: () => ({ meta: [{ title: "Feedback — Neet Buddy" }] }),
  component: FeedbackPage,
});

type Category = "bug" | "idea" | "other";

const CATEGORIES: { value: Category; label: string; icon: typeof Bug; tint: string }[] = [
  { value: "bug", label: "Bug", icon: Bug, tint: "from-rose-500 to-pink-500" },
  { value: "idea", label: "Idea", icon: Lightbulb, tint: "from-amber-500 to-orange-500" },
  { value: "other", label: "Other", icon: MessagesSquare, tint: "from-sky-500 to-blue-600" },
];

function FeedbackPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [category, setCategory] = useState<Category>("other");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const submit = useServerFn(submitFeedback);

  useEffect(() => { if (!loading && !user) nav({ to: "/login" }); }, [user, loading, nav]);

  async function onSend() {
    if (!rating) return toast.error("Please tap a star rating first");
    if (message.trim().length < 3) return toast.error("Tell us a bit more");
    setBusy(true);
    try {
      await submit({ data: { rating, category, message: message.trim() } });
      toast.success("Thanks! Your feedback helps us improve.");
      setDone(true);
      setRating(0); setMessage(""); setCategory("other");
    } catch (e: any) { toast.error(e?.message ?? "Could not send"); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <PageShell>
        <Card className="mx-auto max-w-md border-0 shadow-elegant">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div className="text-xl font-bold">Thank you!</div>
            <p className="text-sm text-muted-foreground">
              We read every single message. You'll hear back if we need more details.
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="outline" onClick={() => setDone(false)}>Send another</Button>
              <Button asChild className="bg-gradient-primary"><Link to="/dashboard">Back to dashboard</Link></Button>
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-md">
        <div className="mb-4 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">We're listening</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Send us feedback</h1>
          <p className="mt-1 text-xs text-muted-foreground">Bug, idea, or just a thought — every message reaches the founders.</p>
        </div>

        <Card className="border-0 shadow-elegant">
          <CardContent className="space-y-5 p-5">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
                <MessageSquareHeart className="h-6 w-6" />
              </div>
              <div className="text-xs text-muted-foreground">Rate your experience</div>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                    className="transition-transform hover:scale-110 active:scale-95">
                    <Star className={cn(
                      "h-9 w-9 transition-colors",
                      (hover || rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30",
                    )} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <div className="text-[11px] font-semibold text-muted-foreground">
                  {["", "Could be better", "Not great", "It's okay", "Pretty good", "Love it!"][rating]}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Category</Label>
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map((c) => {
                  const Icon = c.icon;
                  const active = category === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border p-2.5 text-xs font-semibold transition-all",
                        active
                          ? "border-primary bg-primary/5 text-primary shadow-sm"
                          : "border-border hover:bg-secondary",
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg text-white",
                        active ? `bg-gradient-to-br ${c.tint}` : "bg-muted text-muted-foreground",
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Your message</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="What worked, what didn't, what's missing…"
                maxLength={2000}
                className="resize-none"
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Private — only visible to admins</span>
                <span>{message.length}/2000</span>
              </div>
            </div>

            <Button
              className="h-11 w-full bg-gradient-primary text-base font-semibold"
              onClick={onSend}
              disabled={busy || !rating || message.trim().length < 3}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send feedback"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
