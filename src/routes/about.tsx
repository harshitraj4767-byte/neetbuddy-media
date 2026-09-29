import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Sparkles, Target, Rocket, Heart, Quote, Zap, Coffee, Flame, Trophy, Bot } from "lucide-react";
import { mediaAsset } from "@/lib/media-assets";

const sanskarImage = mediaAsset("src/assets/sanskar.jpg");
// Mohd Akmal photo removed per request
const akmalImage = "";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Neet Buddy" },
      {
        name: "description",
        content:
          "Meet the founders of Neet Buddy — Sanskar Jaiswal and Harshit Kumar — and the mission behind India's smartest NEET preparation platform.",
      },
      { property: "og:title", content: "About Neet Buddy — Our Story & Founders" },
      {
        property: "og:description",
        content:
          "The story of Neet Buddy, an edtech platform built by a young technologist and an MBBS mentor to help every NEET aspirant reach their potential.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <PageShell
      eyebrow="About"
      title="About Neet Buddy"
      description="Built by aspirants, for aspirants — a smarter, more personal way to prepare for NEET."
    >
      {/* Intro / mission */}
      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-amber-500/5">
        <CardContent className="grid gap-6 p-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Our Story
            </div>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight sm:text-3xl">
              A smarter ecosystem for every NEET aspirant.
            </h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">
              Neet Buddy is an edtech platform built to make NEET preparation
              <span className="font-semibold text-foreground"> smarter, more interactive, and accessible</span> for
              every aspirant. It combines the technology skills of a young builder with the medical-school
              experience of a proven mentor — so students get the right tools <em>and</em> the right guidance in
              one place.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <MiniStat icon={<Target className="h-4 w-4" />} label="Chapter-wise quizzes" />
              <MiniStat icon={<Rocket className="h-4 w-4" />} label="AI-powered practice" />
              <MiniStat icon={<Heart className="h-4 w-4" />} label="1:1 mentorship" />
            </div>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Our mission</div>
            <p className="mt-2 text-sm">
              To build India's most trusted, technology-driven ecosystem for NEET preparation — combining smart
              tools, mentorship, and community — so every aspirant can unlock their true potential and reach
              their medical dream.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Founders */}
      <div className="mt-8">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Founders</div>
            <h3 className="mt-1 text-2xl font-extrabold">Meet the team behind Neet Buddy</h3>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <FounderCard
            image={sanskarImage}
            name="Sanskar Jaiswal"
            role="Founder, Neet Buddy"
            badge="Builder · NEET 2027 Aspirant"
            paragraphs={[
              "Sanskar Jaiswal is the Founder of Neet Buddy, an edtech platform built to make NEET preparation smarter, more interactive, and accessible for every aspirant. As a NEET 2027 aspirant, he understands the challenges students face and is committed to solving them through technology.",
              "He is the creator of @NEETIQBOT, a Telegram-based learning platform that provides chapter-wise quizzes, mock tests, AI-powered practice, performance analytics, leaderboards, and personalized learning experiences. With a vision to empower students across India, he continues to develop innovative tools that help aspirants study efficiently and achieve their medical dreams.",
            ]}
            visionLabel="Vision"
            vision="To build India's most trusted technology-driven ecosystem for NEET preparation, helping every student unlock their true potential."
            quote="Great achievements are built through consistency, discipline, and continuous improvement."
            accent="from-amber-500 to-orange-500"
          />

          <FounderCard
            image={akmalImage}
            name="Harshit Kumar"
            role="Founder, Neet Buddy"
            badge="3rd Year MBBS · NEET Mentor"
            paragraphs={[
              "Harshit Kumar is the Founder of Neet Buddy, a 3rd Year MBBS student, and a dedicated NEET mentor with years of experience guiding medical aspirants. His inspiring journey — from scoring 30 marks to 655 marks in just 9 months — reflects the power of determination, smart strategy, and consistent effort.",
              "Through mentorship, personalized guidance, and practical preparation techniques, he has helped countless students improve their performance and stay motivated throughout their NEET journey. At Neet Buddy, his mission is to ensure that every aspirant receives the right direction, confidence, and support needed to succeed.",
            ]}
            visionLabel="Mission"
            vision="To inspire and mentor future doctors by providing practical guidance, motivation, and a clear roadmap to crack NEET."
            quote="The only impossible journey is the one you never begin."
            accent="from-fuchsia-500 to-pink-500"
          />
        </div>
      </div>

      {/* Dr. Catalyst Mascot - The 24/7 Study Wingman */}
      <div className="mt-8">
        <div className="mb-4">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            <Bot className="h-4 w-4" /> Official Mascot & Wingman
          </div>
          <h3 className="mt-1 text-2xl font-extrabold sm:text-3xl">Meet Dr. Catalyst — Your 24/7 NEET Buddy 🕶️🧪</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Not just another mascot. He is your study wingman, late-night hype partner, and the friend who makes cracking NEET feel doable.
          </p>
        </div>

        <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-background to-secondary/30 shadow-lg">
          <CardContent className="p-6 md:p-8">
            <div className="grid items-center gap-8 lg:grid-cols-12">
              {/* Mascot visual spotlight */}
              <div className="flex flex-col items-center justify-center text-center lg:col-span-5">
                <div className="relative">
                  <div className="absolute -inset-2 rounded-full bg-gradient-to-r from-primary/40 to-amber-500/40 blur-xl opacity-75" />
                  <div className="relative flex h-48 w-48 items-center justify-center rounded-3xl border-2 border-primary/30 bg-background/80 p-2 shadow-2xl backdrop-blur-sm sm:h-56 sm:w-56">
                    <img
                      src="/catalyst/dr-catalyst-confident.webp?v=catalyst_v2"
                      alt="Dr. Catalyst standing with sunglasses and swag"
                      className="h-full w-full object-contain drop-shadow-md"
                    />
                  </div>
                  <Badge className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-primary px-3 py-1 text-xs font-bold shadow-md">
                    ⚡ Chief Motivation Officer
                  </Badge>
                </div>

                <div className="mt-5 text-center">
                  <div className="text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    Dr. Catalyst
                  </div>
                  <div className="text-xs font-semibold text-primary">
                    The Ultimate NEET Wingman · Est. 2024
                  </div>
                </div>

                {/* Fun mini mood avatars */}
                <div className="mt-4 flex items-center justify-center gap-2">
                  {[
                    { src: "/catalyst/dr-catalyst-coffee-break.webp?v=catalyst_v2", label: "2 AM Fuel", alt: "Coffee break" },
                    { src: "/catalyst/dr-catalyst-idea.webp?v=catalyst_v2", label: "Cheat Codes", alt: "Idea" },
                    { src: "/catalyst/dr-catalyst-excited.webp?v=catalyst_v2", label: "High Hype", alt: "Excited" },
                    { src: "/catalyst/dr-catalyst-calm.webp?v=catalyst_v2", label: "Zen Mode", alt: "Calm" },
                  ].map((m, i) => (
                    <div
                      key={i}
                      className="group relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-card/90 p-1 transition-all hover:scale-110 hover:border-primary/50 hover:shadow-md"
                      title={m.label}
                    >
                      <img src={m.src} alt={m.alt} className="h-full w-full object-contain" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Story & Swag personality */}
              <div className="space-y-4 lg:col-span-7">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                  <Flame className="h-3.5 w-3.5 text-amber-500" /> Lowering your activation energy, raising your AIR
                </div>

                <h4 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  Why is he called <span className="text-primary underline decoration-primary/40 underline-offset-4">Dr. Catalyst</span>?
                </h4>

                <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                  In chemistry, a catalyst speeds up a sluggish reaction without burning out. That is exactly Dr. Catalyst&apos;s role in your NEET journey: he cuts through study fatigue, makes lengthy NCERT blocks digestible, and gives you that extra push when self-doubt creeps in.
                </p>

                {/* Swag Pillars */}
                <div className="grid gap-3 pt-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Zap className="h-4 w-4 text-amber-500" />
                      <span>Zero-Judgment Buddy</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Got negative marks on a mock? No guilt trips here. Dr. Catalyst analyzes the slip-up, hands you a memory trick, and gets you back in the arena.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Coffee className="h-4 w-4 text-primary" />
                      <span>2 AM Night-Shift Partner</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      When it is 2 AM and Organic Chemistry mechanisms are spinning your head, Doc stays awake with you to keep the vibes high and the panic low.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span>Hype for Every Single Win</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Finished a 25-question sprint? Maintained a 7-day study streak? He flexes with you. Every single small win counts toward the white coat.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 transition-colors hover:border-primary/40">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span>Swag Over Stress</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Preparation is serious business, but your mindset should stay confident. Doc brings the cool factor so prep feels like a mission, not a chore.
                    </p>
                  </div>
                </div>

                {/* Buddy Quote */}
                <blockquote className="mt-3 rounded-xl border-l-4 border-primary bg-primary/10 p-3.5 text-xs italic text-foreground/90 sm:text-sm">
                  &ldquo;Reaction slow ho rahi hai? Activation energy main deta hoon. Bas tu consistent reh, baaki milke crack karenge!&rdquo;
                  <div className="mt-1 font-semibold not-italic text-primary">— Dr. Catalyst 🕶️🩺</div>
                </blockquote>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Together / combined plan */}
      <Card className="mt-8 border-border/60">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
            <GraduationCap className="h-4 w-4" /> Better together
          </div>
          <h3 className="mt-2 text-xl font-extrabold sm:text-2xl">
            Technology + mentorship, in one platform.
          </h3>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Neet Buddy is the combined plan of both founders — one builds the tools, the other mentors the
            students. That means every feature you use is designed by someone who is preparing for NEET himself,
            and every strategy you follow is battle-tested by a mentor who has walked the path from struggling
            aspirant to MBBS student.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Feature title="Smart practice" body="Chapter-wise quizzes, mock tests, PYQs and AI-generated tests to strengthen every concept." />
            <Feature title="Personal mentorship" body="Guidance from a real MBBS mentor with a proven high-score journey — strategy, doubts, and motivation." />
            <Feature title="Real analytics" body="Leaderboards, performance reports and improvement tracking so you always know your next step." />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function MiniStat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium">
      <span className="text-primary">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/40 p-4">
      <div className="text-sm font-bold">{title}</div>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function FounderCard({
  image,
  name,
  role,
  badge,
  paragraphs,
  visionLabel,
  vision,
  quote,
  accent,
}: {
  image: string;
  name: string;
  role: string;
  badge: string;
  paragraphs: string[];
  visionLabel: string;
  vision: string;
  quote: string;
  accent: string;
}) {
  return (
    <Card className="overflow-hidden border-border/60">
      <div className={`h-24 w-full bg-gradient-to-r ${accent}`} />
      <CardContent className="-mt-14 p-6">
        <div className="flex items-end gap-4">
          {image ? (
            <img
              src={image}
              alt={name}
              className="h-28 w-28 rounded-2xl border-4 border-background object-cover shadow-elegant sm:h-32 sm:w-32"
            />
          ) : (
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-2xl border-4 border-background bg-secondary/80 p-2 text-center shadow-elegant sm:h-32 sm:w-32">
              <span className="text-[11px] font-semibold text-muted-foreground">Images added soon...</span>
            </div>
          )}
          <div className="pb-2">
            <div className="text-lg font-extrabold leading-tight sm:text-xl">{name}</div>
            <div className="text-xs font-medium text-muted-foreground">{role}</div>
            <Badge variant="secondary" className="mt-1 text-[10px] font-semibold">
              {badge}
            </Badge>
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/85">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">{visionLabel}</div>
          <p className="mt-1 text-sm">{vision}</p>
        </div>

        <blockquote className="mt-4 flex items-start gap-2 border-l-4 border-primary/60 bg-secondary/30 p-3 text-sm italic text-foreground/85">
          <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>{quote}</span>
        </blockquote>
      </CardContent>
    </Card>
  );
}
