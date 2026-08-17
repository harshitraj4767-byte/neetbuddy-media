// Friendly, deterministic avatars for NEETIQ.
// Uses the curated NEETIQ avatar chart (60 PNGs on Supabase Storage).
// Returns the user's uploaded avatar if it exists and is NOT a generic
// DiceBear / ui-avatars placeholder.
import { avatarForName, isNeetiqAvatar } from "@/lib/neetiq-avatars";

export function avatarUrl(seed: string | null | undefined, existing?: string | null): string {
  const s = (seed && seed.trim()) || "neetiq";
  if (
    existing &&
    typeof existing === "string" &&
    existing.length > 0 &&
    isNeetiqAvatar(existing) &&
    !existing.includes("dicebear.com") &&
    !existing.includes("ui-avatars.com") &&
    !existing.includes("api.dicebear.com")
  ) {
    return existing;
  }
  // Fall back to the curated NEETIQ avatar set (deterministic by name).
  return avatarForName(s);
}
