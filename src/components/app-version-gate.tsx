import { useEffect, useState } from "react";
import { APP_VERSION } from "@/lib/app-version";

/**
 * Polls the server's deployed version every 60s. When the server reports a
 * different version than the one baked into this bundle, show a blocking
 * modal that forces the user to reload. Fixes "stale cached client" bugs
 * like only seeing 5 questions when the deploy now ships 10.
 */
export function AppVersionGate() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      try {
        const res = await fetch("/api/public/app-version", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { version?: string };
        if (!stop && json?.version && json.version !== APP_VERSION) {
          setStale(true);
        }
      } catch {
        /* ignore network errors */
      }
    };
    check();
    const id = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      stop = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!stale) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <div className="text-base font-semibold">Update available</div>
        <p className="mt-2 text-sm text-muted-foreground">
          A new version of Neet Buddy is live. Please refresh to continue —
          older versions can show wrong question counts and other glitches.
        </p>
        <button
          onClick={() => {
            try {
              if ("caches" in window) {
                caches.keys().then((names) => names.forEach((n) => caches.delete(n)));
              }
            } catch {
              /* noop */
            }
            window.location.reload();
          }}
          className="mt-5 inline-flex items-center justify-center rounded-md bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-elegant"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
