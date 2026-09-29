/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
    // The PDF text reader (pdf.js inside unpdf) breaks when bundled; load it as-is on the server.
    serverComponentsExternalPackages: ["unpdf"],
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
