import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: false,
  // NEXT_DIST_DIR lets CI run an isolated `next build` verification without
  // clobbering the .next directory of a concurrently running dev server
  // (unset in normal dev/production → the standard ".next" is used).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
