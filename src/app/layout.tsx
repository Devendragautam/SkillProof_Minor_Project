import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

// Fonts are SELF-HOSTED (latin subset woff2 in ./fonts, committed to the
// repo). next/font/google fetched these files from fonts.gstatic.com during
// every production build, which hard-failed on network-restricted deploy
// containers (e.g. Z.ai space deploys). next/font/local copies the committed
// files at build time — fully offline-safe, same CSS variables, same look.
const fraunces = localFont({
  src: [
    { path: "./fonts/fraunces-latin.woff2", style: "normal", weight: "100 900" },
    { path: "./fonts/fraunces-latin-italic.woff2", style: "italic", weight: "100 900" },
  ],
  variable: "--font-fraunces",
  display: "swap",
});

const archivo = localFont({
  src: [{ path: "./fonts/archivo-latin.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-400.woff2", style: "normal", weight: "400" },
    { path: "./fonts/ibm-plex-mono-500.woff2", style: "normal", weight: "500" },
    { path: "./fonts/ibm-plex-mono-600.woff2", style: "normal", weight: "600" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SkillProof — evidence-based skill verification for technical hiring",
  description:
    "SkillProof converts resumes into personalized practical assessments and verifies claimed skills through live coding, behavior analysis, and solution explanations.",
  keywords: ["skill verification", "technical hiring", "coding assessment", "recruiting"],
  authors: [{ name: "SkillProof" }],
  icons: {
    icon: "data:image/svg+xml," + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#222c22"/><path d="M16 5.5l8.5 3.2v7c0 5.6-3.7 9.4-8.5 11.3-4.8-1.9-8.5-5.7-8.5-11.3v-7l8.5-3.2z" fill="none" stroke="#faf7f0" stroke-width="1.8"/><path d="M12.5 16l2.4 2.4 4.6-5" stroke="#a9c29b" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    ),
  },
  openGraph: {
    title: "SkillProof",
    description: "Verify what candidates can actually do — not just what their resumes claim.",
    type: "website",
  },
};

/* Browser chrome follows the active sheet (editorial paper / editorial night). */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f6f1" },
    { media: "(prefers-color-scheme: dark)", color: "#211f1a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${archivo.variable} ${plexMono.variable} antialiased bg-background text-foreground min-h-screen flex flex-col font-sans`}
      >
        <ThemeProvider>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
