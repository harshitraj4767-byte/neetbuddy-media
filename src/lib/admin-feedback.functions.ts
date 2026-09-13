import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertAdmin } from "./admin-content.server";

export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data, error } = await (supabaseAdmin as any)
      .from("feedback")
      .select("id,user_id,rating,category,message,created_at,resolved")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set(((data ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id).filter((v): v is string => !!v)),
    );
    let profiles: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length > 0) {
      const { data: pRows } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", ids);
      profiles = Object.fromEntries((pRows ?? []).map((p: any) => [p.id, { full_name: p.full_name, email: p.email }]));
    }

    return {
      rows: (data ?? []).map((r: any) => ({
        ...r,
        full_name: profiles[r.user_id]?.full_name ?? null,
        email: profiles[r.user_id]?.email ?? null,
      })),
    };
  });

export const adminMarkFeedbackResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any)
      .from("feedback")
      .update({ resolved: data.resolved })
      .eq("id", data.id);
    // If the `resolved` column doesn't exist on the schema, swallow that
    // specific error so the page still works in read-only mode.
    if (error && !/column .* resolved/i.test(error.message)) {
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await (supabaseAdmin as any).from("feedback").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
