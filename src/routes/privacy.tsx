import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Neet Buddy" },
      { name: "description", content: "How Neet Buddy collects, uses, and protects your personal data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const updated = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  return (
    <PageShell eyebrow="Legal" title="Privacy Policy" description={`Last updated: ${updated}`} showFooter>
      <div className="prose prose-sm dark:prose-invert mx-auto max-w-3xl text-foreground">
        <p>
          Neet Buddy ("we", "our", "us") respects your privacy. This Privacy Policy
          explains what information we collect, how we use it, and the choices you have
          when you use our website and mobile-web application (the "Service").
        </p>

        <h2>1. Information we collect</h2>
        <ul>
          <li><strong>Account data</strong> — name, email, phone (if provided), profile photo, and authentication identifiers.</li>
          <li><strong>Usage data</strong> — quizzes attempted, answers, scores, streaks, bookmarks, time spent, device and browser metadata, IP-derived approximate location.</li>
          <li><strong>Payment data</strong> — handled by our payment processor (Razorpay). We store only payment metadata (order id, status, amount, timestamps) — never your full card details.</li>
          <li><strong>Support &amp; feedback</strong> — messages you send through feedback or support widgets.</li>
        </ul>

        <h2>2. How we use your information</h2>
        <ul>
          <li>Provide the Service: deliver quizzes, mock tests, analytics, leaderboards and contests.</li>
          <li>Personalise practice and surface relevant recommendations.</li>
          <li>Process payments, credit bonuses, and prevent fraud or abuse.</li>
          <li>Send transactional notifications and respond to support requests.</li>
          <li>Improve our content, fix bugs, and measure product performance.</li>
        </ul>

        <h2>3. Sharing</h2>
        <p>
          We do not sell your personal data. We share limited data only with:
        </p>
        <ul>
          <li>Service providers (hosting, authentication, payments, analytics, email) bound by confidentiality.</li>
          <li>Law-enforcement or regulators when legally required.</li>
          <li>Other users — only your public profile (name, XP, streak rank) appears on leaderboards.</li>
        </ul>

        <h2>4. Cookies &amp; local storage</h2>
        <p>
          We use cookies and browser storage to keep you signed in, remember preferences,
          and measure traffic. You can clear these from your browser at any time; some
          features may stop working if you do.
        </p>

        <h2>5. Data retention</h2>
        <p>
          We keep your account data as long as your account is active. You may request
          deletion of your account at any time via the Feedback page or by emailing us.
          Some records (payments, audit logs) may be retained as required by law.
        </p>

        <h2>6. Children</h2>
        <p>
          The Service is intended for users aged 13 and above. If you are under 18,
          please use it with a parent or guardian's supervision.
        </p>

        <h2>7. Security</h2>
        <p>
          We use industry-standard safeguards including encryption in transit (HTTPS),
          row-level security on our database, and access controls on administrative tools.
          No system is 100% secure — please use a strong, unique password.
        </p>

        <h2>8. Your rights</h2>
        <p>
          You may access, correct, export, or delete your personal data by contacting us.
          You may also opt out of non-essential communications.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will be notified
          in-app or by email. Continued use of the Service after changes means you accept
          the updated policy.
        </p>

        <h2>10. Anti-cheat &amp; fair-play policy</h2>
        <p>
          Neet Buddy Battlegrounds and contests are competitive, real-money quizzes.
          To keep them fair we operate the following anti-cheat program:
        </p>
        <ul>
          <li><strong>No third-party assistance.</strong> Using AI assistants (Gemini, ChatGPT, Copilot, etc.), screen-overlay apps, search engines, screenshot OCR tools, accessibility-bot apps, custom keyboards that suggest answers, screen-mirroring, or any external help during a battle is strictly forbidden.</li>
          <li><strong>No tab switching, no app switching.</strong> Leaving the battle screen (switching tabs, minimising the browser, opening another app, or invoking a system overlay) for more than 10 seconds will auto-submit your current answers and may be treated as a forfeit.</li>
          <li><strong>No copy, paste, screenshot, or print.</strong> Copying questions, pasting answers, taking screenshots, printing, or opening developer tools during a battle is blocked client-side and logged.</li>
          <li><strong>No multi-accounting or collusion.</strong> Operating more than one account, sharing accounts, coordinating answers with another user, or running bots, scripts, automation, or emulators against the Service will result in permanent suspension and forfeiture of balances.</li>
          <li><strong>No tampering.</strong> Reverse-engineering the app, modifying client code, intercepting or replaying network traffic, or attempting to alter scores, timers, or wallet balances is a violation of these terms.</li>
          <li><strong>Server-side authority.</strong> All scoring, opponent selection, prize calculation and wallet movement is final and decided by our servers. Client-reported values are treated as advisory only.</li>
          <li><strong>Detection &amp; enforcement.</strong> We monitor for signals including (but not limited to) tab/app switching, viewport overlay events, suspicious response timing, IP / device-fingerprint clustering, and impossible score patterns. Confirmed violations may result in: voided results, forfeited stake, refund of opponent stake, account suspension, permanent ban, and report to law-enforcement where applicable.</li>
          <li><strong>Reporting.</strong> If you believe a player or match is acting unfairly, report it via the in-app Feedback or Support page with the match ID. We review every report.</li>
          <li><strong>Appeals.</strong> Suspended users may appeal in writing to <a href="mailto:support@neetbuddy.app">support@neetbuddy.app</a>. Decisions of the Neet Buddy moderation team are final.</li>
        </ul>

        <h2>11. Contact</h2>
        <p>
          Questions? Reach us at <a href="mailto:support@neetbuddy.app">support@neetbuddy.app</a> or
          via the in-app Feedback page.
        </p>

      </div>
    </PageShell>
  );
}
