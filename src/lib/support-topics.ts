import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, Award, Bot, BookOpen, Brain, CalendarCheck, CreditCard,
  FlaskConical, Gift, GraduationCap, Layers, LifeBuoy, ListChecks, Lock, Medal,
  Settings, ShieldCheck, Smartphone, Sparkles, Swords, Trophy, Users, Wallet,
} from "lucide-react";

export type HelpNode = {
  id: string;
  title: string;
  desc?: string;
  /** Leaf answer shown to the user (markdown-ish plain text). */
  answer?: string;
  children?: HelpNode[];
};

export type HelpTopic = HelpNode & { icon: LucideIcon };

/* ------------------------------------------------------------------ */
/* Reusable leaf builders so every topic covers the same issue classes */
/* ------------------------------------------------------------------ */

const bugLeaf = (what: string, extra?: string): HelpNode => ({
  id: "bug",
  title: "Report a bug",
  desc: `Something in ${what} is broken`,
  answer:
    `Sorry about that. Before reporting, try these in order:\n\n` +
    `1. Pull down to refresh / reload the page.\n` +
    `2. Fully close the app and reopen it (this clears a stale session).\n` +
    `3. Check you are on the latest version — Profile → About shows your build number.\n` +
    `4. Switch between Wi-Fi and mobile data once.\n\n` +
    (extra ? extra + "\n\n" : "") +
    `Still broken? Send us: what you tapped, the screen name, the exact time, and a screenshot. ` +
    `That lets us reproduce it on the first try.`,
});

const errorLeaf = (what: string, lines: string): HelpNode => ({
  id: "error",
  title: "I'm getting an error",
  desc: `Error messages in ${what}`,
  answer: lines,
});

/* ------------------------------------------------------------------ */
/* The help tree                                                       */
/* ------------------------------------------------------------------ */

