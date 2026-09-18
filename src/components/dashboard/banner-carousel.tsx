import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listActiveBanners, type BannerRow } from "@/lib/banners.functions";
import { useTheme } from "@/hooks/use-theme";

const AUTO_MS = 10_000;

export function BannerCarousel() {
  const load = useServerFn(listActiveBanners);
  const { theme } = useTheme();
  const [banners, setBanners] = useState<BannerRow[]>([]);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const paused = useRef(false);

  useEffect(() => {
    let alive = true;
    async function fetchBanners() {
      try {
        const res = await fetch("/api/admin.php?action=banners", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          const list = json.banners || json.data;
          if (Array.isArray(list)) {
            const active = list.filter((b: any) => Boolean(b.active ?? true)).map((b: any) => ({
              id: String(b.id),
              title: b.title || null,
              image_url: b.image_url || b.imageUrl,
              image_url_dark: b.image_url_dark || b.imageUrlDark || null,
              link_url: b.link_url || b.linkUrl || null,
              sort_order: Number(b.sort_order ?? 0),
              active: true,
            }));
            if (alive) {
              setBanners(active);
              return;
            }
          }
        }
      } catch {
        // Continue to server function
      }

      try {
        const rows = await load();
        if (alive) {
          setBanners(rows || []);
        }
      } catch {
        if (alive) setBanners([]);
      }
    }

    fetchBanners();
    return () => { alive = false; };
  }, [load]);

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
      <div className="aspect-[16/9] sm:aspect-[2.2/1] lg:aspect-[3/1] xl:aspect-[3.4/1] max-h-[340px] w-full">
        <div
          className="flex h-full w-full transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {banners.map((b, i) => {
            const src = theme === "dark" ? (b.image_url_dark || b.image_url) : b.image_url;
            if (!src) return null;

            const img = (
              <img
                src={src}
                alt={b.title ?? "Banner"}
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
                className="h-full w-full select-none object-cover"
              />
            );
            return (
              <div key={b.id || i} className="h-full w-full shrink-0 grow-0 basis-full">
                {!b.link_url ? (
                  img
                ) : b.link_url.startsWith("/") ? (
                  <Link to={b.link_url} className="block h-full w-full">
                    {img}
                  </Link>
                ) : (
                  <a
                    href={b.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full w-full"
                  >
                    {img}
                  </a>
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
                key={b.id || i}
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
