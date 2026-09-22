import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Bundle the reference COC so the seed endpoint works on Vercel.
  // Chinese (CJK) font for PDFs is read from disk at runtime – ship it with every API route.
  outputFileTracingIncludes: { "/api/templates/seed": ["./reference/**"], "/api/**/*": ["./assets/fonts/**", "./assets/wasm/**"] },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  compress: true,
  // The app uses plain <img> (no next/image), so the sharp image optimizer is not needed –
  // this keeps the Azure prebuilt package small.
  images: { unoptimized: true },
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "25mb" },
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js"],
  },
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    },
  ],
};

export default nextConfig;
