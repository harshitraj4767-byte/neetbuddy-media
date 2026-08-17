import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAccessForUser } from "@/lib/access.server";

export type Tier = "elite" | "prime" | "essential" | "trial" | "none";

export type MyAccess = {
  tier: Tier;
  isAdmin: boolean;
  isMentor: boolean;
  trialActive: boolean;
  trialExpiresAt: string | null;
  subscriptionActive: boolean;
  subscriptionExpiresAt: string | null;
  batchId: string | null;
  batchTitle: string | null;
  features: string[];
};

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyAccess> => {
    return getAccessForUser(context.userId);
  });
