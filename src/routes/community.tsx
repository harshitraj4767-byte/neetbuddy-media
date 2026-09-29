import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Send, MessageCircle, Youtube, Instagram, ExternalLink,
  GraduationCap, Users, ShieldCheck, Sparkles, BookOpen, MessageSquare
} from "lucide-react";

export const Route = createFileRoute("/community")({
  head: () => ({ meta: [{ title: "Our Community — Neet Buddy" }] }),
  component: CommunityPage,
});

interface SocialLinks {
  telegram: string;
  instagram: string;
  youtube: string;
}

const DEFAULT_LINKS: SocialLinks = {
  telegram: "https://t.me/neetbuddy",
  instagram: "https://instagram.com/neetbuddy.in",
  youtube: "https://youtube.com/@neetbuddy",
};

function CommunityPage() {
  const [links, setLinks] = useState<SocialLinks>(DEFAULT_LINKS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/community.php")
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.links) {
          setLinks({
            telegram: data.links.telegram || DEFAULT_LINKS.telegram,
            instagram: data.links.instagram || DEFAULT_LINKS.instagram,
            youtube: data.links.youtube || DEFAULT_LINKS.youtube,
            
          });
        }
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  return (
    <PageShell
      eyebrow="Community"
      title="Our Community"
      description="Join thousands of NEET aspirants. Ask doubts, get daily questions, watch high-yield video solutions, and grow together."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        

        {/* Telegram Community */}
        <Card className="overflow-hidden border border-sky-300/50 bg-gradient-to-br from-sky-50 to-blue-50 shadow-sm dark:border-sky-500/30 dark:from-sky-950/20 dark:to-blue-950/10">
          <CardContent className="flex flex-col justify-between h-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md">
                <Send className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground">Telegram Community</h3>
                  <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] font-bold">
                    Discussion & Notes
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect with peer NEET aspirants, discuss tough MCQs, download curated PDF notes, and participate in daily quizzes.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-sky-400/50 bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 font-semibold gap-2"
              asChild
            >
              <a href={links.telegram} target="_blank" rel="noopener noreferrer">
                <Send className="h-4 w-4" />
                Join Telegram
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* YouTube Channel */}
        <Card className="overflow-hidden border border-red-300/50 bg-gradient-to-br from-red-50 to-rose-50 shadow-sm dark:border-red-500/30 dark:from-red-950/20 dark:to-rose-950/10">
          <CardContent className="flex flex-col justify-between h-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-rose-600 text-white shadow-md">
                <Youtube className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground">YouTube Channel</h3>
                  <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 text-[10px] font-bold">
                    Video Solutions
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Watch detailed question walkthroughs, 1-shot NCERT masterclasses, tricky physics concepts, and mock paper analysis.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-red-400/50 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 font-semibold gap-2"
              asChild
            >
              <a href={links.youtube} target="_blank" rel="noopener noreferrer">
                <Youtube className="h-4 w-4" />
                Subscribe on YouTube
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Instagram Page */}
        <Card className="overflow-hidden border border-pink-300/50 bg-gradient-to-br from-pink-50 to-purple-50 shadow-sm dark:border-pink-500/30 dark:from-pink-950/20 dark:to-purple-950/10">
          <CardContent className="flex flex-col justify-between h-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 text-white shadow-md">
                <Instagram className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground">Instagram</h3>
                  <Badge variant="outline" className="border-pink-500/40 bg-pink-500/10 text-pink-700 dark:text-pink-300 text-[10px] font-bold">
                    Mnemonics & Reels
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Quick memory hacks, biology diagrams, NEET memes, daily motivation, and high-scoring student tips on your feed.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-pink-400/50 bg-pink-500/10 hover:bg-pink-500/20 text-pink-700 dark:text-pink-300 font-semibold gap-2"
              asChild
            >
              <a href={links.instagram} target="_blank" rel="noopener noreferrer">
                <Instagram className="h-4 w-4" />
                Follow on Instagram
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* NEET Mentorship & Strategy */}
        <Card className="overflow-hidden border border-amber-300/50 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm dark:border-amber-500/30 dark:from-amber-950/20 dark:to-orange-950/10">
          <CardContent className="flex flex-col justify-between h-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-foreground">Mentorship & Study Guidance</h3>
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                    Strategy
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Expert guidance on subject sequencing, revision schedules, negative marking reduction, and exam day strategy.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full border-amber-400/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-semibold gap-2"
              asChild
            >
              <a href={links.telegram} target="_blank" rel="noopener noreferrer">
                <Send className="h-4 w-4" />
                Join Mentorship Group
                <ExternalLink className="h-3.5 w-3.5 opacity-70" />
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Guidelines Card */}
        <Card className="sm:col-span-2 border-border/60 bg-card">
          <CardContent className="flex items-start gap-4 p-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold">Community Standards & Guidelines</div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Neet Buddy communities are strictly dedicated to academic excellence. Please maintain respect, avoid promotions or piracy, and stay focused on NEET preparation. Active moderators monitor all channels.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
