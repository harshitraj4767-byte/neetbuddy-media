import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-gradient-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="text-base font-bold">Neet <span className="text-gradient-primary">Buddy</span></div>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-muted-foreground">
              Premium NEET preparation — daily DPPs, AI quizzes, mock tests, live contests, and analytics that actually move your score.
            </p>
          </div>

          <div>
            <div className="text-sm font-semibold">Practice</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/mocks" search={{ mock: undefined }} className="hover:text-foreground">Mock tests</Link></li>
              <li><Link to="/contests" className="hover:text-foreground">Contests</Link></li>
              <li><Link to="/leaderboard" className="hover:text-foreground">Leaderboard</Link></li>
              <li><Link to="/analytics" className="hover:text-foreground">Analytics</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-sm font-semibold">Account</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li><Link to="/about" className="hover:text-foreground">About us</Link></li>
              <li><Link to="/profile" className="hover:text-foreground">Profile</Link></li>
              <li><Link to="/referrals" className="hover:text-foreground">Refer &amp; Earn</Link></li>
              <li><Link to="/subscription" className="hover:text-foreground">Subscription</Link></li>
              <li><Link to="/subscription" className="hover:text-foreground">Buy Premium</Link></li>
              <li><Link to="/feedback" className="hover:text-foreground">Send feedback</Link></li>
              <li><Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Log in</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <div>© {new Date().getFullYear()} Neet Buddy. All rights reserved.</div>
        </div>
      </div>
    </footer>
  );
}
