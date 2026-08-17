import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare, Send, ExternalLink, MessageCircle, GraduationCap, Info } from "lucide-react";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Our Community — Neet Buddy" }] }),
  component: CommunityPage,
});

function CommunityPage() {
  return (
    <PageShell eyebrow="Community" title="Our Community" description="Join thousands of NEET aspirants. Ask doubts, share notes, and grow together.">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* WhatsApp — primary */}
        <Card className="overflow-hidden border-2 border-emerald-400/40 bg-gradient-to-br from-emerald-100 to-green-100 shadow-elegant dark:border-emerald-500/30 dark:from-emerald-500/15 dark:to-green-500/10 sm:col-span-2">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md">
              <MessageCircle className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">New</div>
              <div className="mt-1 text-lg font-extrabold leading-tight">WhatsApp Channel</div>
              <div className="mt-1 text-sm text-foreground/70">Get daily DPPs, mock alerts and important NEET updates straight on WhatsApp.</div>
              <Button asChild className="mt-3 bg-emerald-600 text-white hover:bg-emerald-700">
                <a href="https://whatsapp.com/channel/0029VbBJW235a246vKXJyo3T" target="_blank" rel="noopener noreferrer">
                  Join channel <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mentorship telegram */}
        <Card className="overflow-hidden border border-sky-300/40 bg-gradient-to-br from-sky-100 to-blue-100 shadow-elegant dark:border-sky-500/20 dark:from-sky-500/15 dark:to-blue-500/10 sm:col-span-2">
          <CardContent className="flex flex-col items-start gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md">
              <GraduationCap className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-bold">NEET Mentorship — Telegram</div>
              <div className="mt-1 text-sm text-foreground/70">Personalized mentorship, strategy, and doubt solving with Mohd Akmal &amp; the Neet Buddy team.</div>
            </div>
            <Button asChild className="bg-gradient-primary">
              <a href="https://t.me/neetmentorship4" target="_blank" rel="noopener noreferrer">Join mentorship <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </Button>
          </CardContent>
        </Card>

        {/* Founder 1 — Sanskar */}
        <Card className="overflow-hidden border border-amber-300/40 bg-gradient-to-br from-amber-100 to-orange-100 shadow-elegant dark:border-amber-500/20 dark:from-amber-500/15 dark:to-orange-500/10">
          <CardContent className="flex flex-col items-start gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-bold">Founder — Sanskar</div>
              <div className="mt-1 text-sm text-foreground/70">Personal updates &amp; study tips from co-founder Sanskar Jaiswal.</div>
            </div>
            <Button asChild variant="outline" className="border-amber-400 text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-500/10">
              <a href="https://t.me/sanskar279" target="_blank" rel="noopener noreferrer">Follow @sanskar279 <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </Button>
          </CardContent>
        </Card>

        {/* Founder 2 — Akmal */}
        <Card className="overflow-hidden border border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-100 to-pink-100 shadow-elegant dark:border-fuchsia-500/20 dark:from-fuchsia-500/15 dark:to-pink-500/10">
          <CardContent className="flex flex-col items-start gap-3 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 to-pink-500 text-white shadow-md">
              <Send className="h-6 w-6" />
            </div>
            <div>
              <div className="text-base font-bold">Founder — Mohd Akmal</div>
              <div className="mt-1 text-sm text-foreground/70">MBBS mentor · 30 → 655 in 9 months. Follow for strategy &amp; motivation.</div>
            </div>
            <Button asChild variant="outline" className="border-fuchsia-400 text-fuchsia-700 hover:bg-fuchsia-50 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/10">
              <a href="https://t.me/akmal_mbbs" target="_blank" rel="noopener noreferrer">Follow @akmal_mbbs <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></a>
            </Button>
          </CardContent>
        </Card>

        {/* About us link */}
        <Card className="sm:col-span-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="flex items-start gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Meet the founders</div>
              <p className="mt-1 text-sm text-muted-foreground">Learn the story behind Neet Buddy and the team building it.</p>
              <Button asChild variant="outline" className="mt-3">
                <Link to="/about">About Neet Buddy →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardContent className="flex items-start gap-3 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Community guidelines</div>
              <p className="mt-1 text-sm text-muted-foreground">Be respectful. No spam, no promotions, no piracy. Keep it about NEET prep. Admins moderate actively.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
