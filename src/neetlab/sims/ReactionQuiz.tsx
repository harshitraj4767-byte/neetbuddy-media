import { useMemo, useState } from "react";

interface Option { formula: string; correct: boolean; why?: string }
interface Reaction {
  id: string;
  name: string;
  category: string;
  equation: string;            // reactants → ?
  conditions?: string;
  options: Option[];
  explanation: string;         // why the correct one is right
}

const REACTIONS: Reaction[] = [
  {
    id: "markov",
    name: "Markovnikov addition of HBr",
    category: "Organic — Electrophilic addition",
    equation: "CH₃–CH=CH₂ + HBr  →  ?",
    options: [
      { formula: "CH₃–CHBr–CH₃", correct: true },
      { formula: "CH₃–CH₂–CH₂Br", correct: false, why: "That would be anti-Markovnikov — only happens with peroxides (Kharasch effect). With pure HBr, H adds to the carbon with more H's, Br goes to the more substituted carbon (forms the more stable 2° carbocation)." },
      { formula: "CH₃–CH=CH–Br", correct: false, why: "HBr does ADDITION across the C=C, not substitution. The double bond breaks; you can't keep it." },
      { formula: "CH₃–CHBr–CH₂Br", correct: false, why: "Only one HBr was added. Two Br would need Br₂ (halogenation), not HBr." },
    ],
    explanation: "Markovnikov's rule: H goes to the C of the alkene already bearing more H's. Mechanism: HBr protonates the π-bond → 2° carbocation (more stable than 1°) → Br⁻ attacks. Product: 2-bromopropane.",
  },
  {
    id: "esterification",
    name: "Fischer esterification",
    category: "Organic — Substitution (acid catalysed)",
    equation: "CH₃COOH + CH₃CH₂OH  ⇌  ?  + H₂O",
    conditions: "conc. H₂SO₄, Δ",
    options: [
      { formula: "CH₃COOCH₂CH₃ (ethyl acetate)", correct: true },
      { formula: "CH₃CH₂COOCH₃ (methyl propanoate)", correct: false, why: "Wrong carbons swapped. The –OH of the acid leaves; the –OR of the alcohol attaches. So acetic acid + ethanol → ethyl acetate, not methyl propanoate." },
      { formula: "CH₃COCH₂CH₃ (a ketone)", correct: false, why: "Esterification keeps the C=O AND adds an –OR. You'd lose the oxygen of the ester linkage to make a ketone — that doesn't happen here." },
      { formula: "CH₃COO⁻ + CH₃CH₂OH₂⁺", correct: false, why: "Those are just protonated/deprotonated reactants, not the product. Water has to leave for the ester to form." },
    ],
    explanation: "Acid catalyst protonates C=O → alcohol attacks → tetrahedral intermediate → water leaves. Acid contributes the acyl group (CH₃CO–), alcohol contributes –OR' (–OCH₂CH₃). Product: ethyl ethanoate.",
  },
  {
    id: "saponification",
    name: "Saponification (alkaline ester hydrolysis)",
    category: "Organic — Nucleophilic acyl substitution",
    equation: "CH₃COOCH₂CH₃ + NaOH  →  ?",
    options: [
      { formula: "CH₃COONa + CH₃CH₂OH", correct: true },
      { formula: "CH₃COOH + CH₃CH₂ONa", correct: false, why: "Under basic conditions the acid (pKa ~5) is deprotonated to the carboxylate. You get the sodium salt of the acid, NOT the free acid." },
      { formula: "CH₃CH₂COONa + CH₃OH", correct: false, why: "You swapped which side carries the carbonyl. The acyl group (CH₃CO–) stays with O⁻; the –OCH₂CH₃ leaves as ethanol." },
      { formula: "Ester unchanged", correct: false, why: "OH⁻ is a strong nucleophile; esters readily hydrolyse under base. The reaction goes to completion (irreversible under base)." },
    ],
    explanation: "OH⁻ attacks the carbonyl carbon → tetrahedral intermediate → –OEt leaves → carboxylic acid is instantly deprotonated by the remaining base to give the carboxylate. Industrial soap-making uses fats + NaOH this way.",
  },
  {
    id: "wurtz",
    name: "Wurtz reaction",
    category: "Organic — Coupling",
    equation: "2 CH₃CH₂Br + 2 Na  →  ?  + 2 NaBr",
    conditions: "dry ether",
    options: [
      { formula: "CH₃CH₂CH₂CH₃ (n-butane)", correct: true },
      { formula: "CH₃CH₂Na", correct: false, why: "That's only the intermediate (an organosodium). It immediately reacts with another R–Br to couple. The isolated product is the alkane." },
      { formula: "CH₃CH=CHCH₃ (an alkene)", correct: false, why: "Wurtz couples two alkyl groups via a C–C single bond. It doesn't make a double bond (no β-elimination here)." },
      { formula: "CH₃CH₃ (ethane)", correct: false, why: "Two ethyl fragments join: 2 × C₂H₅ → C₄H₁₀, not C₂H₆." },
    ],
    explanation: "Sodium removes the halogen to give R–Na, then a second R–Br attacks to form R–R. Best for symmetric alkanes (joining two identical alkyl halides). Two ethyl groups couple → n-butane.",
  },
  {
    id: "sn1tert",
    name: "Hydrolysis of tert-butyl bromide",
    category: "Organic — Substitution mechanism",
    equation: "(CH₃)₃C–Br + H₂O  →  ?  + HBr",
    options: [
      { formula: "(CH₃)₃C–OH via Sₙ1", correct: true },
      { formula: "(CH₃)₃C–OH via Sₙ2", correct: false, why: "A tertiary carbon is too sterically crowded for Sₙ2 (water can't attack the back side). The mechanism switches to Sₙ1: ionise first, then nucleophile attacks the planar carbocation." },
      { formula: "(CH₃)₂C=CH₂ (E1 product)", correct: false, why: "E1 happens with hot strong bases or hot solvents. With cool water as nucleophile, substitution (Sₙ1) dominates over elimination." },
      { formula: "(CH₃)₃C–H (reduction)", correct: false, why: "Water can't reduce a C–Br bond. You'd need a hydride source like LiAlH₄." },
    ],
    explanation: "Tertiary alkyl halides ionise easily because the 3° carbocation is stabilised by three +I (hyperconjugation) methyl groups. Water then attacks the carbocation → after losing a proton → tert-butanol.",
  },
];

