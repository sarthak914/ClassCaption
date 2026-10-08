import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray package-lock.json in a parent folder doesn't confuse Next.js.
  outputFileTracingRoot: process.cwd(),
  // Keep the ffmpeg binary as a real file on disk instead of bundling it.
  serverExternalPackages: ["ffmpeg-static"],
  // ...and ship that binary with the upload-processing function when deployed (e.g. Vercel).
  outputFileTracingIncludes: { "/api/lectures/[id]/process": ["./node_modules/ffmpeg-static/ffmpeg*"] },
};

export default nextConfig;
