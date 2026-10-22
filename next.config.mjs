/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    // The PDF text reader (pdf.js inside unpdf) breaks when bundled; load it as-is on the server.
    // `ws` (for live connections) has optional native parts and is loaded by @vercel/functions.
    serverComponentsExternalPackages: ["unpdf", "ws", "@vercel/functions"],
  },
  // The AI assistants page moved from /ai to /mcp. (Sources here match any case, so "/MCP" is
  // sent to /mcp by the middleware instead: a "/MCP" source would match /mcp itself and loop.)
  async redirects() {
    return [{ source: "/ai", destination: "/mcp", permanent: true }];
  },
  // The service worker must never be served stale, or fixes to it would take days to reach phones.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
