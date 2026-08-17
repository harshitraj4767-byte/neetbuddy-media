// Historical NEET-UG reference data used to ground AI path / score predictor
// outputs. Kept as a plain module so both server functions can share it and
// so it lives in the client-safe module graph (server-only imports still
// happen inside handlers).

export type NeetYearRecord = {
  year: number;
  toughness: "easy" | "moderate" | "tough" | "very_tough";
  avg_marks_top_10pct: number; // out of 720
  general_cutoff_marks: number; // NEET-UG general cutoff (approx)
  notes: string;
  // Rank vs marks reference points (marks out of 720 -> approx AIR).
  rank_ladder: Array<{ marks: number; air: number }>;
};

// Data compiled from officially published NTA cut-offs and widely reported
// rank-vs-marks tables (2019-2025). Numbers are rounded reference points; the
// AI must use them as anchoring, not as ground truth for any single candidate.
export const NEET_HISTORY: NeetYearRecord[] = [
  {
    year: 2019,
    toughness: "moderate",
    avg_marks_top_10pct: 560,
    general_cutoff_marks: 134,
    notes: "Balanced paper. Physics slightly tough, Biology easy.",
    rank_ladder: [
      { marks: 720, air: 1 }, { marks: 700, air: 20 }, { marks: 680, air: 120 },
      { marks: 660, air: 500 }, { marks: 640, air: 1500 }, { marks: 620, air: 3200 },
      { marks: 600, air: 6500 }, { marks: 560, air: 18000 }, { marks: 520, air: 40000 },
      { marks: 480, air: 75000 }, { marks: 400, air: 175000 },
    ],
  },
  {
    year: 2020,
    toughness: "moderate",
    avg_marks_top_10pct: 590,
    general_cutoff_marks: 147,
    notes: "Biology very scoring; Physics moderate; Chemistry easy.",
    rank_ladder: [
      { marks: 720, air: 1 }, { marks: 700, air: 30 }, { marks: 680, air: 160 },
      { marks: 660, air: 650 }, { marks: 640, air: 1900 }, { marks: 620, air: 4200 },
      { marks: 600, air: 8500 }, { marks: 560, air: 22000 }, { marks: 520, air: 48000 },
      { marks: 480, air: 88000 }, { marks: 400, air: 200000 },
    ],
  },
  {
    year: 2021,
    toughness: "tough",
    avg_marks_top_10pct: 610,
    general_cutoff_marks: 138,
    notes: "Toughest of the decade — Physics lengthy, Chemistry conceptual.",
    rank_ladder: [
      { marks: 720, air: 1 }, { marks: 700, air: 55 }, { marks: 680, air: 260 },
      { marks: 660, air: 950 }, { marks: 640, air: 2700 }, { marks: 620, air: 6000 },
      { marks: 600, air: 11500 }, { marks: 560, air: 28000 }, { marks: 520, air: 58000 },
      { marks: 480, air: 100000 }, { marks: 400, air: 230000 },
    ],
  },
  {
    year: 2022,
    toughness: "very_tough",
    avg_marks_top_10pct: 615,
    general_cutoff_marks: 117,
    notes: "Chemistry very tough, Physics moderate, Biology scoring.",
    rank_ladder: [
      { marks: 720, air: 1 }, { marks: 700, air: 25 }, { marks: 680, air: 140 },
      { marks: 660, air: 550 }, { marks: 640, air: 1700 }, { marks: 620, air: 4000 },
      { marks: 600, air: 8000 }, { marks: 560, air: 21000 }, { marks: 520, air: 47000 },
      { marks: 480, air: 85000 }, { marks: 400, air: 200000 },
    ],
  },
  {
    year: 2023,
    toughness: "moderate",
    avg_marks_top_10pct: 625,
    general_cutoff_marks: 137,
    notes: "Balanced; Biology easy — record 2 candidates scored 720/720.",
    rank_ladder: [
      { marks: 720, air: 2 }, { marks: 700, air: 80 }, { marks: 680, air: 400 },
      { marks: 660, air: 1300 }, { marks: 640, air: 3400 }, { marks: 620, air: 7500 },
      { marks: 600, air: 14000 }, { marks: 560, air: 33000 }, { marks: 520, air: 65000 },
      { marks: 480, air: 110000 }, { marks: 400, air: 245000 },
    ],
  },
  {
    year: 2024,
    toughness: "easy",
    avg_marks_top_10pct: 655,
    general_cutoff_marks: 164,
    notes: "Unusually easy — 67 candidates at AIR 1 (720/720). Cutoffs sharply higher.",
    rank_ladder: [
      { marks: 720, air: 67 }, { marks: 700, air: 500 }, { marks: 680, air: 2200 },
      { marks: 660, air: 6000 }, { marks: 640, air: 12500 }, { marks: 620, air: 22000 },
      { marks: 600, air: 36000 }, { marks: 560, air: 72000 }, { marks: 520, air: 118000 },
      { marks: 480, air: 175000 }, { marks: 400, air: 330000 },
    ],
  },
  {
    year: 2025,
    toughness: "tough",
    avg_marks_top_10pct: 605,
    general_cutoff_marks: 144,
    notes: "Return to tougher standard after 2024 outlier. Physics lengthy.",
    rank_ladder: [
      { marks: 720, air: 1 }, { marks: 700, air: 45 }, { marks: 680, air: 220 },
      { marks: 660, air: 800 }, { marks: 640, air: 2400 }, { marks: 620, air: 5400 },
      { marks: 600, air: 10500 }, { marks: 560, air: 26000 }, { marks: 520, air: 55000 },
      { marks: 480, air: 97000 }, { marks: 400, air: 220000 },
    ],
  },
];

/** Compact string form for embedding in AI prompts. */
export function neetHistoryPromptBlock(): string {
  const rows = NEET_HISTORY.map((y) => {
    const ladder = y.rank_ladder.map((r) => `${r.marks}=>AIR${r.air}`).join(", ");
    return `- ${y.year} (${y.toughness}, top10% avg ${y.avg_marks_top_10pct}/720, general cutoff ${y.general_cutoff_marks}): ${y.notes} | Rank ladder: ${ladder}`;
  }).join("\n");
  return `NEET-UG historical reference (2019-2025):\n${rows}\n\nUse this to (a) calibrate difficulty of Neet Buddy mock scores vs real NEET, (b) map predicted marks to an AIR band using the ladder points and interpolate between years, (c) weight recent years more.`;
}