export function ReactionQuiz() {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, attempted: 0 });
  const r = REACTIONS[idx];

  const shuffled = useMemo(() => {
    const order = r.options.map((_, i) => i).sort(() => Math.random() - 0.5);
    return order;
    // shuffles per question
  }, [idx]);

  const submit = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    setScore((s) => ({ right: s.right + (r.options[i].correct ? 1 : 0), attempted: s.attempted + 1 }));
  };

  const next = () => {
    setPicked(null);
    setIdx((i) => (i + 1) % REACTIONS.length);
  };

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">{r.category}</div>
          <h3 className="mt-1 text-lg font-bold text-ink">{r.name}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          Score: <span className="font-mono font-bold text-brand-deep">{score.right}</span> / {score.attempted}
          <span className="ml-3">Q {idx + 1} of {REACTIONS.length}</span>
        </div>
      </div>

      <div className="mt-5 rounded-xl bg-gradient-to-br from-sky-50 to-white p-5 text-center">
        <div className="font-mono text-base font-semibold text-ink sm:text-xl">{r.equation}</div>
        {r.conditions && <div className="mt-2 text-xs text-muted-foreground">conditions: {r.conditions}</div>}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {shuffled.map((i) => {
          const opt = r.options[i];
          const isPicked = picked === i;
          const reveal = picked !== null;
          const tone = !reveal
            ? "border-border bg-white hover:border-brand-deep hover:bg-brand-soft/50"
            : opt.correct
            ? "border-green-500 bg-green-50"
            : isPicked
            ? "border-red-500 bg-red-50"
            : "border-border bg-white opacity-60";
          return (
            <button
              key={i}
              onClick={() => submit(i)}
              disabled={picked !== null}
              className={`group rounded-xl border-2 px-4 py-3 text-left transition-all ${tone}`}
            >
              <div className="font-mono text-sm font-semibold text-ink">{opt.formula}</div>
              {reveal && opt.correct && <div className="mt-1 text-xs font-semibold text-green-700">✓ Correct</div>}
              {reveal && isPicked && !opt.correct && (
                <div className="mt-1 text-xs text-red-700"><strong>Why this is wrong:</strong> {opt.why}</div>
              )}
              {reveal && !opt.correct && !isPicked && opt.why && (
                <div className="mt-1 text-[11px] text-muted-foreground">{opt.why}</div>
              )}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="mt-5 rounded-xl border border-brand-deep/20 bg-brand-soft p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-brand">Explanation</div>
          <p className="mt-1 text-sm text-ink/85">{r.explanation}</p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          onClick={next}
          disabled={picked === null}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          Next reaction →
        </button>
        <button onClick={() => { setScore({ right: 0, attempted: 0 }); setIdx(0); setPicked(null); }} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">
          Reset
        </button>
      </div>
    </div>
  );
}
