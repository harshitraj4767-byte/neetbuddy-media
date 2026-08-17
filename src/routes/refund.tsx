import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/refund")({
  head: () => ({ meta: [{ title: "Refund Policy — Neet Buddy" }] }),
  component: RefundPage,
});

function RefundPage() {
  const updated = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  return (
    <PageShell eyebrow="Legal" title="Refund & Cancellation Policy" description={`Last updated: ${updated}`} showFooter>
      <div className="prose prose-sm dark:prose-invert mx-auto max-w-3xl text-foreground">
        <p>We want you to be confident about your purchase on Neet Buddy. This policy explains when and how refunds are issued.</p>

        <h2>1. Batches (Essential / Prime / Elite)</h2>
        <ul>
          <li>Full refund if requested within <strong>7 days</strong> of purchase <em>and</em> you have consumed less than 15% of the batch content (measured by attempted questions / video hours).</li>
          <li>No refund after 7 days, or if consumption exceeds 15%.</li>
        </ul>

        <h2>2. Referral / cash rewards</h2>
        <p>Referral cash payouts, once processed to your bank account, cannot be reversed. Pending rewards for referrals that are later refunded to the referred friend will be cancelled.</p>

        <h2>3. Payment failures</h2>
        <p>If money was deducted but your access was not activated, contact us within 48 hours with the Razorpay order ID. Verified failures are auto-refunded to the original payment method within 5–7 business days.</p>

        <h2>4. How to request a refund</h2>
        <p>Email <a href="mailto:support@neetbuddy.app">support@neetbuddy.app</a> from your registered address with the order ID and reason. Refunds are processed via the original payment method within 7–10 business days after approval.</p>

        <h2>5. Cancellation</h2>
        <p>You can cancel your account at any time via <a href="/delete-account">Delete Account</a>. Cancellation does not automatically issue a refund; refund eligibility follows the rules above.</p>
      </div>
    </PageShell>
  );
}
