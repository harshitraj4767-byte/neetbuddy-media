import { useEffect, useRef, useState } from "react";

function useTime(running: boolean, speed = 1) {
  const [t, setT] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!running) return;
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      const dt = ((now - last) / 1000) * speed; last = now;
      setT((p) => p + dt);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [running, speed]);
  return [t, setT] as const;
}

/* ============================ DNA DOUBLE HELIX (rebuilt) ============================
 * A real animated double-helix: two sine-curve backbones with colour-coded base
 * pairs and a depth shading to suggest 3D rotation.
 */
export function DNAHelixAnim() {
  const [running, setRunning] = useState(true);
  const [t] = useTime(running, 0.5);
  const W = 520, H = 320, midY = H / 2;
  const N = 24;
  const amp = 70;
  const wavelength = W - 40;

  const bases = ["A","T","G","C","T","A","C","G","A","T","G","C","T","A","C","G","A","T","C","G","T","A","G","C"];
  const comp: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  const colors: Record<string, string> = { A: "#22c55e", T: "#ef4444", G: "#3b82f6", C: "#f59e0b" };

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-slate-50 to-white">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* Base pairs */}
          {Array.from({ length: N }).map((_, i) => {
            const x = 20 + (i / (N - 1)) * wavelength;
            const phase = (i / N) * Math.PI * 4 + t * 2;
            const y1 = midY + Math.sin(phase) * amp;
            const y2 = midY + Math.sin(phase + Math.PI) * amp;
            const depth = (Math.sin(phase) + 1) / 2;       // 0..1 for backbone 1
            const b = bases[i];
            return (
              <g key={i}>
                <line x1={x} y1={y1} x2={x} y2={y2}
                      stroke={colors[b]} strokeWidth={2.2}
                      opacity={0.35 + depth * 0.5} />
                <circle cx={x} cy={y1} r={6 - depth * 1.5} fill={colors[b]} opacity={0.5 + depth * 0.5} />
                <circle cx={x} cy={y2} r={4.5 + depth * 1.5} fill={colors[comp[b]]} opacity={0.5 + (1 - depth) * 0.5} />
              </g>
            );
          })}
          {/* Backbones — drawn as smooth sine paths */}
          {[0, Math.PI].map((shift, idx) => {
            const pts: string[] = [];
            for (let i = 0; i <= 100; i++) {
              const x = 20 + (i / 100) * wavelength;
              const phase = (i / 100) * Math.PI * 4 + t * 2 + shift;
              const y = midY + Math.sin(phase) * amp;
              pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
            }
            return <path key={idx} d={pts.join(" ")} fill="none"
                          stroke={idx === 0 ? "#1d4ed8" : "#0ea5e9"}
                          strokeWidth={4} strokeLinecap="round" />;
          })}
          {/* Legend */}
          <g transform="translate(20 290)" fontSize="11">
            {Object.entries(colors).map(([b, c], i) => (
              <g key={b} transform={`translate(${i * 70} 0)`}>
                <rect width="14" height="14" rx="2" fill={c} />
                <text x="20" y="11" fill="#1e293b" fontWeight="600">{b} ↔ {comp[b]}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="mt-4 rounded-xl bg-brand-soft p-4 text-sm text-ink/85">
        Two antiparallel sugar–phosphate backbones twist into a right-handed helix.
        Base pairs (A=T with 2 H-bonds, G≡C with 3) sit on the inside — 10 bp per turn,
        pitch 3.4 nm.
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={() => setRunning((r) => !r)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
      </div>
    </div>
  );
}

/* ============================ DNA Replication (rebuilt) ============================
 * Now shows leading + lagging strand, Okazaki fragments, helicase + polymerase,
 * with a more legible "Y" replication fork that progresses left → right.
 */
export function DNAReplicationAnim() {
  const [running, setRunning] = useState(true);
  const [t, setT] = useTime(running, 0.35);
  const W = 600, H = 320, midY = 160;
  const N = 22;
  const bases = "ATGCTACGATGCTACGATCGTA".split("");
  const comp: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
  const colors: Record<string, string> = { A: "#22c55e", T: "#ef4444", G: "#3b82f6", C: "#f59e0b" };

  const progress = ((t * 0.35) % 1.2 > 1 ? 1 : (t * 0.35) % 1.2);  // pause at end
  const forkIdx = Math.floor(progress * N);
  const forkX = 30 + forkIdx * 24;

  // Lagging strand fragment count = pulses at each Okazaki segment
  const segLen = 4;
  const okazakiCount = Math.floor((forkIdx) / segLen);

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-slate-50 to-white">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {/* Parental double helix (left of fork) */}
          {Array.from({ length: forkIdx }).map((_, i) => {
            const x = 30 + i * 24;
            const b = bases[i];
            return (
              <g key={"p" + i}>
                <line x1={x} y1={midY - 18} x2={x} y2={midY + 18} stroke={colors[b]} strokeWidth="2" />
                <circle cx={x} cy={midY - 18} r="5" fill={colors[b]} />
                <circle cx={x} cy={midY + 18} r="5" fill={colors[comp[b]]} />
              </g>
            );
          })}
          {/* Parental backbone (unwound part still drawn slim) */}
          <line x1="20" y1={midY - 30} x2={forkX} y2={midY - 30} stroke="#1d4ed8" strokeWidth="3" />
          <line x1="20" y1={midY + 30} x2={forkX} y2={midY + 30} stroke="#0ea5e9" strokeWidth="3" />

          {/* Fork: two strands diverge */}
          {Array.from({ length: N - forkIdx }).map((_, k) => {
            const i = forkIdx + k;
            const x = 30 + i * 24;
            const offset = Math.min(k * 5 + 20, 60);
            const b = bases[i];
            return (
              <g key={"f" + i}>
                {/* top template strand */}
                <circle cx={x} cy={midY - 30 - offset * 0.45} r="5" fill={colors[b]} />
                {/* bottom template strand */}
                <circle cx={x} cy={midY + 30 + offset * 0.45} r="5" fill={colors[comp[b]]} />
              </g>
            );
          })}
          {/* Diverging template backbones */}
          <path d={`M${forkX},${midY - 30} Q${(forkX + W) / 2},${midY - 95} ${W - 20},${midY - 85}`}
                fill="none" stroke="#1d4ed8" strokeWidth="3" />
          <path d={`M${forkX},${midY + 30} Q${(forkX + W) / 2},${midY + 95} ${W - 20},${midY + 85}`}
                fill="none" stroke="#0ea5e9" strokeWidth="3" />

          {/* Newly-synthesised leading strand (continuous, follows top template) */}
          <path d={`M30,${midY - 18} L${forkX - 6},${midY - 18}`}
                stroke="#16a34a" strokeWidth="5" strokeLinecap="round" />
          <text x="35" y={midY - 40} fontSize="11" fill="#15803d" fontWeight="700">leading strand 5′→3′</text>

          {/* Lagging strand — drawn as Okazaki fragments */}
          {Array.from({ length: okazakiCount }).map((_, j) => {
            const xStart = 30 + (j * segLen) * 24;
            const xEnd = 30 + Math.min((j + 1) * segLen, forkIdx) * 24 - 6;
            return (
              <g key={"ok" + j}>
                <path d={`M${xStart},${midY + 18} L${xEnd},${midY + 18}`}
                      stroke="#a855f7" strokeWidth="5" strokeLinecap="round" />
              </g>
            );
          })}
          <text x="35" y={midY + 50} fontSize="11" fill="#7e22ce" fontWeight="700">lagging strand — Okazaki fragments (DNA ligase joins them)</text>

          {/* Helicase at the fork */}
          <g transform={`translate(${forkX} ${midY})`}>
            <circle r="22" fill="#fbbf24" stroke="#92400e" strokeWidth="2" />
            <text textAnchor="middle" dy="4" fontSize="10" fontWeight="700" fill="#7c2d12">Helicase</text>
          </g>
          {/* Pol III on leading strand */}
          <g transform={`translate(${forkX - 25} ${midY - 18})`}>
            <rect x="-22" y="-12" width="44" height="24" rx="6" fill="#16a34a" stroke="#14532d" strokeWidth="2" />
            <text textAnchor="middle" dy="4" fontSize="9" fontWeight="700" fill="white">Pol III</text>
          </g>
          {/* Pol III on lagging strand */}
          <g transform={`translate(${forkX - 25} ${midY + 18})`}>
            <rect x="-22" y="-12" width="44" height="24" rx="6" fill="#a855f7" stroke="#581c87" strokeWidth="2" />
            <text textAnchor="middle" dy="4" fontSize="9" fontWeight="700" fill="white">Pol III</text>
          </g>

          {/* Legend */}
          <g transform="translate(20 290)" fontSize="11">
            {Object.entries(colors).map(([b, c], i) => (
              <g key={b} transform={`translate(${i * 70} 0)`}>
                <rect width="14" height="14" rx="2" fill={c} />
                <text x="20" y="11" fill="#1e293b" fontWeight="600">{b}</text>
              </g>
            ))}
          </g>
        </svg>
      </div>
      <div className="mt-4 rounded-xl bg-brand-soft p-4 text-sm text-ink/80">
        Helicase unzips the parental helix. <strong>DNA polymerase III</strong> reads each template
        5′→3′. The <span className="font-semibold text-green-700">leading strand</span> is synthesised
        continuously; the <span className="font-semibold text-purple-700">lagging strand</span> is
        built backwards in <strong>Okazaki fragments</strong> later joined by DNA ligase.
        Replication is <strong>semiconservative</strong>.
      </div>
      <div className="mt-4 flex gap-3">
        <button onClick={() => setRunning((r) => !r)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
        <button onClick={() => setT(0)} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">Reset</button>
      </div>
    </div>
  );
}

/* ============================ Mitosis (rebuilt) ============================ */
const M_PHASES = [
  { name: "Interphase", desc: "Chromatin loose; each chromosome has been replicated into two sister chromatids." },
  { name: "Prophase",   desc: "Chromosomes condense; nuclear envelope breaks down; centrosomes move apart and spindle forms." },
  { name: "Metaphase",  desc: "Chromosomes line up on the metaphase plate; kinetochore microtubules attached from both poles." },
  { name: "Anaphase",   desc: "Cohesin is cleaved; sister chromatids are pulled to opposite poles." },
  { name: "Telophase",  desc: "Nuclear envelopes reform around each set; chromosomes decondense back to chromatin." },
  { name: "Cytokinesis",desc: "An actin–myosin contractile ring pinches the cytoplasm — two genetically identical daughter cells." },
];

export function MitosisAnim() {
  const [running, setRunning] = useState(true);
  const [t, setT] = useTime(running, 0.35);
  const phase = Math.floor(t) % M_PHASES.length;
  const p = t - Math.floor(t); // 0..1 within phase

  // Three duplicated chromosomes (X-shaped pairs of sister chromatids)
  const chromos = [
    { c: "#dc2626", offY: -32 },
    { c: "#1d4ed8", offY:   0 },
    { c: "#16a34a", offY:  32 },
  ];

  // Cytokinesis split distance
  const split = phase === 5 ? Math.min(p * 70, 70) : 0;

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-slate-50 to-white">
        <svg viewBox="0 0 540 320" className="w-full">
          {/* Cell membrane: single ellipse, or two pulled-apart in cytokinesis */}
          {phase < 5 ? (
            <ellipse cx="270" cy="160" rx="220" ry="120" fill="rgba(186,230,253,0.35)" stroke="#0ea5e9" strokeWidth="2.5" />
          ) : (
            <>
              <ellipse cx={170 - split} cy="160" rx="120" ry="110" fill="rgba(186,230,253,0.35)" stroke="#0ea5e9" strokeWidth="2.5" />
              <ellipse cx={370 + split} cy="160" rx="120" ry="110" fill="rgba(186,230,253,0.35)" stroke="#0ea5e9" strokeWidth="2.5" />
            </>
          )}

          {/* Nuclear envelope (interphase, telophase, cytokinesis) */}
          {(phase === 0 || phase === 4) && (
            <ellipse cx="270" cy="160" rx="110" ry="80" fill="rgba(147,197,253,0.35)" stroke="#1d4ed8" strokeWidth="1.5"
                     strokeDasharray={phase === 4 ? "4 3" : "0"} />
          )}
          {phase === 5 && (
            <>
              <ellipse cx={170 - split} cy="160" rx="65" ry="55" fill="rgba(147,197,253,0.35)" stroke="#1d4ed8" strokeWidth="1.5" />
              <ellipse cx={370 + split} cy="160" rx="65" ry="55" fill="rgba(147,197,253,0.35)" stroke="#1d4ed8" strokeWidth="1.5" />
            </>
          )}

          {/* Spindle apparatus */}
          {phase >= 1 && phase <= 3 && (
            <g stroke="#94a3b8" strokeWidth="1.4">
              {[-1.5, -0.75, 0, 0.75, 1.5].map((k) => (
                <g key={k}>
                  <line x1="60" y1="160" x2="270" y2={160 + k * 30} />
                  <line x1="480" y1="160" x2="270" y2={160 + k * 30} />
                </g>
              ))}
              <circle cx="60"  cy="160" r="7" fill="#475569" />
              <circle cx="480" cy="160" r="7" fill="#475569" />
            </g>
          )}

          {/* Chromosomes per phase */}
          {chromos.map((ch, i) => {
            const y = 160 + ch.offY;
            if (phase === 0) {
              // Chromatin: wavy thin lines
              return (
                <path key={i}
                      d={`M${180 + i * 30},${y} q15,8 30,0 t30,0 t30,0 t30,0`}
                      stroke={ch.c} strokeWidth="2.2" fill="none" opacity="0.7" />
              );
            }
            if (phase === 1) {
              // Condensing — X shapes scattered
              const cx = 200 + i * 70 + Math.sin(t * 4 + i) * 6;
              return <ChromoX key={i} cx={cx} cy={y} color={ch.c} />;
            }
            if (phase === 2) {
              // Metaphase plate
              return <ChromoX key={i} cx={270} cy={160 + (i - 1) * 36} color={ch.c} />;
            }
            if (phase === 3) {
              // Anaphase
              const off = p * 160;
              return (
                <g key={i}>
                  <ChromoSingle cx={270 - off} cy={160 + (i - 1) * 36} color={ch.c} />
                  <ChromoSingle cx={270 + off} cy={160 + (i - 1) * 36} color={ch.c} />
                </g>
              );
            }
            // Telophase + Cytokinesis: chromatin re-decondensing in two nuclei
            return (
              <g key={i}>
                <ChromoSingle cx={170 - split} cy={160 + (i - 1) * 22} color={ch.c} />
                <ChromoSingle cx={370 + split} cy={160 + (i - 1) * 22} color={ch.c} />
              </g>
            );
          })}

          {/* Contractile ring during cytokinesis */}
          {phase === 5 && (
            <g stroke="#1e3a8a" strokeWidth="2" fill="none">
              <path d={`M270,${60 + split * 0.4} Q${270 - split * 0.6},160 270,${260 - split * 0.4}`} />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-4 rounded-xl bg-brand-soft p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold text-white">{M_PHASES[phase].name}</span>
          <span className="text-sm text-ink/80">{M_PHASES[phase].desc}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {M_PHASES.map((ph, i) => (
            <button key={ph.name} onClick={() => setT(i + 0.5)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${i === phase ? "border-brand-deep bg-white text-brand-deep" : "border-border bg-white text-ink/70 hover:border-brand-deep"}`}>
              {i + 1}. {ph.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => setRunning((r) => !r)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
        <button onClick={() => setT(0)} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">Reset</button>
      </div>
    </div>
  );
}

/* ============================ Meiosis ============================
 * Highlights: homologous pairing, crossing-over (chiasma), two divisions
 * giving 4 haploid daughter cells with recombined chromatids.
 */
const ME_PHASES = [
  { name: "Prophase I",  desc: "Homologous chromosomes pair (bivalents); crossing-over exchanges segments at chiasmata." },
  { name: "Metaphase I", desc: "Bivalents line up on the equator — homologs face opposite poles (independent assortment)." },
  { name: "Anaphase I",  desc: "Homologous chromosomes separate to opposite poles. Sister chromatids stay together." },
  { name: "Meiosis II",  desc: "Each daughter cell now undergoes mitosis-like division: sister chromatids separate." },
  { name: "Four gametes",desc: "Result: four haploid (n) cells, each genetically unique due to crossing-over + assortment." },
];

export function MeiosisAnim() {
  const [running, setRunning] = useState(true);
  const [t, setT] = useTime(running, 0.3);
  const phase = Math.floor(t) % ME_PHASES.length;
  const p = t - Math.floor(t);

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-slate-50 to-white">
        <svg viewBox="0 0 600 340" className="w-full">
          {phase === 0 && (
            <g>
              <ellipse cx="300" cy="170" rx="220" ry="130" fill="rgba(186,230,253,0.3)" stroke="#0ea5e9" strokeWidth="2" />
              {/* Bivalent: red+blue homologs crossed over */}
              <g transform="translate(300 170)">
                <Bivalent color1="#dc2626" color2="#1d4ed8" wiggle={Math.sin(t * 3)} />
              </g>
              <text x="300" y="310" textAnchor="middle" fontSize="12" fill="#7e22ce" fontWeight="700">Chiasma — segment exchanged ↗</text>
            </g>
          )}
          {phase === 1 && (
            <g>
              <ellipse cx="300" cy="170" rx="220" ry="130" fill="rgba(186,230,253,0.3)" stroke="#0ea5e9" strokeWidth="2" />
              <g transform="translate(300 170)">
                <Bivalent color1="#dc2626" color2="#1d4ed8" wiggle={0} aligned />
              </g>
              <line x1="100" y1="170" x2="500" y2="170" stroke="#94a3b8" strokeDasharray="4 3" />
              <text x="510" y="174" fontSize="10" fill="#64748b">equator</text>
            </g>
          )}
          {phase === 2 && (
            <g>
              <ellipse cx="300" cy="170" rx="220" ry="130" fill="rgba(186,230,253,0.3)" stroke="#0ea5e9" strokeWidth="2" />
              <g transform={`translate(${300 - p * 120} 170)`}>
                <SisterPair color="#dc2626" mixedTip="#1d4ed8" />
              </g>
              <g transform={`translate(${300 + p * 120} 170)`}>
                <SisterPair color="#1d4ed8" mixedTip="#dc2626" />
              </g>
            </g>
          )}
          {phase === 3 && (
            <g>
              {/* Two cells, each splitting like mitosis */}
              {[150, 450].map((cx, idx) => (
                <g key={idx}>
                  <ellipse cx={cx} cy="170" rx="120" ry="100" fill="rgba(186,230,253,0.3)" stroke="#0ea5e9" strokeWidth="2" />
                  <g transform={`translate(${cx - p * 50} 170)`}>
                    <line x1="-6" y1="0" x2="6" y2="0" stroke={idx === 0 ? "#dc2626" : "#1d4ed8"} strokeWidth="6" strokeLinecap="round" />
                  </g>
                  <g transform={`translate(${cx + p * 50} 170)`}>
                    <line x1="-6" y1="0" x2="6" y2="0" stroke={idx === 0 ? "#1d4ed8" : "#dc2626"} strokeWidth="6" strokeLinecap="round" />
                  </g>
                </g>
              ))}
            </g>
          )}
          {phase === 4 && (
            <g>
              {[100, 240, 380, 520].map((cx, idx) => {
                const colors = ["#dc2626", "#1d4ed8", "#1d4ed8", "#dc2626"];
                const tips   = ["#1d4ed8", "#dc2626", "#dc2626", "#1d4ed8"];
                return (
                  <g key={idx}>
                    <ellipse cx={cx} cy="170" rx="55" ry="75" fill="rgba(186,230,253,0.3)" stroke="#0ea5e9" strokeWidth="2" />
                    <line x1={cx - 12} y1="170" x2={cx - 4}  y2="170" stroke={colors[idx]} strokeWidth="6" strokeLinecap="round" />
                    <line x1={cx + 4}  y1="170" x2={cx + 12} y2="170" stroke={tips[idx]}   strokeWidth="6" strokeLinecap="round" />
                    <text x={cx} y="260" textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="700">gamete {idx + 1}</text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      <div className="mt-4 rounded-xl bg-brand-soft p-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="rounded-full bg-brand-deep px-3 py-1 text-xs font-bold text-white">{ME_PHASES[phase].name}</span>
          <span className="text-sm text-ink/80">{ME_PHASES[phase].desc}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {ME_PHASES.map((ph, i) => (
            <button key={ph.name} onClick={() => setT(i + 0.5)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${i === phase ? "border-brand-deep bg-white text-brand-deep" : "border-border bg-white text-ink/70 hover:border-brand-deep"}`}>
              {i + 1}. {ph.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => setRunning((r) => !r)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
        <button onClick={() => setT(0)} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">Reset</button>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function ChromoX({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="7" strokeLinecap="round" fill="none">
      <line x1={cx - 10} y1={cy - 14} x2={cx + 10} y2={cy + 14} />
      <line x1={cx + 10} y1={cy - 14} x2={cx - 10} y2={cy + 14} />
      <circle cx={cx} cy={cy} r="3" fill="#0f172a" stroke="none" />
    </g>
  );
}
function ChromoSingle({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return <line x1={cx - 10} y1={cy} x2={cx + 10} y2={cy} stroke={color} strokeWidth="6" strokeLinecap="round" />;
}
function Bivalent({ color1, color2, wiggle, aligned }: { color1: string; color2: string; wiggle: number; aligned?: boolean }) {
  const w = aligned ? 0 : wiggle * 4;
  return (
    <g strokeWidth="6" strokeLinecap="round" fill="none">
      {/* homolog 1 */}
      <line x1={-30} y1={-30 + w} x2={30} y2={-30 - w} stroke={color1} />
      <line x1={-30} y1={-15 + w} x2={30} y2={-15 - w} stroke={color1} />
      {/* homolog 2 */}
      <line x1={-30} y1={ 15 - w} x2={30} y2={ 15 + w} stroke={color2} />
      <line x1={-30} y1={ 30 - w} x2={30} y2={ 30 + w} stroke={color2} />
      {/* chiasma X swap region — segment swap visible */}
      <line x1={5}  y1={-15} x2={15} y2={ 15} stroke={color2} strokeWidth={4} />
      <line x1={5}  y1={ 15} x2={15} y2={-15} stroke={color1} strokeWidth={4} />
    </g>
  );
}
function SisterPair({ color, mixedTip }: { color: string; mixedTip: string }) {
  return (
    <g strokeWidth="6" strokeLinecap="round" fill="none">
      <line x1={-30} y1={-10} x2={20} y2={-10} stroke={color} />
      <line x1={-30} y1={ 10} x2={20} y2={ 10} stroke={color} />
      {/* recombined tip */}
      <line x1={20}  y1={-10} x2={30} y2={-10} stroke={mixedTip} />
      <line x1={20}  y1={ 10} x2={30} y2={ 10} stroke={mixedTip} />
      <circle cx={-5} cy={0} r="3" fill="#0f172a" />
    </g>
  );
}

/* ============================ Photosynthesis ============================ */
export function PhotosynthesisAnim() {
  const [running, setRunning] = useState(true);
  const [t] = useTime(running, 1);
  // Particles moving in: CO2 from soil/air, H2O from roots; out: O2, glucose
  const particles = [
    { label: "CO₂", from: { x: 50,  y: 80  }, to: { x: 260, y: 170 }, color: "#94a3b8", delay: 0,   inward: true },
    { label: "CO₂", from: { x: 60,  y: 200 }, to: { x: 260, y: 170 }, color: "#94a3b8", delay: 0.6, inward: true },
    { label: "H₂O", from: { x: 60,  y: 280 }, to: { x: 260, y: 170 }, color: "#0ea5e9", delay: 0.3, inward: true },
    { label: "O₂",  from: { x: 280, y: 170 }, to: { x: 470, y: 80  }, color: "#22c55e", delay: 0.9, inward: false },
    { label: "C₆H₁₂O₆", from: { x: 280, y: 170 }, to: { x: 470, y: 240 }, color: "#f59e0b", delay: 1.2, inward: false },
  ];
  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-sky-50 to-green-50">
        <svg viewBox="0 0 520 340" className="w-full">
          {/* Sun */}
          <circle cx="460" cy="50" r="26" fill="#fbbf24" />
          {[...Array(8)].map((_, i) => (
            <line key={i} x1={460 + Math.cos((i * Math.PI) / 4) * 32} y1={50 + Math.sin((i * Math.PI) / 4) * 32}
                  x2={460 + Math.cos((i * Math.PI) / 4) * 44} y2={50 + Math.sin((i * Math.PI) / 4) * 44}
                  stroke="#f59e0b" strokeWidth="3" />
          ))}
          {/* Light rays toward leaf */}
          {[0, 1, 2].map((i) => (
            <line key={i} x1={440 - i * 10} y1={70 + i * 5} x2={300} y2={150}
                  stroke="#facc15" strokeWidth="2" strokeDasharray="6 4" opacity={0.6} />
          ))}
          {/* Leaf (chloroplast view) */}
          <ellipse cx="280" cy="170" rx="60" ry="40" fill="#15803d" stroke="#14532d" strokeWidth="2" />
          {[...Array(5)].map((_, i) => (
            <ellipse key={i} cx={260 + i * 10} cy={170} rx="6" ry="14" fill="#22c55e" opacity="0.6" />
          ))}
          <text x="280" y="220" textAnchor="middle" fontSize="11" fontWeight="700" fill="#14532d">Chloroplast</text>
          {/* Particles */}
          {particles.map((p, i) => {
            const u = ((t - p.delay) % 3) / 2;
            if (u < 0 || u > 1) return null;
            const x = p.from.x + (p.to.x - p.from.x) * u;
            const y = p.from.y + (p.to.y - p.from.y) * u;
            return (
              <g key={i} transform={`translate(${x} ${y})`}>
                <circle r="14" fill={p.color} opacity="0.85" />
                <text textAnchor="middle" dy="3" fontSize="9" fontWeight="700" fill="white">{p.label}</text>
              </g>
            );
          })}
          {/* Equation */}
          <text x="260" y="320" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">
            6 CO₂ + 6 H₂O —(light)→ C₆H₁₂O₆ + 6 O₂
          </text>
        </svg>
      </div>
      <div className="mt-4 rounded-xl bg-brand-soft p-4 text-sm text-ink/80">
        Inside chloroplasts, the <strong>light reactions</strong> (thylakoid membrane) split water and produce ATP + NADPH,
        releasing O₂. The <strong>Calvin cycle</strong> (stroma) fixes CO₂ into glucose using that ATP and NADPH.
      </div>
      <button onClick={() => setRunning((r) => !r)} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
    </div>
  );
}

/* ============================ Blood Cells (RBC / WBC / Platelet) ============================ */
export function BloodCellsAnim() {
  const [running, setRunning] = useState(true);
  const [t] = useTime(running, 1);
  const cells = useMemoCells();
  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border-2 border-red-700 bg-red-50">
        <svg viewBox="0 0 520 240" className="w-full">
          {/* Vessel walls */}
          <rect x="0" y="0" width="520" height="20" fill="#7f1d1d" />
          <rect x="0" y="220" width="520" height="20" fill="#7f1d1d" />
          {cells.map((c, i) => {
            const x = ((c.x + t * c.speed * 60) % 560) - 20;
            const y = c.y + Math.sin(t * 2 + i) * 6;
            if (c.kind === "rbc")
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <ellipse rx="14" ry="10" fill="#dc2626" stroke="#7f1d1d" strokeWidth="1.5" />
                  <ellipse rx="6" ry="4" fill="#991b1b" opacity="0.7" />
                </g>
              );
            if (c.kind === "wbc")
              return (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <circle r="16" fill="#f8fafc" stroke="#1e293b" strokeWidth="1.8" />
                  <circle r="7" cx="-4" cy="-2" fill="#a855f7" opacity="0.85" />
                  <circle r="5" cx="5"  cy="3"  fill="#a855f7" opacity="0.85" />
                </g>
              );
            return (
              <g key={i} transform={`translate(${x} ${y})`}>
                <circle r="5" fill="#fbbf24" stroke="#92400e" strokeWidth="1" />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="font-bold text-red-700">RBC — Erythrocyte</div>
          <div className="text-ink/75">Biconcave, no nucleus, hemoglobin carries O₂. 5 million / µL.</div>
        </div>
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="font-bold text-purple-700">WBC — Leukocyte</div>
          <div className="text-ink/75">Nucleated, fights pathogens (5 types). 4,000–11,000 / µL.</div>
        </div>
        <div className="rounded-lg border border-border bg-white p-3">
          <div className="font-bold text-amber-700">Platelet</div>
          <div className="text-ink/75">Cell fragments, trigger clotting. 150–400 k / µL.</div>
        </div>
      </div>
      <button onClick={() => setRunning((r) => !r)} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{running ? "Pause" : "Play"}</button>
    </div>
  );
}

function useMemoCells() {
  const ref = useRef<{ kind: "rbc" | "wbc" | "plt"; x: number; y: number; speed: number }[] | null>(null);
  if (!ref.current) {
    const arr: { kind: "rbc" | "wbc" | "plt"; x: number; y: number; speed: number }[] = [];
    for (let i = 0; i < 14; i++) arr.push({ kind: "rbc", x: Math.random() * 520, y: 40 + Math.random() * 160, speed: 0.6 + Math.random() * 0.4 });
    for (let i = 0; i < 3; i++)  arr.push({ kind: "wbc", x: Math.random() * 520, y: 60 + Math.random() * 120, speed: 0.4 + Math.random() * 0.3 });
    for (let i = 0; i < 8; i++)  arr.push({ kind: "plt", x: Math.random() * 520, y: 50 + Math.random() * 140, speed: 0.8 + Math.random() * 0.5 });
    ref.current = arr;
  }
  return ref.current;
}
