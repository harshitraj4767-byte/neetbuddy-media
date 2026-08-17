import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { requestAccountDeletion } from "@/lib/account.functions";

export const Route = createFileRoute("/delete-account")({
  head: () => ({ meta: [{ title: "Delete Account — Neet Buddy" }] }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const del = useServerFn(requestAccountDeletion);

  const canSubmit = confirm.trim().toUpperCase() === "DELETE";

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await del();
      toast.success("Your account was scheduled for deletion.");
      await signOut();
      nav({ to: "/login" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete account");
    } finally { setBusy(false); }
  };

  return (
    <PageShell eyebrow="Account" title="Delete your account" description="This action is permanent and cannot be undone." showFooter>
      <Card className="mx-auto max-w-2xl border-destructive/40">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <AlertTriangle className="h-5 w-5 flex-none text-destructive" />
            <div className="text-sm">
              <p className="font-semibold text-foreground">What gets removed</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Your profile, name, email, phone, avatar and preferences</li>
                <li>All quiz attempts, bookmarks, notes, highlights and analytics history</li>
                <li>Referral code and pending referral payouts</li>
                <li>Community posts, feedback and support tickets you created</li>
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Purchase receipts and payment records may be retained for the period required by Indian tax and accounting laws.
              </p>
            </div>
          </div>

          {!user ? (
            <p className="text-sm text-muted-foreground">Please log in first to delete your account.</p>
          ) : (
            <>
              <div className="text-sm">
                <p className="mb-1 font-medium">Type <b>DELETE</b> to confirm:</p>
                <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => nav({ to: "/profile" })}>Cancel</Button>
                <Button variant="destructive" className="flex-1" disabled={!canSubmit || busy} onClick={submit}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete my account"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Prefer to talk to us first? <a href="/feedback" className="underline">Share feedback</a> — we'd love to help.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