export const HELP_TOPICS: HelpTopic[] = [
  /* ---------------------------------------------------------------- */
  {
    id: "dpp",
    title: "Daily DPP & Daily Quiz",
    icon: CalendarCheck,
    desc: "Daily practice problems, streaks, past DPPs",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "start",
            title: "How do I attempt today's DPP?",
            answer:
              "Open **Daily** from the bottom bar (or Dashboard → Daily DPP). Today's set is at the top and unlocks at 12:00 AM IST.\n\n" +
              "Tap **Start**, answer every question, then tap **Submit**. You get an instant solution breakdown with explanations for each question.",
          },
          {
            id: "streak",
            title: "How does the streak work?",
            answer:
              "Solving the DPP on any given day (before 11:59 PM IST) extends your streak by 1.\n\n" +
              "Miss a day and the streak resets to 0 — partially attempted DPPs do **not** count. Streak milestones award bonus coins.",
          },
          {
            id: "past",
            title: "Can I attempt an older DPP?",
            answer:
              "Yes. In **Daily**, scroll to *Previous DPPs*. Past DPPs cost a small bonus-coin fee (currently 5 coins) because they are outside the free daily window.\n\n" +
              "Older DPPs do not extend your streak — only the current day's DPP does.",
          },
          {
            id: "review",
            title: "Where do I review my DPP answers?",
            answer:
              "Right after submitting you land on the analysis page. To reopen it later, go to **Progress → Attempts** and tap that DPP. Wrong questions also flow automatically into **Mistakes**.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer:
              "On the free trial you get **today's live DPP only**. Archived/previous DPPs are a paid-plan feature (or unlockable with bonus coins).\n\n" +
              "There is no cap on re-reading solutions of a DPP you have already submitted.",
          },
          {
            id: "paid",
            title: "Paid batch limits",
            answer:
              "Prime, Elite and Hero unlock **every DPP in the archive**, unlimited re-attempts in practice mode, and chapter-filtered DPP sets. There is no daily cap.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          errorLeaf(
            "DPP",
            "**“No DPP available today”** — the daily set is generated at 12:00 AM IST. If it's after that, pull to refresh; a cached page is the usual cause.\n\n" +
              "**“Attempt already submitted”** — you (or another device on the same account) already finished today's set. Open Progress → Attempts to see the result.\n\n" +
              "**Timer/answers not saving** — a weak connection stopped the autosave. Reconnect and reopen the DPP; your answered questions are restored from the last save.",
          ),
          {
            id: "streak-lost",
            title: "My streak reset even though I solved it",
            answer:
              "Streaks are computed in **IST**. If you submitted after 11:59 PM IST, it counts for the next day.\n\n" +
              "If your submission timestamp is clearly inside the day and the streak still dropped, send us the date and we'll restore it manually.",
          },
          {
            id: "wrong-q",
            title: "A DPP question looks wrong",
            answer:
              "Tap the ⚑ **Report** icon on the question and pick a reason (wrong answer key, typo, out of syllabus, bad image). Reported questions go into our review queue and are fixed or removed — you are not penalised for a question we retract.",
          },
          bugLeaf("Daily DPP"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "battlegrounds",
    title: "Battlegrounds (1v1 Battles)",
    icon: Swords,
    desc: "Matchmaking, scoring, winnings, history",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "start",
            title: "How do I start a battle?",
            answer:
              "Open **Battlegrounds** → pick a chapter/topic → tap **Find opponent**. Matchmaking pairs you with a player of similar rating, usually in under 20 seconds.\n\n" +
              "Both players get the same questions at the same time. Highest score when the timer ends wins.",
          },
          {
            id: "scoring",
            title: "How is the winner decided?",
            answer:
              "Score = correct answers first, **speed as the tiebreaker**. If both score and total time tie, the match is a draw and entry fees are refunded to both wallets.",
          },
          {
            id: "prize",
            title: "When do I get my winnings?",
            answer:
              "Winnings are credited to your in-app **Wallet** the moment the match is finalised (a few seconds after the last question). Check Wallet → Transactions for the entry.",
          },
          {
            id: "history",
            title: "Where do I see past battles?",
            answer:
              "Battlegrounds → **History**. Each row opens the full question-by-question comparison against your opponent.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer:
              "Trial users can play free-entry battles only, with a limited number of matches per day. Paid-entry battles with wallet prizes require an active batch.",
          },
          {
            id: "fair",
            title: "Fair-play rules",
            answer:
              "Leaving a match mid-way counts as a loss and the entry fee is forfeited. Switching apps repeatedly during a battle triggers our anti-cheat and can void the result. Multi-accounting leads to a permanent ban and wallet freeze.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "no-opponent",
            title: "Stuck on “Finding opponent”",
            answer:
              "If no human is queued for that chapter within ~30 seconds we match you with a practice bot of similar level so you're never blocked. If the screen hangs longer than a minute, go back and retry — queue entries expire after 60 seconds.",
          },
          {
            id: "disconnect",
            title: "I got disconnected mid-battle",
            answer:
              "Reopen Battlegrounds within the match window and you'll be dropped straight back into the live match with your answers intact. If the timer expired while you were offline, the match is scored on the answers we received.",
          },
          {
            id: "prize-missing",
            title: "I won but the wallet wasn't credited",
            answer:
              "Finalisation can lag a few seconds. Refresh the Wallet page. If it's still missing after 10 minutes, send us the match ID from Battlegrounds → History and we'll credit it manually.",
          },
          bugLeaf("Battlegrounds"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "mocks",
    title: "Mock Tests",
    icon: GraduationCap,
    desc: "Full syllabus, part tests, analysis",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "start",
            title: "How do I take a mock test?",
            answer:
              "Open **Mocks** and pick a category chip — Full Syllabus, Class 11 / 12 Full, or Part Test. Tap a paper → **Start**.\n\n" +
              "Full mocks are 180 questions in 180 minutes with the real NEET marking scheme (+4 correct, −1 wrong, 0 unattempted).",
          },
          {
            id: "pattern",
            title: "What pattern do the mocks follow?",
            answer:
              "Real NEET weightage: **Biology 90 • Chemistry 45 • Physics 45**, chapter-wise distribution matched to recent NEET papers, and a NEET 2025 / re-NEET style question mix with a heavy share of multiple-statement, match-the-following and assertion-reason items.\n\n" +
              "Difficulty is balanced (about 35% easy, 47% medium, 18% hard) so the paper is genuinely finishable in 3 hours.",
          },
          {
            id: "pause",
            title: "Can I pause or resume a mock?",
            answer:
              "Mocks run on a real exam clock and cannot be paused. If the app closes, reopen it — you return to the same attempt with the remaining time and your saved answers. When the timer hits zero the paper auto-submits.",
          },
          {
            id: "analysis",
            title: "Where is my score and analysis?",
            answer:
              "Straight after submission you get the score card: subject-wise accuracy, chapter-wise strengths/weaknesses, time per question and your percentile against everyone who attempted that paper. Reopen it any time from **Progress → Attempts**.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer:
              "Trial accounts get **5 mock attempts in total (lifetime)**. Once used, the Start button shows an upgrade prompt.",
          },
          {
            id: "paid",
            title: "Paid batch limits",
            answer:
              "Prime, Elite and Hero get **unlimited mock attempts**, including re-attempts of a paper you've already done (previous attempts are kept separately in your history).",
          },
          {
            id: "reattempt",
            title: "Can I re-attempt the same mock?",
            answer:
              "Yes, on a paid batch. Each attempt is stored separately so you can compare score improvement over time. Your percentile is always calculated from first attempts only, to keep the ranking fair.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          errorLeaf(
            "mocks",
            "**“Test not found”** — the paper was updated while you had the list cached. Pull to refresh the Mocks page.\n\n" +
              "**“Attempt limit reached”** — you're on the free trial and have used all 5 attempts. Upgrade from Dashboard → Go Premium.\n\n" +
              "**Blank / stuck question** — tap next and back once; if a question's image fails to load it's usually a network hiccup, and the question stays scoreable.",
          ),
          {
            id: "crash",
            title: "The test crashed mid-attempt",
            answer:
              "Reopen the app and tap the same mock — you resume the live attempt with your answers and the correct remaining time. Nothing is lost as long as the exam window hasn't ended.",
          },
          {
            id: "score-wrong",
            title: "My score looks wrong",
            answer:
              "Check the marking scheme on the score card: +4 correct, −1 wrong, 0 unattempted. Questions we later retracted for an error are excluded from the total and marked in the review.\n\n" +
              "If the maths still doesn't add up, send us the attempt link and we'll recheck it.",
          },
          bugLeaf("mock tests"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "pyq",
    title: "PYQs (Previous Year Questions)",
    icon: ListChecks,
    desc: "Year-wise and chapter-wise past papers",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "browse",
            title: "How do I practise PYQs?",
            answer:
              "Open **PYQs** and choose a year-wise paper or a chapter-wise set. Year papers run with the original timing and marking; chapter sets are untimed practice with instant explanations.",
          },
          {
            id: "coverage",
            title: "Which years are covered?",
            answer:
              "NEET/AIPMT papers spanning the last two decades, including all recent shifts and the re-NEET paper. New papers are added within days of the official release.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer: "Trial users get a sample of recent-year PYQ sets. Full year-wise archives are part of the paid batches.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "answer-key",
            title: "The answer key looks incorrect",
            answer:
              "Some NEET questions have official key revisions. Tap ⚑ **Report** on the question with the source you're referring to — we verify against the NTA final key and correct it within 48 hours.",
          },
          bugLeaf("PYQs"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "generate",
    title: "AI Test Generator & AI Quiz",
    icon: Sparkles,
    desc: "Custom papers, AI study path",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "generate",
            title: "How do I generate a custom test?",
            answer:
              "Open **Generate**, choose subject → chapters → question count → difficulty, then tap Generate. The paper is built in seconds from our verified bank and saved under your practice tests.",
          },
          {
            id: "path",
            title: "What is the AI Study Path?",
            answer:
              "AI Path reads your attempt history and builds a day-by-day plan: which chapters to revise, which to practise, and which mock to take next. It refreshes automatically as your accuracy changes.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer:
              "Trial users can generate **3 tests per day** (resets at midnight IST). Bookmark-based and mistake-based papers are capped at 5 each, lifetime.",
          },
          {
            id: "paid",
            title: "Paid batch limits",
            answer: "Paid batches get unlimited generations with no daily cap, plus larger papers (up to 180 questions).",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          errorLeaf(
            "the generator",
            "**“Not enough questions”** — your filter is too narrow (e.g. Hard-only in a small chapter). Widen the difficulty or add another chapter.\n\n" +
              "**“Daily limit reached”** — free-trial cap of 3/day; it resets at 12:00 AM IST.\n\n" +
              "**Generation times out** — retry once; if the second attempt also fails, reduce the question count.",
          ),
          bugLeaf("the AI generator"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "neetlab",
    title: "NEETLab (3D models & simulations)",
    icon: FlaskConical,
    desc: "Interactive physics/chem/bio labs",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "open",
            title: "How do I open a simulation?",
            answer:
              "Open **NEETLab**, pick a subject, then a topic. Each topic bundles 3D models, interactive simulations and a short concept recap. Drag to rotate a model, pinch to zoom.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "free",
            title: "Free / trial plan limits",
            answer: "Trial users can open **1 model or simulation per day**. Paid batches have unlimited access.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "not-loading",
            title: "A 3D model won't load",
            answer:
              "3D models are heavy. Use Wi-Fi for the first load, and make sure your browser/WebView is up to date. On very old Android devices some models fall back to static diagrams by design.",
          },
          bugLeaf("NEETLab"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "study",
    title: "Study Material & Short Notes",
    icon: BookOpen,
    desc: "PDFs, downloads, NCERT highlights",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "find",
            title: "Where do I find short notes?",
            answer:
              "**Study Essentials** → pick a subject → chapter. Notes open in an in-app reader; the **PDF** button downloads a watermarked copy you can read offline.",
          },
          {
            id: "highlights",
            title: "What is Highlighted NCERT?",
            answer:
              "Line-by-line NCERT text with the statements NTA has repeatedly asked from, highlighted. Use it for last-month revision — it's the highest-yield reading in the app.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "downloads",
            title: "Download limits",
            answer:
              "Trial users can download **3 PDFs per day**; reading in the app is unlimited. Paid batches have unlimited downloads.\n\n" +
              "Every PDF is watermarked with your account — please don't redistribute it.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "pdf-fail",
            title: "The PDF won't open or download",
            answer:
              "Check free storage, then retry on Wi-Fi. On Android, downloads land in *Downloads/NeetBuddy*. If the file opens blank, your PDF viewer may not support watermark layers — try Google Drive PDF viewer.",
          },
          bugLeaf("study material"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "flashcards",
    title: "Flashcards & Revision",
    icon: Layers,
    desc: "Spaced repetition, bookmarks, mistakes",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "srs",
            title: "How does spaced repetition work?",
            answer:
              "Rate each card *Again / Hard / Good / Easy*. Cards you find hard come back sooner; easy ones are pushed further out. Doing your due cards daily is enough — the schedule handles the rest.",
          },
          {
            id: "bookmarks",
            title: "Bookmarks and Mistakes",
            answer:
              "Tap the bookmark icon on any question to save it. Every wrong answer is auto-collected in **Mistakes**. From either page you can generate a targeted practice test in one tap.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "missing",
            title: "My bookmarks / mistakes are missing",
            answer:
              "They're tied to your account, not the device — make sure you're signed in with the same login (Google vs email creates two separate accounts). If they're still missing, tell us the approximate date you saved them.",
          },
          bugLeaf("flashcards"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "contests",
    title: "Contests & Prizes",
    icon: Trophy,
    desc: "Entry, timings, results, payouts",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "join",
            title: "How do I join a contest?",
            answer:
              "Open **Contests**, pick a live or upcoming one, pay the entry fee (many are free) and attempt inside the contest window. You can start any time in the window but the clock runs once you begin.",
          },
          {
            id: "results",
            title: "When are results and prizes out?",
            answer:
              "The leaderboard finalises shortly after the contest window closes. Prizes are credited automatically to your Wallet — no claim needed.",
          },
        ],
      },
      {
        id: "limits",
        title: "Rules & limits",
        children: [
          {
            id: "rules",
            title: "Contest rules",
            answer:
              "One attempt per contest per account. Tab-switching and multi-accounting are detected and disqualify the entry. Ties are broken by total time taken.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "missed",
            title: "I paid but couldn't attempt",
            answer:
              "If you never started the paper, the entry fee is refunded to your wallet automatically within 24 hours of the contest closing. If it isn't, send us the contest name and date.",
          },
          bugLeaf("contests"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "wallet",
    title: "Wallet & Withdrawals",
    icon: Wallet,
    desc: "Balance, coins, UPI payouts",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "balance",
            title: "What's in my wallet?",
            answer:
              "Your wallet holds **winnings and bonuses** (withdrawable) and **bonus coins** (usable inside the app for past DPPs, unlocks etc., not withdrawable). Both are shown separately on the Wallet page.",
          },
          {
            id: "withdraw",
            title: "How do I withdraw?",
            answer:
              "Wallet → **Withdraw** → enter your UPI ID → confirm. Minimum withdrawal is **₹50**. Payouts usually settle in 24–48 hours on working days.",
          },
        ],
      },
      {
        id: "limits",
        title: "What are the limits?",
        children: [
          {
            id: "min",
            title: "Minimums and timelines",
            answer:
              "Minimum ₹50 per withdrawal. One pending withdrawal at a time. Requests raised on a bank holiday settle the next working day.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "failed",
            title: "My withdrawal failed / is stuck",
            answer:
              "The usual cause is a wrong or inactive UPI ID — the amount returns to your wallet automatically within 48 hours, then you can retry with the correct ID.\n\n" +
              "If it's been over 48 hours with no reversal, send us the request date and the UPI ID used (never share your UPI PIN with anyone, including us).",
          },
          {
            id: "missing",
            title: "A credit is missing from my wallet",
            answer:
              "Check Wallet → **Transactions** first; referral and contest credits appear there with a timestamp. If the entry genuinely isn't there, tell us what it was for (referral / contest / battle) and the date.",
          },
          bugLeaf("the wallet"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "payments",
    title: "Payments, Batches & Premium",
    icon: CreditCard,
    desc: "Buying, upgrading, refunds, invoices",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "batches",
            title: "Which batch should I buy?",
            answer:
              "**Essential** — free basics. **Prime** — all mocks, unlimited AI tests, full DPP archive. **Elite** — Prime + contests + priority support. **Hero** — everything + 1:1 mentorship.\n\n" +
              "Compare them side by side on **Batches → Compare**.",
          },
          {
            id: "pay",
            title: "How do I pay?",
            answer:
              "Payments go through **Razorpay** — UPI, cards, netbanking and wallets. Your batch unlocks instantly on success.",
          },
          {
            id: "coupon",
            title: "How do I apply a coupon?",
            answer: "At checkout tap **Apply Coupon**, enter the code and the discount is shown before you pay. One coupon per order.",
          },
        ],
      },
      {
        id: "limits",
        title: "Billing details",
        children: [
          {
            id: "duration",
            title: "How long does a batch last?",
            answer:
              "Each batch has a fixed validity shown at checkout (typically until the next NEET). Your exact expiry is on **Profile → Subscription**.",
          },
          {
            id: "invoice",
            title: "Invoice / GST bill",
            answer: "Ask us in this chat with your registered email and order date — we email the invoice PDF within 24 hours.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "deducted",
            title: "Money deducted but batch not unlocked",
            answer:
              "Don't pay again. Razorpay sometimes confirms a few minutes late — close and reopen the app once.\n\n" +
              "If it's still locked after 30 minutes, send us the **Razorpay payment ID** (in the SMS/email from your bank) and we'll activate it manually or refund you.",
          },
          {
            id: "failed",
            title: "My payment failed",
            answer:
              "Failed payments are never captured — any debited amount is auto-reversed by your bank in 3–5 working days. Retry with another method (UPI usually has the highest success rate).",
          },
          {
            id: "refund",
            title: "Refund status",
            answer:
              "Eligible refunds are processed within **5–7 working days** to the original payment method. Check our Refund Policy page for eligibility. Send us your order date and registered email to track one.",
          },
          {
            id: "feature-locked",
            title: "I paid but a feature is still locked",
            answer:
              "Sign out and sign back in once — the entitlement refreshes on login. Also confirm you paid with the same account you're signed in with (Google login and email login are separate accounts).",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "referrals",
    title: "Referrals & Rewards",
    icon: Gift,
    desc: "Codes, bonuses, tracking",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "code",
            title: "How do referrals work?",
            answer:
              "Profile → **Referrals** has your code and share link. When a friend signs up with it and completes onboarding, **you both get ₹10** in your wallet. There's no cap on how many friends you invite.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "not-credited",
            title: "My referral wasn't credited",
            answer:
              "The code must be entered **during signup** — it can't be applied afterwards. Self-referrals and multiple accounts on one device are blocked automatically.\n\n" +
              "If your friend did use the code at signup and it's been over 24 hours, send us their registered email.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "mentorship",
    title: "Mentorship & Doubt Solving",
    icon: Users,
    desc: "Mentors, sessions, groups",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "assign",
            title: "How do I get a mentor?",
            answer:
              "Mentorship comes with the **Hero** batch (and as a standalone add-on). Once purchased, a mentor is assigned within 24–48 hours and appears under **Mentorship**.",
          },
          {
            id: "ask",
            title: "How do I ask a doubt?",
            answer:
              "Open **Mentorship** → your mentor's chat. Attach a photo of the question for the fastest answer. Mentors typically reply within a few hours on working days.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "no-mentor",
            title: "No mentor assigned yet",
            answer: "Assignment can take up to 48 hours after purchase. If it's been longer, message us here with your registered email and we'll assign one immediately.",
          },
          bugLeaf("mentorship"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "analytics",
    title: "Analytics, Progress & Leaderboard",
    icon: Activity,
    desc: "Accuracy, trends, ranks",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "analytics",
            title: "How do I read my analytics?",
            answer:
              "**Analytics** shows accuracy by subject and chapter, time-per-question, a weekly trend line and your weakest chapters. Work top-down through the weak list — that's where the marks are.",
          },
          {
            id: "leaderboard",
            title: "How does the leaderboard work?",
            answer:
              "Ranking uses your weekly score across mocks, DPPs and contests. It resets every Monday 12:00 AM IST. Top ranks earn bonus coins.",
          },
          {
            id: "predictor",
            title: "What is the Score Predictor?",
            answer:
              "It projects a NEET score and rank band from your recent mock performance and trend. Treat it as a direction indicator, not a guarantee — it gets more accurate after 3+ full mocks.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "not-updating",
            title: "My stats aren't updating",
            answer:
              "Analytics recompute a few minutes after each submission. Pull to refresh. Practice tests you abandoned without submitting are intentionally excluded.",
          },
          bugLeaf("analytics"),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "account",
    title: "Account, Login & Profile",
    icon: Lock,
    desc: "Sign-in, password, deletion",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "password",
            title: "How do I reset my password?",
            answer:
              "On the Login page tap **Forgot password?** and we'll email a reset link (check spam after 2 minutes). If you signed up with Google, you don't have a password — just use *Continue with Google*.",
          },
          {
            id: "edit",
            title: "How do I change my name, class or avatar?",
            answer: "Profile → **Edit profile**. Changes apply everywhere, including the leaderboard, immediately.",
          },
          {
            id: "devices",
            title: "Can I use the same account on two devices?",
            answer: "Yes — phone and web share the same account and progress. Unusual simultaneous use across many devices may trigger a security check.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "cant-login",
            title: "I can't log in",
            answer:
              "Most login problems are two accounts: signing up with Google and later trying email/password (or vice-versa). Try the other method first.\n\n" +
              "**“Invalid credentials”** — reset the password. **“Email not confirmed”** — open the confirmation link we emailed. Still stuck? Send us the email address you used.",
          },
          {
            id: "delete",
            title: "How do I delete my account?",
            answer:
              "Profile → **Delete Account**. Your wallet balance must be ₹0 (withdraw first). Deletion is permanent and completes within 7 days; purchased batches are not refunded on deletion.",
          },
          {
            id: "privacy",
            title: "What data do you store?",
            answer:
              "Your profile, attempts and payment records only. We never sell data. Full details are in the Privacy Policy in the footer; you can request an export any time in this chat.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "app",
    title: "App & Technical Issues",
    icon: Smartphone,
    desc: "Updates, notifications, performance",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "install",
            title: "How do I install the app?",
            answer:
              "Get **Neet Buddy** from the Google Play Store, or use the web app in any browser with the same login. On mobile browsers you can also tap the ⋮ menu → *Add to Home screen* for an app-like shortcut.",
          },
          {
            id: "notifications",
            title: "I'm not getting notifications",
            answer:
              "Android Settings → Apps → Neet Buddy → Notifications → allow. Also disable battery optimisation for the app, which is the usual culprit for missed DPP reminders.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "slow",
            title: "The app is slow or crashing",
            answer:
              "Update to the latest version, restart the device once, and free up storage. If it crashes on a specific screen every time, tell us which screen — that's almost always a fixable bug on our side.",
          },
          {
            id: "blank",
            title: "White / blank screen",
            answer:
              "This is a stale cached build. Fully close the app and reopen it. On web, do a hard refresh (Ctrl/Cmd + Shift + R). If it persists, tell us your device model and browser.",
          },
          {
            id: "offline",
            title: "Does the app work offline?",
            answer: "Downloaded PDFs work offline. Tests, DPPs and battles need a live connection so answers save correctly.",
          },
          bugLeaf("the app", "If the app closes instantly on launch, reinstalling from the Play Store fixes it without losing progress — your data is on the server."),
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "content",
    title: "Question Quality & Reports",
    icon: AlertTriangle,
    desc: "Wrong answers, typos, syllabus",
    children: [
      {
        id: "how",
        title: "How to use",
        children: [
          {
            id: "report",
            title: "How do I report a question?",
            answer:
              "Tap the ⚑ icon on any question and choose a reason: wrong answer key, wrong explanation, typo, bad image, duplicate or out of syllabus. Add a line of detail if you can — it speeds up the fix a lot.",
          },
          {
            id: "after",
            title: "What happens after I report?",
            answer:
              "Our review queue verifies it against NCERT/NTA sources. Confirmed issues are corrected or the question is retracted, and retracted questions are excluded from your score retroactively.",
          },
        ],
      },
      {
        id: "issues",
        title: "Something's wrong",
        children: [
          {
            id: "syllabus",
            title: "A question is outside the NEET syllabus",
            answer:
              "Report it with the reason *out of syllabus*. We track the latest NTA syllabus (including the 2024 deletions) and remove anything that no longer applies.",
          },
          {
            id: "image",
            title: "A diagram/image isn't loading",
            answer: "Usually a network issue — retry on Wi-Fi. If the image is genuinely missing, report the question and we'll re-upload the diagram.",
          },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: "other",
    title: "Something else",
    icon: LifeBuoy,
    desc: "Feedback, partnership, anything else",
    children: [
      {
        id: "general",
        title: "General",
        children: [
          {
            id: "feature",
            title: "I want to suggest a feature",
            answer:
              "We genuinely read every suggestion — use **Feedback** in the app or just type it here. Popular requests get built first.",
          },
          {
            id: "collab",
            title: "Partnership / collaboration / teaching with us",
            answer:
              "We work with teachers, content creators and campus ambassadors. Tell us a bit about yourself here (or on Telegram) and our team will get back to you.",
          },
          {
            id: "notfound",
            title: "My issue isn't listed here",
            answer:
              "No problem — describe it in one or two lines and our team will pick it up. Adding a screenshot and the time it happened gets you a faster, more precise answer.",
          },
        ],
      },
    ],
  },
];

export const TELEGRAM_SUPPORT_URL = "https://t.me/NEET_BUDDY_SUPPORT_bot";

/* Convenience: icons re-exported for the widget header chips */
export const HELP_ICONS = { Bot, Award, Brain, Medal, Settings, ShieldCheck };
