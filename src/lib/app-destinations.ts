/**
 * In-app destinations an admin can point a banner at.
 *
 * Banners store a *path* (e.g. "/batches") rather than a full URL, so the
 * links keep working if the domain or deployment URL ever changes.
 */
export type AppDestination = { path: string; label: string };

export const APP_DESTINATIONS: AppDestination[] = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/premium", label: "Premium / Upgrade" },
  { path: "/dedicated-program", label: "Dedicated Program" },
  { path: "/mentorship", label: "Mentorship" },
  { path: "/batches/compare", label: "Compare Batches" },
  { path: "/mocks", label: "Mock Tests" },
  { path: "/contests", label: "Contests" },
  { path: "/battlegrounds", label: "Battlegrounds" },
  { path: "/arena", label: "Arena" },
  { path: "/pyqs", label: "PYQs" },
  { path: "/dpp", label: "Daily Practice (DPP)" },
  { path: "/daily", label: "Daily" },
  { path: "/quiz/subjects", label: "Quiz — Subjects" },
  { path: "/flashcards", label: "Flashcards" },
  { path: "/neetlab", label: "NEET Lab" },
  { path: "/score-predictor", label: "Score Predictor" },
  { path: "/study-essentials", label: "Study Essentials" },
  { path: "/highlighted-ncert", label: "Highlighted NCERT" },
  { path: "/study-groups", label: "Study Groups" },
  { path: "/community", label: "Community" },
  { path: "/leaderboard", label: "Leaderboard" },
  { path: "/referrals", label: "Referrals" },
  { path: "/ai-path", label: "AI Path" },
  { path: "/analytics", label: "Analytics" },
  { path: "/progress", label: "Progress" },
  { path: "/profile", label: "Profile" },
  { path: "/subscription", label: "Subscription" },
  { path: "/feedback", label: "Feedback" },
];

export function isInternalDestination(v: string | null | undefined) {
  return !!v && v.startsWith("/");
}

export function destinationLabel(v: string | null | undefined) {
  if (!v) return "No link";
  return APP_DESTINATIONS.find((d) => d.path === v)?.label ?? v;
}
