import { useEffect, useRef, useState } from "react";

export function TitrationSim() {
  const [drops, setDrops] = useState(0); // mL NaOH added
  const [running, setRunning] = useState(false);
  const raf = useRef<number | undefined>(undefined);

  const endpoint = 25;
  const ph = drops < endpoint ? 1 + (drops / endpoint) * 5 : drops === endpoint ? 7 : 7 + Math.min((drops - endpoint) * 0.5, 6);
  const pink = drops >= endpoint;
  const color = pink ? "rgba(244, 114, 182, 0.7)" : "rgba(186, 230, 253, 0.5)";

  useEffect(() => {
    if (!running) return;
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      const dt = (now - last) / 1000; last = now;
      setDrops((d) => Math.min(d + dt * 4, 40));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [running]);

  const fillH = 80 - Math.min(drops, 40) * 1.5; // burette emptying
  const flaskFill = 100 + drops * 0.5;

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-sky-50 to-white">
        <svg viewBox="0 0 400 340" className="w-full">
          {/* Stand */}
          <rect x="40" y="20" width="6" height="280" fill="#475569" />
          <rect x="20" y="295" width="120" height="10" fill="#334155" />
          <line x1="46" y1="40" x2="200" y2="40" stroke="#475569" strokeWidth="4" />
          {/* Burette */}
          <rect x="190" y="30" width="20" height="120" rx="2" fill="white" stroke="#1e293b" strokeWidth="2" />
          <rect x="192" y={32 + (80 - fillH)} width="16" height={fillH + 38} fill="rgba(59,130,246,0.25)" />
          <polygon points="195,150 205,150 200,165" fill="#1e293b" />
          {/* Drop */}
          {running && drops < 40 && <circle cx="200" cy={175 + ((Date.now() / 50) % 20)} r="3" fill="rgba(59,130,246,0.7)" />}
          {/* Flask */}
          <path d="M170,200 L230,200 L260,300 L140,300 Z" fill="white" stroke="#1e293b" strokeWidth="2" />
          <path d={`M170,${300 - flaskFill * 0.6} L230,${300 - flaskFill * 0.6} L260,300 L140,300 Z`} fill={color} />
          <text x="200" y="285" textAnchor="middle" fontSize="11" fill="#1e293b" fontWeight="700">HCl + indicator</text>

          {/* pH meter */}
          <rect x="290" y="60" width="90" height="180" rx="8" fill="white" stroke="#1e293b" strokeWidth="2" />
          <text x="335" y="80" textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="700">pH</text>
          <text x="335" y="130" textAnchor="middle" fontSize="34" fill="#1d4ed8" fontWeight="800" fontFamily="monospace">{ph.toFixed(1)}</text>
          <text x="335" y="160" textAnchor="middle" fontSize="11" fill={ph < 7 ? "#dc2626" : ph > 7 ? "#1d4ed8" : "#16a34a"} fontWeight="700">
            {ph < 7 ? "Acidic" : ph > 7 ? "Basic" : "Neutral"}
          </text>
          <text x="335" y="200" textAnchor="middle" fontSize="10" fill="#64748b">NaOH added</text>
          <text x="335" y="220" textAnchor="middle" fontSize="14" fill="#1e293b" fontWeight="700" fontFamily="monospace">{drops.toFixed(1)} mL</text>
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => setRunning((r) => !r)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {running ? "Pause titration" : "Start titration"}
        </button>
        <button onClick={() => { setDrops(0); setRunning(false); }} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">Reset</button>
        {pink && <span className="self-center text-sm font-semibold text-pink-600">Endpoint reached — indicator turned pink!</span>}
      </div>
    </div>
  );
}

