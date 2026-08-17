import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * User-initiated account deletion. Anonymizes the profile and disables the
 * auth user so they can no longer sign in. We keep purchase/audit rows intact
 * because Indian tax rules require retention, but strip PII.
 */
export const requestAccountDeletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const admin = supabaseAdmin as any;

    // Anonymize profile PII.
    await admin.from("profiles").update({
      full_name: "Deleted user",
      email: null,
      phone: null,
      avatar_url: null,
      referral_code: null,
      bio: null,
    }).eq("id", uid);

    // Best-effort delete of user-generated content that the user owns outright.
    await admin.from("bookmarks").delete().eq("user_id", uid).then(() => {}, () => {});
    await admin.from("notes").delete().eq("user_id", uid).then(() => {}, () => {});
    await admin.from("feedback").delete().eq("user_id", uid).then(() => {}, () => {});

    // Ban the auth user so they can't sign back in.
    try {
      await (admin as any).auth.admin.updateUserById(uid, { ban_duration: "876000h" });
    } catch (e) {
      // fallback: delete the auth user entirely
      try { await (admin as any).auth.admin.deleteUser(uid); } catch {}
    }

    return { ok: true };
  });
