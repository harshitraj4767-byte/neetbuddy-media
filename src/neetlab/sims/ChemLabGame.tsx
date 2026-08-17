import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
 * ChemLabGame
 *  Gamified reaction lab. The user is shown a target reaction and
 *  three candidate reagent bottles. They DRAG the bottle they think
 *  is right into the flask. Correct → reaction runs with a bubbly
 *  product animation. Wrong → laboratory blast + "Try again".
 * ============================================================ */

interface Reagent {
  id: string;
  formula: string;
  name: string;
  color: string;
}
interface Challenge {
  id: string;
  prompt: string;          // e.g. "Add the reagent to neutralise HCl"
  equation: string;        // displayed equation hint
  beaker: { formula: string; color: string }; // what's already in the flask
  options: Reagent[];      // exactly 3
  correctId: string;
  successText: string;     // explanation shown after success
  failHint: string;        // explanation when wrong
}

const CHALLENGES: Challenge[] = [
  {
    id: "neutralise",
    prompt: "Neutralise hydrochloric acid in the flask",
    equation: "HCl + ? → NaCl + H₂O",
    beaker: { formula: "HCl", color: "rgba(254,202,202,0.55)" },
    options: [
      { id: "naoh",  formula: "NaOH",  name: "Sodium hydroxide",  color: "#60a5fa" },
      { id: "h2so4", formula: "H₂SO₄", name: "Sulfuric acid",     color: "#fb7185" },
      { id: "k",     formula: "K (s)", name: "Potassium metal",   color: "#a855f7" },
    ],
    correctId: "naoh",
    successText: "Strong acid + strong base → neutral salt + water. NaOH was the right pick.",
    failHint:    "Adding another acid won't neutralise HCl, and alkali metals + acids react EXPLOSIVELY — exactly what just happened.",
  },
  {
    id: "precipitate",
    prompt: "Make a white precipitate of silver chloride",
    equation: "AgNO₃ + ? → AgCl↓ + ?",
    beaker: { formula: "AgNO₃ (aq)", color: "rgba(186,230,253,0.45)" },
    options: [
      { id: "nacl", formula: "NaCl",   name: "Sodium chloride",   color: "#cbd5e1" },
      { id: "naoh", formula: "NaOH",   name: "Sodium hydroxide",  color: "#60a5fa" },
      { id: "hno3", formula: "HNO₃",   name: "Nitric acid",       color: "#fde047" },
    ],
    correctId: "nacl",
    successText: "Ag⁺ + Cl⁻ → AgCl, a curdy white precipitate (classic halide test).",
    failHint:    "Without chloride ions you can't make AgCl. NaOH would give brown Ag₂O; HNO₃ does nothing useful here.",
  },
  {
    id: "combust",
    prompt: "Combust methane completely — pick the gas needed",
    equation: "CH₄ + 2 ? → CO₂ + 2 H₂O",
    beaker: { formula: "CH₄ (g)", color: "rgba(226,232,240,0.5)" },
    options: [
      { id: "o2",  formula: "O₂",  name: "Oxygen",        color: "#ef4444" },
      { id: "n2",  formula: "N₂",  name: "Nitrogen",      color: "#94a3b8" },
      { id: "co2", formula: "CO₂", name: "Carbon dioxide", color: "#475569" },
    ],
    correctId: "o2",
    successText: "Complete combustion needs O₂. ΔH ≈ −890 kJ/mol — exothermic and clean.",
    failHint:    "N₂ is inert; CO₂ is already a combustion product. Without oxygen, methane just builds up — and then ignites all at once.",
  },
  {
    id: "esterify",
    prompt: "Make ethyl ethanoate from ethanoic acid (Fischer esterification)",
    equation: "CH₃COOH + ? ⇌ CH₃COOC₂H₅ + H₂O",
    beaker: { formula: "CH₃COOH + H₂SO₄", color: "rgba(254,240,138,0.5)" },
    options: [
      { id: "etoh",  formula: "C₂H₅OH", name: "Ethanol",       color: "#38bdf8" },
      { id: "ch3oh", formula: "CH₃OH",  name: "Methanol",      color: "#22d3ee" },
      { id: "h2o",   formula: "H₂O",    name: "Water",         color: "#93c5fd" },
    ],
    correctId: "etoh",
    successText: "Ethanol's –OH attacks the carbonyl C; water leaves. You get ethyl ethanoate — fruity smell!",
    failHint:    "Methanol would give methyl ethanoate. Adding water just shifts the equilibrium BACKWARDS — and concentrated H₂SO₄ + water releases enough heat to splatter the flask.",
  },
  {
    id: "reduce",
    prompt: "Reduce propanone (a ketone) to propan-2-ol",
    equation: "CH₃COCH₃ + ? → CH₃CH(OH)CH₃",
    beaker: { formula: "CH₃COCH₃", color: "rgba(196,181,253,0.45)" },
    options: [
      { id: "nabh4", formula: "NaBH₄", name: "Sodium borohydride", color: "#22c55e" },
      { id: "kmno4", formula: "KMnO₄", name: "Potassium permanganate", color: "#a855f7" },
      { id: "na",    formula: "Na (s)", name: "Sodium metal",       color: "#f59e0b" },
    ],
    correctId: "nabh4",
    successText: "NaBH₄ delivers a hydride (H⁻) to the carbonyl carbon → 2° alcohol.",
    failHint:    "KMnO₄ is an OXIDISER (opposite reaction). Sodium metal + ketones is extremely violent — boom.",
  },
];

