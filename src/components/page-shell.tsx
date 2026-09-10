import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PageShell({
  eyebrow,
  title,
  description,
  children,
  showFooter = false,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  showFooter?: boolean;
}) {
  const hasHeader = !!(eyebrow || title || description);
  return (
    <div className="page-shell flex min-h-screen flex-col bg-background page-enter">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
          {hasHeader && (
            <div className="animate-fade-in-up">
              {eyebrow && (
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  {eyebrow}
                </div>
              )}
              {title && <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>}
              {description && (
                <p className="mt-3 max-w-2xl text-muted-foreground">{description}</p>
              )}
            </div>
          )}
          <div className={hasHeader ? "mt-10" : ""}>{children}</div>
        </div>
      </main>
      {showFooter && <SiteFooter />}
    </div>
  );
}

export function ComingSoonCard({ note }: { note?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-gradient-surface p-10 text-center shadow-soft">
      <div className="mx-auto h-12 w-12 rounded-2xl bg-gradient-primary opacity-90 shadow-glow" />
      <div className="mt-4 text-lg font-semibold">Wiring up next</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {note ?? "This page is part of the Neet Buddy build. Auth, database, and full features land in the next phase."}
      </p>
    </div>
  );
}

// Re-export footer so opt-in pages can place it themselves where appropriate.
export { SiteFooter };
