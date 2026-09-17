import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Bundle the reference COC so the seed endpoint works on Vercel.
  outputFileTracingIncludes: { "/api/templates/seed": ["./reference/**"] },
  serverExternalPackages: ["pdf-lib", "@pdf-lib/fontkit"],
  compress: true,
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
