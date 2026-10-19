import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat route streams; keep it on the Node runtime so the Anthropic SDK
  // and `fs` (knowledge-base loading) both work.
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // Hide Next.js's "N" dev badge; the page shows its own Redan "R" badge there.
  devIndicators: false,
  // Make the browser revalidate the HTML document on every visit. The page is a
  // single-page app: its HTML references hashed /_next/static chunks, and those
  // chunks are immutable (Next caches them forever, which is correct). But if
  // the browser also caches the HTML, a returning visitor keeps loading the old
  // chunk hashes and never sees a new deploy — which is how a fixed bug can
  // still look broken in the field. `no-cache` lets the browser keep the HTML
  // but forces a revalidation (a cheap 304 when unchanged), so a new deploy is
  // picked up immediately. Only the document is scoped here, not the assets.
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
