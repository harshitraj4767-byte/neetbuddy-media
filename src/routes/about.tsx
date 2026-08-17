import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Sparkles, Target, Rocket, Heart, Quote } from "lucide-react";
import sanskarImage from "@/assets/sanskar.jpg";
import akmalImage from "@/assets/akmal.jpg";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Us — Neet Buddy" },
      {
        name: "description",
        content:
          "Meet the founders of Neet Buddy — Sanskar Jaiswal and Mohd Akmal — and the mission behind India's smartest NEET preparation platform.",
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
            name="Mohd Akmal"
            role="Founder, Neet Buddy"
            badge="3rd Year MBBS · NEET Mentor"
            paragraphs={[
              "Mohd Akmal is the Founder of Neet Buddy, a 3rd Year MBBS student, and a dedicated NEET mentor with years of experience guiding medical aspirants. His inspiring journey — from scoring 30 marks to 655 marks in just 9 months — reflects the power of determination, smart strategy, and consistent effort.",
              "Through mentorship, personalized guidance, and practical preparation techniques, he has helped countless students improve their performance and stay motivated throughout their NEET journey. At Neet Buddy, his mission is to ensure that every aspirant receives the right direction, confidence, and support needed to succeed.",
            ]}
            visionLabel="Mission"
            vision="To inspire and mentor future doctors by providing practical guidance, motivation, and a clear roadmap to crack NEET."
            quote="The only impossible journey is the one you never begin."
            accent="from-fuchsia-500 to-pink-500"
          />
        </div>
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
          <img
            src={image}
            alt={name}
            className="h-28 w-28 rounded-2xl border-4 border-background object-cover shadow-elegant sm:h-32 sm:w-32"
          />
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
