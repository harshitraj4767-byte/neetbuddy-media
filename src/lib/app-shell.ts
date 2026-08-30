// Detects the packaged app shell (Capacitor native build or an installed PWA).
// The marketing landing page is web-only: inside the app shell users go straight
// to /dashboard when signed in, or /login when they are not.
export function isAppShell(): boolean {
  if (typeof window === "undefined") return false;

  try {
    // Capacitor is only present in the native Android/iOS build.
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
  } catch {
    // ignore — fall through to the PWA checks
  }

  try {
    if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  } catch {
    // ignore
  }

  // iOS Safari home-screen apps
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}
