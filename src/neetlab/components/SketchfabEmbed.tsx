import { Link } from "@tanstack/react-router";
import type { SketchfabModel } from "../data/models";

interface Props {
  model: SketchfabModel;
  /** Auto-spin the model on load. */
  autospin?: boolean;
  /** Auto-start the model's built-in animation if any. */
  autostart?: boolean;
}

/**
 * Sketchfab official iframe embed. Public Sketchfab models permit
 * third-party embedding per Sketchfab's Terms of Service; the iframe
 * itself surfaces the author name and CC license badge. We additionally
 * show an attribution footer to fully satisfy CC-BY requirements.
 */
export function SketchfabEmbed({ model, autospin = true, autostart = true }: Props) {
  const params = new URLSearchParams({
    autostart: autostart ? "1" : "0",
    autospin: autospin ? "0.4" : "0",
    preload: "1",
    ui_theme: "dark",
    ui_infos: "0",
    ui_inspector: "0",
    ui_stop: "0",
    ui_watermark_link: "1",
    ui_watermark: "1",
    transparent: "0",
  });
  const src = `https://sketchfab.com/models/${model.uid}/embed?${params.toString()}`;

  return (
    <div className="flex flex-col">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[oklch(0.22_0.05_260)]">
        <iframe
          title={model.title}
          src={src}
          allow="autoplay; fullscreen; xr-spatial-tracking"
          allowFullScreen
          className="h-full w-full border-0"
          loading="lazy"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border bg-card px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <a
            href={model.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-deep hover:underline"
          >
            {model.title}
          </a>{" "}
          by{" "}
          <a
            href={model.authorUrl ?? model.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-deep hover:underline"
          >
            {model.author}
          </a>{" "}
          on Sketchfab
        </span>
        <span className="flex items-center gap-2">
          <a
            href={model.licenseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-deep hover:underline"
          >
            {model.license}
          </a>
          <Link to="/terms" className="hover:underline">
            Licenses
          </Link>
        </span>
      </div>
    </div>
  );
}