type Status = "idle" | "dragging" | "correct" | "wrong";

export function ChemLabGame() {
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [dragId, setDragId] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const flaskRef = useRef<HTMLDivElement | null>(null);

  const challenge = CHALLENGES[idx];

  // Reshuffle the 3 options each load for replayability
  const order = useMemo(
    () => challenge.options.map((_, i) => i).sort(() => Math.random() - 0.5),
    [idx],
  );

  function attempt(reagentId: string) {
    if (status === "correct" || status === "wrong") return;
    if (reagentId === challenge.correctId) {
      setStatus("correct");
      setScore((s) => ({ ...s, right: s.right + 1 }));
    } else {
      setStatus("wrong");
      setScore((s) => ({ ...s, wrong: s.wrong + 1 }));
    }
  }

  function next() {
    setStatus("idle");
    setDragId(null);
    setIdx((i) => (i + 1) % CHALLENGES.length);
  }
  function retry() {
    setStatus("idle");
    setDragId(null);
  }

  // Auto-clear explosion after a moment so user can read
  useEffect(() => {
    if (status !== "wrong") return;
    const t = setTimeout(() => {}, 2200);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-brand">Lab Challenge</div>
          <h3 className="mt-1 text-lg font-bold text-ink">{challenge.prompt}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          ✅ <span className="font-mono font-bold text-green-700">{score.right}</span>
          &nbsp;·&nbsp; 💥 <span className="font-mono font-bold text-red-600">{score.wrong}</span>
          <span className="ml-3">Round {idx + 1}/{CHALLENGES.length}</span>
        </div>
      </div>

      {/* Equation hint */}
      <div className="mt-4 rounded-xl bg-gradient-to-br from-sky-50 to-white p-4 text-center font-mono text-sm font-semibold text-ink sm:text-base">
        {challenge.equation}
      </div>

      {/* Bench */}
      <div className="mt-5 grid gap-5 md:grid-cols-[1fr_280px]">
        {/* Flask drop zone */}
        <div
          ref={flaskRef}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain") || dragId;
            if (id) attempt(id);
          }}
          className={`relative flex h-[320px] items-end justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
            status === "wrong"
              ? "border-red-400 bg-red-50"
              : status === "correct"
              ? "border-green-400 bg-green-50"
              : "border-brand-deep/30 bg-gradient-to-b from-sky-50 to-white"
          }`}
        >
          {/* Lab bench label */}
          <div className="absolute left-3 top-3 text-[10px] font-bold uppercase tracking-wider text-brand-deep/60">
            Drop reagent into flask ↓
          </div>

          {/* Flask SVG */}
          <FlaskSVG
            liquidLabel={challenge.beaker.formula}
            liquidColor={challenge.beaker.color}
            status={status}
          />

          {/* Explosion overlay */}
          {status === "wrong" && <BoomOverlay />}

          {/* Sparkles on success */}
          {status === "correct" && <SparkleOverlay />}
        </div>

        {/* Reagent shelf */}
        <div className="flex flex-col gap-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-brand-deep/70">Reagent shelf</div>
          {order.map((i) => {
            const r = challenge.options[i];
            const disabled = status === "correct" || status === "wrong";
            return (
              <button
                key={r.id}
                draggable={!disabled}
                onDragStart={(e) => {
                  setDragId(r.id);
                  e.dataTransfer.setData("text/plain", r.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => attempt(r.id)}
                disabled={disabled}
                className={`group flex cursor-grab items-center gap-3 rounded-xl border-2 border-border bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-deep hover:shadow-md active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 ${dragId === r.id ? "ring-2 ring-brand-deep" : ""}`}
                aria-label={`Drag ${r.name} into flask`}
              >
                <BottleSVG color={r.color} />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-bold text-ink">{r.formula}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.name}</div>
                </div>
                <span className="text-xs text-muted-foreground group-hover:text-brand-deep">drag →</span>
              </button>
            );
          })}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Tip: drag a bottle into the flask, or just tap one if you're on mobile.
          </p>
        </div>
      </div>

      {/* Feedback */}
      {status === "correct" && (
        <div className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-green-700">✓ Reaction successful</div>
          <p className="mt-1 text-sm text-ink/85">{challenge.successText}</p>
          <button onClick={next} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Next challenge →
          </button>
        </div>
      )}
      {status === "wrong" && (
        <div className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-red-700">💥 Laboratory blast — boom!</div>
          <p className="mt-1 text-sm text-ink/85"><strong>Try again.</strong> {challenge.failHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={retry} className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white">
              Try again
            </button>
            <button onClick={next} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">
              Skip to next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- visual atoms ---------- */
function FlaskSVG({ liquidLabel, liquidColor, status }: { liquidLabel: string; liquidColor: string; status: Status }) {
  // Boiling/bubbling when correct
  return (
    <svg viewBox="0 0 220 280" className="h-[280px] w-auto">
      {/* Stand */}
      <rect x="20" y="250" width="180" height="10" rx="2" fill="#334155" />
      {/* Flask body (Erlenmeyer) */}
      <path d="M85,60 L135,60 L135,140 L185,240 L35,240 Z" fill="white" stroke="#1e293b" strokeWidth="2.5" />
      {/* Neck rim */}
      <rect x="80" y="50" width="60" height="14" rx="3" fill="#e2e8f0" stroke="#1e293b" strokeWidth="2" />
      {/* Liquid */}
      <path d="M55,200 L165,200 L185,240 L35,240 Z" fill={liquidColor} />
      {/* Liquid label */}
      <text x="110" y="225" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">{liquidLabel}</text>

      {/* Bubbles when reacting */}
      {status === "correct" && (
        <g>
          {[0,1,2,3,4,5].map((i) => (
            <circle
              key={i}
              cx={70 + i * 14}
              cy={210}
              r={3 + (i % 3)}
              fill="rgba(34,197,94,0.55)"
            >
              <animate attributeName="cy" from="220" to="160" dur={`${1 + (i % 3) * 0.3}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" from="0.7" to="0" dur={`${1 + (i % 3) * 0.3}s`} repeatCount="indefinite" />
            </circle>
          ))}
          {/* Steam */}
          <path d="M100,55 q-6,-15 4,-25 q10,10 0,25" fill="none" stroke="#94a3b8" strokeWidth="2" opacity="0.6">
            <animate attributeName="opacity" values="0.2;0.7;0.2" dur="1.5s" repeatCount="indefinite" />
          </path>
        </g>
      )}

      {/* Cracks if blasted */}
      {status === "wrong" && (
        <g stroke="#7f1d1d" strokeWidth="1.5" fill="none" opacity="0.85">
          <path d="M85,150 L100,180 L90,210 L120,230" />
          <path d="M140,160 L130,190 L150,220" />
          <path d="M110,90 L120,120 L100,140" />
        </g>
      )}
    </svg>
  );
}

function BottleSVG({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 60" width="32" height="48" aria-hidden>
      <rect x="14" y="2" width="12" height="8" rx="2" fill="#475569" />
      <path d="M10,12 L30,12 L34,22 L34,55 Q34,58 31,58 L9,58 Q6,58 6,55 L6,22 Z" fill="white" stroke="#1e293b" strokeWidth="1.5" />
      <path d="M8,30 L32,30 L32,55 Q32,57 30,57 L10,57 Q8,57 8,55 Z" fill={color} opacity="0.85" />
      <rect x="11" y="36" width="18" height="12" rx="1.5" fill="white" opacity="0.85" />
    </svg>
  );
}

function BoomOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <svg viewBox="0 0 320 320" className="h-full w-full animate-[boom_0.6s_ease-out]">
        <defs>
          <radialGradient id="boomG">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="40%" stopColor="#f97316" />
            <stop offset="80%" stopColor="#b91c1c" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="120" fill="url(#boomG)">
          <animate attributeName="r" from="40" to="150" dur="0.5s" fill="freeze" />
          <animate attributeName="opacity" from="1" to="0.85" dur="0.5s" fill="freeze" />
        </circle>
        {/* Star spikes */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x = 160 + Math.cos(a) * 130;
          const y = 160 + Math.sin(a) * 130;
          return (
            <line key={i} x1="160" y1="160" x2={x} y2={y} stroke="#fde047" strokeWidth="3" opacity="0.85">
              <animate attributeName="opacity" from="1" to="0" dur="0.6s" fill="freeze" />
            </line>
          );
        })}
        <text x="160" y="170" textAnchor="middle" fontSize="42" fontWeight="900" fill="#7f1d1d" stroke="white" strokeWidth="2" paintOrder="stroke">
          BOOM!
        </text>
      </svg>
      <style>{`
        @keyframes boom { 0% { transform: scale(0.4); opacity: 0; } 30% { opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
    </div>
  );
}

function SparkleOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {Array.from({ length: 14 }).map((_, i) => {
        const left = 10 + Math.random() * 80;
        const delay = Math.random() * 0.8;
        return (
          <span
            key={i}
            className="absolute text-amber-400"
            style={{
              left: `${left}%`,
              top: `${30 + Math.random() * 40}%`,
              animation: `floatUp 1.2s ${delay}s ease-out infinite`,
            }}
          >
            ✦
          </span>
        );
      })}
      <style>{`
        @keyframes floatUp { 0% { transform: translateY(20px); opacity: 0; } 30% { opacity: 1 } 100% { transform: translateY(-60px); opacity: 0; } }
      `}</style>
    </div>
  );
}
