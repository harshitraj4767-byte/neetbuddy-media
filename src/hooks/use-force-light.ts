import { useEffect } from "react";

/**
 * Exam surfaces (test / quiz / CBT) must always render in light mode — dark
 * mode makes scanned question images and diagrams unreadable. The user's saved
 * theme is untouched and restored as soon as the screen unmounts.
 */
export function useForceLightMode() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    const prevScheme = root.style.colorScheme;
    root.classList.remove("dark");
    root.style.colorScheme = "light";
    return () => {
      if (wasDark) root.classList.add("dark");
      root.style.colorScheme = prevScheme;
    };
  }, []);
}
