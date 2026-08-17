import { useEffect, useRef } from "react";

/**
 * TikZ rendering via TikZJax (CDN).
 * Usage: <Tikz>{`\\begin{tikzpicture}\\draw (0,0) circle (1);\\end{tikzpicture}`}</Tikz>
 *
 * TikZJax is loaded once and processes any <script type="text/tikz"> blocks
 * on the page. We re-trigger processing whenever a Tikz block mounts.
 */
let tikzLoaded: Promise<void> | null = null;

function loadTikzJax(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (tikzLoaded) return tikzLoaded;
  tikzLoaded = new Promise<void>((resolve) => {
    // Stylesheet for fonts
    if (!document.querySelector('link[data-tikzjax]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://tikzjax.com/v1/fonts.css";
      link.setAttribute("data-tikzjax", "1");
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-tikzjax]')) {
      const s = document.createElement("script");
      s.src = "https://tikzjax.com/v1/tikzjax.js";
      s.async = true;
      s.setAttribute("data-tikzjax", "1");
      s.onload = () => resolve();
      document.head.appendChild(s);
    } else {
      resolve();
    }
  });
  return tikzLoaded;
}

export function Tikz({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTikzJax().then(() => {
      if (cancelled || !ref.current) return;
      // Replace contents with a fresh <script type="text/tikz"> so TikZJax processes it.
      const host = ref.current;
      host.innerHTML = "";
      const s = document.createElement("script");
      s.type = "text/tikz";
      s.text = children;
      host.appendChild(s);
      // TikZJax exposes a process function on window when loaded.
      const w = window as unknown as { process_tikz?: (el: Element) => void };
      try { w.process_tikz?.(s); } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [children]);

  return <span ref={ref} className="tikz-host inline-block align-middle" />;
}

