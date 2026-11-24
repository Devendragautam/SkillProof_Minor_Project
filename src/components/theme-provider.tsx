"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Class-strategy theme provider (next-themes).
 * - attribute="class" toggles .dark on <html> — the token sheets in
 *   globals.css are keyed off that class.
 * - defaultTheme="system": first-time visitors follow their OS preference;
 *   the header toggle then pins an explicit choice (persisted to
 *   localStorage by next-themes).
 * - disableTransitionOnChange: kills the transition storm on theme flip so
 *   colors swap in one frame instead of every element fading separately.
 * - suppressHydrationWarning is already on <html> in layout.tsx — required
 *   because next-themes mutates the class before React hydrates.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
