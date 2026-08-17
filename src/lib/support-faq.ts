// Predefined support FAQ. Matched against user messages by keyword overlap.
// If a question matches, the bot instantly replies with the canned answer
// and appends a "contact our team for better response" hint.

export type FaqEntry = {
  id: string;
  keywords: string[]; // lowercased tokens; any-of match
  question: string;
  answer: string;
};

export const SUPPORT_FAQ: FaqEntry[] = [
  {
    id: "batches-overview",
    keywords: ["batch", "batches", "essential", "prime", "elite", "hero", "tier", "plan"],
    question: "What batches / plans are available?",
    answer:
      "We offer 4 batches: **Essential** (free basics), **Prime** (all mock tests + AI quizzes), **Elite** (Prime + contests + priority support) and **Hero** (everything + 1:1 mentorship). Compare them on the Batches page inside the app.",
  },
  {
    id: "payments",
    keywords: ["pay", "payment", "razorpay", "upi", "card", "buy", "purchase", "checkout", "money", "refund"],
    question: "How does payment work?",
    answer:
      "Payments are processed securely via **Razorpay** — UPI, cards, netbanking and wallets. After a successful payment, your batch unlocks instantly. Wallet withdrawals need ₹50 minimum. Refunds are processed within 5–7 business days if eligible.",
  },
  {
    id: "download",
    keywords: ["download", "install", "app", "apk", "playstore", "play store", "android", "ios", "iphone"],
    question: "How do I download the app?",
    answer:
      "Grab Neet Buddy from the **Google Play Store** (search “Neet Buddy”). iOS build is coming soon. You can also use the web app on any browser — same login works everywhere.",
  },
  {
    id: "premium",
    keywords: ["premium", "subscription", "upgrade", "unlock"],
    question: "What does Premium include?",
    answer:
      "Premium unlocks **unlimited AI-generated quizzes**, **all paid mock tests**, priority AI support and ad-free experience. Upgrade from the Dashboard → Go Premium.",
  },
  {
    id: "referral",
    keywords: ["refer", "referral", "invite", "bonus", "code"],
    question: "How do referrals work?",
    answer:
      "Share your **referral code** from Profile → Referrals. When a friend joins with it, you both get **₹10 wallet bonus**. Unlimited referrals allowed.",
  },
  {
    id: "wallet",
    keywords: ["wallet", "withdraw", "withdrawal", "balance", "deposit", "cashout"],
    question: "How does the wallet work?",
    answer:
      "Your wallet stores contest winnings and bonuses. **Minimum withdrawal is ₹50** to any UPI ID via Razorpay. Withdrawals usually settle in 24–48 hours.",
  },
  {
    id: "contests",
    keywords: ["contest", "prize", "join contest", "leaderboard"],
    question: "How do contests / prizes work?",
    answer:
      "Contests are timed quizzes with a prize pool. Join from the Contests page, pay the entry fee (or free ones), attempt within the window, and prizes are auto-credited to your wallet based on the leaderboard.",
  },
  {
    id: "mock-tests",
    keywords: ["mock", "mock test", "full test", "chapter test", "pyq", "previous year"],
    question: "How do mock tests work?",
    answer:
      "We offer **full-length mocks**, **chapter-wise tests** and **PYQs** (Previous Year Questions). Attempt them any time; detailed analysis with subject/chapter accuracy is shown after submission.",
  },
  {
    id: "ai-quiz",
    keywords: ["ai", "generate", "generator", "custom quiz", "generated"],
    question: "How does the AI quiz generator work?",
    answer:
      "Pick a subject, chapter and difficulty — our AI generates a fresh quiz in seconds. Premium users get **unlimited generations**; free users get a daily limit.",
  },
  {
    id: "battles",
    keywords: ["battle", "1v1", "duel", "friend", "battleground"],
    question: "What are Battles / Battlegrounds?",
    answer:
      "Battles are real-time **1v1 quiz duels**. Pick a topic, matchmake, and the highest score wins. Winnings are credited to your wallet.",
  },
  {
    id: "dpp",
    keywords: ["dpp", "daily", "daily practice", "streak"],
    question: "What is DPP (Daily Practice Problems)?",
    answer:
      "DPP is your **daily practice set** — solve it every day to build streaks, earn coins and stay consistent with NEET prep.",
  },
  {
    id: "flashcards",
    keywords: ["flashcard", "flash card", "revision"],
    question: "How do flashcards work?",
    answer:
      "Flashcards use **spaced repetition** to help you memorise formulas and concepts efficiently. Access them from the Flashcards tab.",
  },
  {
    id: "analytics",
    keywords: ["analytics", "progress", "report", "accuracy", "weakness"],
    question: "Where do I see my progress / analytics?",
    answer:
      "Open **Analytics** from the dashboard — you'll see accuracy, subject-wise strengths, weekly trends and recommended chapters to revise.",
  },
  {
    id: "leaderboard",
    keywords: ["leaderboard", "rank", "ranking", "top"],
    question: "How does the leaderboard work?",
    answer:
      "The **Leaderboard** ranks users by weekly score. Attempt more tests, get higher accuracy and climb up — top rankers get bonus rewards.",
  },
  {
    id: "coupons",
    keywords: ["coupon", "promo", "discount", "code"],
    question: "How do I apply a coupon?",
    answer:
      "At checkout, tap **Apply Coupon** and enter your code. Valid coupons show the discount instantly before payment.",
  },
  {
    id: "account",
    keywords: ["delete account", "delete", "remove account"],
    question: "How do I delete my account?",
    answer:
      "Go to **Profile → Delete Account**. This permanently removes your data within 7 days. Wallet balance must be zero before deletion.",
  },
  {
    id: "password",
    keywords: ["password", "reset", "forgot", "login issue", "cant login", "can't login"],
    question: "How do I reset my password?",
    answer:
      "On the **Login** page tap “Forgot password?” — we'll email a reset link. Check spam if you don't see it in 2 minutes.",
  },
  {
    id: "bookmarks",
    keywords: ["bookmark", "save", "saved question"],
    question: "How do bookmarks work?",
    answer:
      "Tap the bookmark icon on any question to save it. Review all saved questions from the **Bookmarks** tab any time.",
  },
];

const CONTACT_TEAM_HINT =
  "\n\n_If this doesn't fully answer your question, tap **Talk to Team** below and our support team will get back to you personally._";

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Score each FAQ entry against the incoming message.
 * Returns the best match if it beats a small threshold, otherwise null.
 */
export function matchFaq(userMessage: string): FaqEntry | null {
  const tokens = new Set(tokenize(userMessage));
  if (tokens.size === 0) return null;

  let best: { entry: FaqEntry; score: number } | null = null;
  for (const entry of SUPPORT_FAQ) {
    let score = 0;
    for (const kw of entry.keywords) {
      const parts = kw.split(/\s+/);
      const hit = parts.every((p) => tokens.has(p));
      if (hit) score += parts.length; // multi-word phrases weigh more
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best ? best.entry : null;
}

export function formatFaqAnswer(entry: FaqEntry): string {
  return `${entry.answer}${CONTACT_TEAM_HINT}`;
}