export function CombustionSim() {
  const [t, setT] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      const dt = (now - last) / 1000; last = now;
      setT((p) => (p + dt * 0.4) % 1);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  // Reactants slide right, products slide out
  const lx = 80 + t * 80;
  const rx = 320 - t * 80;
  const opacityIn = 1 - t;
  const opacityOut = t;

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-sky-50 to-white">
        <svg viewBox="0 0 500 260" className="w-full">
          {/* Reaction arrow */}
          <line x1="220" y1="130" x2="290" y2="130" stroke="#1e293b" strokeWidth="2" />
          <polygon points="290,124 290,136 300,130" fill="#1e293b" />
          <text x="255" y="120" textAnchor="middle" fontSize="11" fill="#475569">spark</text>

          {/* CH4 */}
          <g opacity={opacityIn} transform={`translate(${lx}, 130)`}>
            <circle cx="0" cy="0" r="20" fill="#1e293b" />
            <circle cx="-22" cy="-12" r="10" fill="#e2e8f0" />
            <circle cx="22" cy="-12" r="10" fill="#e2e8f0" />
            <circle cx="-22" cy="12" r="10" fill="#e2e8f0" />
            <circle cx="22" cy="12" r="10" fill="#e2e8f0" />
            <text y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">CH₄</text>
          </g>
          {/* 2 O2 */}
          <g opacity={opacityIn} transform={`translate(${lx + 60}, 90)`}>
            <circle cx="-10" cy="0" r="14" fill="#dc2626" />
            <circle cx="10" cy="0" r="14" fill="#dc2626" />
            <text y="32" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">O₂</text>
          </g>
          <g opacity={opacityIn} transform={`translate(${lx + 60}, 175)`}>
            <circle cx="-10" cy="0" r="14" fill="#dc2626" />
            <circle cx="10" cy="0" r="14" fill="#dc2626" />
            <text y="32" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">O₂</text>
          </g>

          {/* CO2 */}
          <g opacity={opacityOut} transform={`translate(${rx}, 90)`}>
            <circle cx="-22" cy="0" r="13" fill="#dc2626" />
            <circle cx="0" cy="0" r="16" fill="#1e293b" />
            <circle cx="22" cy="0" r="13" fill="#dc2626" />
            <text y="34" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1e293b">CO₂</text>
          </g>
          {/* 2 H2O */}
          <g opacity={opacityOut} transform={`translate(${rx + 20}, 170)`}>
            <circle cx="-14" cy="-4" r="9" fill="#e2e8f0" />
            <circle cx="0" cy="0" r="13" fill="#dc2626" />
            <circle cx="14" cy="-4" r="9" fill="#e2e8f0" />
            <text y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e293b">H₂O</text>
          </g>
          <g opacity={opacityOut} transform={`translate(${rx + 70}, 200)`}>
            <circle cx="-14" cy="-4" r="9" fill="#e2e8f0" />
            <circle cx="0" cy="0" r="13" fill="#dc2626" />
            <circle cx="14" cy="-4" r="9" fill="#e2e8f0" />
            <text y="28" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1e293b">H₂O</text>
          </g>

          {/* Flame */}
          {t > 0.3 && t < 0.85 && (
            <g transform="translate(255,130)">
              <circle cx="0" cy="0" r={10 + (t * 10) % 5} fill="rgba(251,146,60,0.7)" />
              <circle cx="0" cy="0" r={6} fill="rgba(254,240,138,0.9)" />
            </g>
          )}
        </svg>
      </div>
      <div className="mt-4 rounded-xl bg-brand-soft p-4">
        <div className="text-center font-mono text-sm font-bold text-brand-deep sm:text-base">
          CH₄ + 2 O₂ → CO₂ + 2 H₂O + heat
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">Methane combusts in oxygen — a highly exothermic reaction releasing ~890 kJ/mol.</p>
      </div>
    </div>
  );
}

export function ElectrolysisSim() {
  const [on, setOn] = useState(false);
  const [t, setT] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!on) return;
    let last = 0;
    const step = (now: number) => {
      if (!last) last = now;
      const dt = (now - last) / 1000; last = now;
      setT((p) => p + dt);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [on]);

  const h2 = Math.min(t * 8, 80);
  const o2 = Math.min(t * 4, 80);

  return (
    <div className="p-5">
      <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-sky-50 to-white">
        <svg viewBox="0 0 400 340" className="w-full">
          {/* Beaker */}
          <path d="M60,90 L60,300 L340,300 L340,90" fill="none" stroke="#1e293b" strokeWidth="3" />
          <rect x="60" y="160" width="280" height="140" fill="rgba(186,230,253,0.5)" />
          {/* Tubes */}
          <rect x="130" y="60" width="40" height="160" fill="rgba(255,255,255,0.6)" stroke="#1e293b" strokeWidth="2" />
          <rect x="230" y="60" width="40" height="160" fill="rgba(255,255,255,0.6)" stroke="#1e293b" strokeWidth="2" />
          {/* Gas */}
          <rect x="132" y={62 + (80 - h2)} width="36" height={h2} fill="rgba(96,165,250,0.6)" />
          <rect x="232" y={62 + (80 - o2)} width="36" height={o2} fill="rgba(220,38,38,0.5)" />
          <text x="150" y="50" textAnchor="middle" fontSize="13" fontWeight="700" fill="#1d4ed8">H₂</text>
          <text x="250" y="50" textAnchor="middle" fontSize="13" fontWeight="700" fill="#dc2626">O₂</text>
          {/* Electrodes */}
          <rect x="146" y="180" width="8" height="110" fill="#1e293b" />
          <rect x="246" y="180" width="8" height="110" fill="#1e293b" />
          {/* Battery */}
          <rect x="160" y="305" width="80" height="25" rx="3" fill="#1e293b" />
          <text x="200" y="322" textAnchor="middle" fontSize="14" fill="white" fontWeight="700">{on ? "9 V" : "OFF"}</text>
          <line x1="150" y1="290" x2="180" y2="305" stroke="#1e293b" strokeWidth="2" />
          <line x1="250" y1="290" x2="220" y2="305" stroke="#1e293b" strokeWidth="2" />
          <text x="150" y="305" textAnchor="middle" fontSize="11" fill="#dc2626" fontWeight="700">–</text>
          <text x="250" y="305" textAnchor="middle" fontSize="11" fill="#dc2626" fontWeight="700">+</text>

          {/* Bubbles */}
          {on && [0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx={150 + ((i * 7 + t * 30) % 14) - 7} cy={280 - ((t * 60 + i * 30) % 120)} r="3" fill="rgba(96,165,250,0.7)" />
              <circle cx={250 + ((i * 7 + t * 30) % 14) - 7} cy={280 - ((t * 60 + i * 40) % 120)} r="3" fill="rgba(220,38,38,0.6)" />
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setOn((o) => !o)} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          {on ? "Turn off" : "Turn on current"}
        </button>
        <button onClick={() => { setT(0); setOn(false); }} className="rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-brand-deep">Reset</button>
        <div className="ml-auto font-mono text-xs text-brand-deep sm:text-sm">2 H₂O → 2 H₂ + O₂ &nbsp;·&nbsp; ratio 2 : 1</div>
      </div>
    </div>
  );
}
