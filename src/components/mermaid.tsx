import { useEffect, useId, useRef, useState } from "react";

/**
 * Mermaid diagram via CDN (mermaid v10). Renders the diagram client-side.
 * Usage: <Mermaid>{`flowchart LR; A-->B`}</Mermaid>
 */
let mermaidPromise: Promise<any> | null = null;

function loadMermaid(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (mermaidPromise) return mermaidPromise;
  mermaidPromise = new Promise((resolve) => {
    const existing = (window as any).mermaid;
    if (existing) {
      existing.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      resolve(existing);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    s.async = true;
    s.onload = () => {
      const m = (window as any).mermaid;
      try { m.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" }); } catch {}
      resolve(m);
    };
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return mermaidPromise;
}

export function Mermaid({ children }: { children: string }) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMermaid().then(async (m) => {
      if (cancelled || !ref.current || !m) return;
      try {
        const { svg } = await m.render("mmd-" + id, children);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e: any) {
        setErr(String(e?.message || e));
      }
    });
    return () => { cancelled = true; };
  }, [children, id]);

  if (err) return <pre className="text-xs text-destructive">{err}</pre>;
  return <div ref={ref} className="mermaid-host flex justify-center" />;
}
