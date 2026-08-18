import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/hooks/use-theme";
import { Toaster } from "@/components/ui/sonner";
import { OnboardingTour } from "@/components/onboarding-tour";
import { SupportWidget } from "@/components/support-widget";
import { AppVersionGate } from "@/components/app-version-gate";
import { PremiumGate } from "@/components/premium-gate";
import { BottomNav } from "@/components/bottom-nav";
import { MaintenanceNotice } from "@/components/maintenance-notice";
import { getPublicSupabaseConfig } from "@/integrations/supabase/config";

const THEME_INIT = `(function(){try{var t=localStorage.getItem('neetiq-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-gradient-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-elegant transition-opacity hover:opacity-95"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-95"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Neet Buddy — AI-powered NEET prep" },
      { name: "description", content: "Study Hub Pro is a comprehensive learning platform for students, offering quizzes, study materials, and subject-specific content." },
      { name: "author", content: "SΛNSKΛƦ" },
      { name: "theme-color", content: "#1d4ed8" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Neet Buddy" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "Neet Buddy — AI-powered NEET prep" },
      { property: "og:description", content: "Study Hub Pro is a comprehensive learning platform for students, offering quizzes, study materials, and subject-specific content." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Neet Buddy — AI-powered NEET prep" },
      { name: "twitter:description", content: "Study Hub Pro is a comprehensive learning platform for students, offering quizzes, study materials, and subject-specific content." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ff1159ea-7337-4c6c-b75e-0241f4cd397e/id-preview-856d2dab--dd43b3ce-7417-4547-ba37-596e7ba50ec5.lovable.app-1784609216021.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/ff1159ea-7337-4c6c-b75e-0241f4cd397e/id-preview-856d2dab--dd43b3ce-7417-4547-ba37-596e7ba50ec5.lovable.app-1784609216021.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/x-icon", sizes: "32x32", href: "/favicon.ico" },
      { rel: "icon", type: "image/x-icon", sizes: "192x192", href: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const supabaseConfig = getPublicSupabaseConfig();
  const supabaseConfigInit = `globalThis.__APP_SUPABASE_CONFIG__=${JSON.stringify(supabaseConfig)};`;

  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: supabaseConfigInit }} />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-center" />
          <OnboardingTour />
          <SupportWidget />
          <AppVersionGate />
          <PremiumGate />
          <MaintenanceNotice />
          <BottomNav />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
