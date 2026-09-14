import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function PageShell({
  eyebrow,
  title,
  description,
  children,
  showFooter = false,
  fluid = true,
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  showFooter?: boolean;
  fluid?: boolean;
}) {
  const hasHeader = !!(eyebrow || title || description);
  return (
    <div className="page-shell flex min-h-screen flex-col bg-background page-enter">
      <SiteHeader />
      <main className="flex-1">
        <div className={`mx-auto px-4 py-8 sm:px-6 sm:py-10 lg:px-8 ${fluid ? "w-full max-w-[1536px]" : "max-w-7xl"}`}>
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
          <div className={hasHeader ? "mt-8" : ""}>{children}</div>
        </div>
      </main>
      {showFooter && <SiteFooter />}
    </div>
  );
}

export function ComingSoonCard({ note }: { note?: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-border bg-gradient-surface p-10 text-center">
      <p className="text-sm text-muted-foreground">{note || "Feature arriving soon."}</p>
    </div>
  );
}
