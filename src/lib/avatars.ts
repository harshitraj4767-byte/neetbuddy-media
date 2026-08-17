// Curated NEETIQ avatar set. Users can pick from these — no custom uploads.
import { NEETIQ_AVATARS } from "@/lib/neetiq-avatars";

export const AVATAR_OPTIONS: string[] = [...NEETIQ_AVATARS];

export function isCuratedAvatar(url: string | null | undefined) {
  return !!url && (NEETIQ_AVATARS as readonly string[]).includes(url);
}
