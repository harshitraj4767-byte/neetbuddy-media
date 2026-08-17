import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms of Service — Neet Buddy" }] }),
  component: TermsPage,
});

function TermsPage() {
  const updated = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  return (
    <PageShell eyebrow="Legal" title="Terms of Service" description={`Last updated: ${updated}`} showFooter>
      <div className="prose prose-sm dark:prose-invert mx-auto max-w-3xl text-foreground">
        <p>By creating an account or using Neet Buddy you agree to these Terms. Please read them carefully.</p>

        <h2>1. Eligibility</h2>
        <p>You must be at least 13 years old (or the age of digital consent in your jurisdiction). Users under 18 may use the Service only with a parent or guardian's supervision.</p>

        <h2>2. Accounts</h2>
        <p>You are responsible for the activity on your account and for keeping your credentials secure. Notify us immediately of any unauthorized use.</p>

        <h2>3. Content and educational disclaimer</h2>
        <p>Practice questions, mock tests, PYQs, and AI-generated study material are provided for educational preparation only. We do not guarantee any specific NEET result or admission outcome.</p>

        <h2>4. Payments</h2>
        <p>Batches and premium features are purchased through Razorpay. All prices are in Indian Rupees (₹) and inclusive of applicable taxes unless stated otherwise. See our <a href="/refund">Refund &amp; Cancellation Policy</a> for details.</p>

        <h2>5. Referrals &amp; payouts</h2>
        <p>Referral rewards are credited when the referred user successfully completes an eligible batch purchase. Minimum withdrawal is ₹1,000. Fraudulent activity (self-referral, fake sign-ups, chargebacks) will forfeit all pending rewards and may result in account suspension.</p>

        <h2>6. Acceptable use</h2>
        <p>Do not resell, screen-record, or redistribute course material. Do not attempt to reverse-engineer, scrape, or overload the Service. Cheating, impersonation, or harassment in community/battle features may result in permanent removal.</p>

        <h2>7. Termination</h2>
        <p>You may delete your account at any time via <a href="/delete-account">Delete Account</a>. We may suspend or terminate accounts that violate these Terms.</p>

        <h2>8. Limitation of liability</h2>
        <p>The Service is provided "as is" without warranty of any kind. To the maximum extent permitted by law, our aggregate liability will not exceed the amount you paid to us in the preceding 12 months.</p>

        <h2>9. Changes</h2>
        <p>We may update these Terms from time to time. Material changes will be highlighted inside the app. Continued use after an update constitutes acceptance.</p>

        <h2>10. Contact</h2>
        <p>Questions? Reach us via the <a href="/feedback">Feedback</a> page or email <a href="mailto:support@neetbuddy.app">support@neetbuddy.app</a>.</p>
      </div>
    </PageShell>
  );
}
