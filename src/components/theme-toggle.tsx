"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Header theme toggle — flips between light and dark explicitly.
 *
 * Hydration-safe by construction: BOTH icons are always rendered and
 * visibility is decided purely in CSS (`.dark` descendant selectors via
 * Tailwind's dark: variant). Server and client markup are identical, so
 * there is no mounted-state placeholder and no mismatch — the resolved
 * theme is only read inside the click handler.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title="Toggle light / dark"
      className={`flex h-8 w-8 shrink-0 items-center justify-center border border-zinc-300 text-zinc-600 transition-[border-color,color,box-shadow] duration-200 hover:border-zinc-400 hover:text-zinc-950 hover:ring-1 hover:ring-zinc-950/10 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100 dark:hover:ring-zinc-100/10 ${className}`}
    >
      {/* sun shows in dark (invites light) / moon shows in light (invites dark) */}
      <Sun className="hidden h-3.5 w-3.5 dark:block" aria-hidden />
      <Moon className="h-3.5 w-3.5 dark:hidden" aria-hidden />
    </button>
  );
}
