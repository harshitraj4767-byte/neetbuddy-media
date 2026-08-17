import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Highlighter, ArrowRight, Sparkles, BookOpen } from "lucide-react";
import { listHighlightDecks, getHighlights, type Highlight } from "@/lib/ncert-highlights.functions";
import { accessStudyFeature } from "@/lib/feature-gate.functions";
import { useAuth } from "@/hooks/use-auth";
import { RichText } from "@/components/rich-text";
import { toast } from "sonner";
import { FeatureLock } from "@/components/feature-lock";

export const Route = createFileRoute("/ncert-highlights")({
 head: () => ({ meta: [{ title: "NCERT Key Points — Neet Buddy" }] }),
  component: () => (<FeatureLock feature="ncert_highlights"><NcertPage /></FeatureLock>),
});

type Deck = { subject_id: string | null; subject_name: string; chapter_id: string | null; chapter_name: string; count: number };

function NcertPage() {
  const { user } = useAuth();
  const loadDecks = useServerFn(listHighlightDecks);
  const loadRows = useServerFn(getHighlights);
  const unlock = useServerFn(accessStudyFeature);
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState<Deck | null>(null);
  const [rows, setRows] = useState<Highlight[] | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    loadDecks().then((d) => { setDecks(d.decks as Deck[]); setTotal(d.totalRows); })
      .catch((e) => toast.error(e?.message ?? "Failed to load"));
  }, [loadDecks]);

  async function open(d: Deck) {
    if (!user) { toast.error("Please log in to view highlights."); return; }
    try {
      if (!unlocked) {
        await unlock({ data: { feature: "ncert_highlights" } });
        setUnlocked(true);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unlock highlights");
      return;
    }
    setActive(d); setRows(null);
    try {
      const r = await loadRows({ data: { chapter_id: d.chapter_id, subject_id: d.subject_id } });
      setRows(r.rows);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }


  if (active) {
    return (
      <PageShell>
        <div className="-mt-2 mb-3 flex items-center justify-between">
          <button onClick={() => { setActive(null); setRows(null); }} className="text-sm font-semibold text-primary">← Back</button>
          {rows && <div className="text-xs font-semibold text-muted-foreground">{rows.length} highlights</div>}
        </div>
        <div className="mb-4 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{active.subject_name}</div>
          <h1 className="mt-0.5 text-xl font-bold">{active.chapter_name}</h1>
        </div>

        {rows === null ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <Card className="border-dashed"><CardContent className="p-8 text-center text-sm text-muted-foreground">No highlights yet.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {rows.map((h, i) => (
              <Card key={h.id} className="border-0 bg-gradient-to-br from-amber-50 to-orange-50 shadow-soft dark:from-amber-500/10 dark:to-orange-500/10">
                <CardContent className="flex gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-xs font-bold text-white">{i + 1}</div>
                  <div className="min-w-0 flex-1 text-sm leading-relaxed"><RichText>{h.body}</RichText></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  return (
    <PageShell eyebrow="High-yield" title="NCERT Key Points" description="The most-repeated NCERT lines in NEET — curated chapter-wise.">
      {decks === null ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : decks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-6 w-6 text-primary" />
            No highlights yet. Ask an admin to add them in Admin → NCERT Highlights.
            <div className="mt-3"><Button asChild variant="outline" size="sm"><Link to="/dashboard">Back</Link></Button></div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-4 border-0 bg-gradient-to-br from-amber-500/10 to-orange-500/10">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</div>
                <div className="text-2xl font-extrabold">{total} highlights</div>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
                <Highlighter className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3 sm:grid-cols-2">
            {decks.map((d) => (
              <button key={`${d.subject_id}-${d.chapter_id}`} onClick={() => open(d)} className="text-left">
                <Card className="border-border transition-transform hover:-translate-y-0.5 hover:shadow-elegant">
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{d.subject_name}</div>
                      <div className="truncate text-sm font-bold">{d.chapter_name}</div>
                      <div className="text-xs text-muted-foreground">{d.count} highlights</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
