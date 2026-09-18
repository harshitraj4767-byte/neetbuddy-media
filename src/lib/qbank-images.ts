// Question-bank and UI asset image resolution (diagrams, options, illustrations, mascot).
//
// Images are served directly via free jsDelivr CDN from the public neetbuddy-media repository.

import { PUBLIC_MEDIA_BASE_URL } from "@/lib/media-assets";

const CDN_BASE = PUBLIC_MEDIA_BASE_URL;
const LEGACY_MEDIA_URL_PATTERNS = [
  /^https?:\/\/raw\.githubusercontent\.com\/harshitraj4767-byte\/(?:migration-helper|neetbuddy-media)\/[^/]+\/(.+)$/i,
  /^https?:\/\/cdn\.jsdelivr\.net\/gh\/harshitraj4767-byte\/(?:migration-helper|neetbuddy-media)@[^/]+\/(.+)$/i,
  /^https?:\/\/github\.com\/harshitraj4767-byte\/(?:migration-helper|neetbuddy-media)\/raw\/[^/]+\/(.+)$/i,
];

/** Return the path inside the canonical media repository for a legacy URL. */
function legacyMediaPath(value: string): string | null {
  for (const pattern of LEGACY_MEDIA_URL_PATTERNS) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1].replace(/^public\//i, "").replace(/^\/+/, "");
  }
  return null;
}

function usesLegacyMediaBase(value: string): boolean {
  const base = value.replace(/\/+$/, "");
  return Boolean(legacyMediaPath(`${base}/__neetbuddy_media_probe__.png`));
}
const configuredRawBase =
  typeof import.meta !== "undefined"
    ? (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_QBANK_IMAGE_BASE
    : undefined;
const RAW_BASE =
  configuredRawBase && !usesLegacyMediaBase(configuredRawBase)
    ? `${configuredRawBase.replace(/\/+$/, "")}/`
    : `${CDN_BASE}/img/data/`;

const ABSOLUTE_RE = /^(?:https?:|data:|blob:)/i;
const QBANK_PATH_RE = /^\/(?:public\/)?(?:img\/data\/|(?:physics|chemistry|biology)\/)/i;

/** Strip host/serving prefixes so only `subject/file.png` remains. */
export function normalizeQbankImagePath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const raw = String(pathOrUrl).trim();
  if (!raw) return null;
  const legacyPath = legacyMediaPath(raw);
  if (legacyPath) {
    const dataPath = legacyPath.replace(/^img\/data\//i, "");
    return dataPath === legacyPath ? `${CDN_BASE}/${legacyPath}` : `${CDN_BASE}/img/data/${dataPath}`;
  }
  if (ABSOLUTE_RE.test(raw)) return raw;
  if (raw.startsWith("/") && !QBANK_PATH_RE.test(raw)) return raw;
  let s = raw.replace(/^\/+/, "");
  s = s.replace(/^public\//i, "");
  s = s.replace(/^img\/data\//i, "");
  return s || null;
}

/** Resolve a stored path (or absolute URL) to something an <img src> can use. */
export function qbankImageUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const raw = String(pathOrUrl).trim();
  if (!raw) return null;
  const legacyPath = legacyMediaPath(raw);
  if (legacyPath) {
    const dataPath = legacyPath.replace(/^img\/data\//i, "");
    return dataPath === legacyPath ? `${CDN_BASE}/${legacyPath}` : `${CDN_BASE}/img/data/${dataPath}`;
  }
  if (ABSOLUTE_RE.test(raw)) return raw;

  // Illustrations, mascot, and NCERT assets
  if (raw.startsWith("/illustrations/") || raw.startsWith("illustrations/")) {
    return `${CDN_BASE}/${raw.replace(/^\/+/, "")}`;
  }
  if (raw.startsWith("/mascot/") || raw.startsWith("mascot/")) {
    return `${CDN_BASE}/${raw.replace(/^\/+/, "")}`;
  }
  if (raw.startsWith("/icons/") || raw.startsWith("icons/")) {
    return `${CDN_BASE}/${raw.replace(/^\/+/, "")}`;
  }

  if (raw.startsWith("/ncert/") || raw.startsWith("ncert/")) {
    return `${CDN_BASE}/${raw.replace(/^\/+/, "")}`;
  }

  const s = normalizeQbankImagePath(raw);
  if (!s) return null;
  if (ABSOLUTE_RE.test(s)) return s;
  if (s.startsWith("/")) {
    if (s.startsWith("/img/data/")) {
      return `${CDN_BASE}${s}`;
    }
    return s;
  }
  const base = RAW_BASE.endsWith("/") ? RAW_BASE : `${RAW_BASE}/`;
  return base + s;
}

export function isRelativeQbankPath(s: string): boolean {
  return !ABSOLUTE_RE.test(s) && !s.startsWith("/");
}
