/** Canonical public media repository used at runtime. */
export const MEDIA_REPO_BASE_URL = "https://raw.githubusercontent.com/harshitraj4767-byte/neetbuddy-media/main";
export const PUBLIC_MEDIA_BASE_URL = `${MEDIA_REPO_BASE_URL}/public`;

/** Resolve a path in neetbuddy-media without bundling the asset into the app. */
export function mediaAsset(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${MEDIA_REPO_BASE_URL}/${normalized}`;
}
