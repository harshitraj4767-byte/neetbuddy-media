import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listActiveBanners, type BannerRow } from "@/lib/banners.functions";

const AUTO_MS = 10_000;

/**
 * Admin-managed banner plot shown directly under the dashboard hero card.
 * Uses the same 8:3 (≈2.67:1) box as the hero, auto-slides every 10s and
 * supports manual arrows, dots and touch swipe.
 */
export function BannerCarousel() {
  const load = useServerFn(listActiveBanners);
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    let alive = true;
    load()
      .then((rows) => { if (alive) setBanners(rows ?? []); })
      .catch(() => { if (alive) setBanners([]); });
    return () => { alive = false; };
  }, []);

  const count = banners.length;
  const go = useCallback((next: number) => {
    if (count === 0) return;
    setIndex(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count < 2) return;
    const t = setInterval(() => {
      if (!paused.current) setIndex((i) => (i + 1) % count);
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [count]);

  if (count === 0) return null;

  return (
    <div
      className="relative mt-4 overflow-hidden rounded-3xl border border-border bg-muted shadow-soft"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; paused.current = true; }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchX.current = null;
        paused.current = false;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="aspect-[8/3] w-full">
        <div
          className="flex h-full w-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {banners.map((b) => {
            const img = (
              <img
                src={b.image_url}
                alt={b.title ?? "Banner"}
                loading="lazy"
                className="h-full w-full select-none object-cover"
              />
            );
            return (
              <div key={b.id} className="h-full w-full shrink-0 grow-0 basis-full">
                {b.link_url ? (
                  <a
                    href={b.link_url}
                    target={b.link_url.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="block h-full w-full"
                  >
                    {img}
                  </a>
                ) : (
                  img
                )}
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => go(index - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => go(index + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/70 p-1.5 text-foreground shadow-sm backdrop-blur transition hover:bg-background"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to banner ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-primary" : "w-1.5 bg-foreground/30"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
