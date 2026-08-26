/**
 * PYQ tags in the question bank are messy: "kcet", "KECT", "TS EAMCET",
 * "TSEAMCET", "Jee", "MHTCET\n" … Everything user facing goes through
 * `examLabel()` so a question shows its real exam name instead of a
 * hardcoded "NEET PYQ".
 */
export function examLabel(tag?: string | null): string | null {
  const raw = (tag ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const key = raw.toUpperCase().replace(/[^A-Z]/g, "");
  if (!key) return null; // e.g. a stray "2009"
  if (key === "NEET" || key === "NEETUG") return "NEET";
  if (key === "AIPMT") return "AIPMT";
  if (key === "AIIMS") return "AIIMS";
  if (key.startsWith("JEE") || key === "JEEMAIN") return "JEE Main";
  if (key === "KCET" || key === "KECT" || key === "CET") return "KCET";
  if (key.includes("EAMCET")) return "TS EAMCET";
  if (key.includes("MHTCET") || key === "MHCET") return "MHT CET";
  if (key === "WBJEE") return "WBJEE";
  if (key === "BITSAT") return "BITSAT";
  return raw;
}

/** Badge text for a question card, e.g. "NEET 2019 PYQ". */
export function pyqBadge(tag?: string | null, year?: number | null): string {
  const exam = examLabel(tag);
  if (exam && year) return `${exam} ${year} PYQ`;
  if (exam) return `${exam} PYQ`;
  if (year) return `${year} PYQ`;
  return "PYQ";
}
