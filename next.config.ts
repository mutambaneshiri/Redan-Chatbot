import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat route streams; keep it on the Node runtime so the Anthropic SDK
  // and `fs` (knowledge-base loading) both work.
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // Hide Next.js's "N" dev badge; the page shows its own Redan "R" badge there.
  devIndicators: false,
};

export default nextConfig;
