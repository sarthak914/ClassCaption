import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

// This computer's Wi-Fi/LAN addresses. Phones on the same Wi-Fi open the app at one of these
// (the join QR code points there), and dev mode only serves its scripts to origins it trusts.
const lanAddresses = Object.values(networkInterfaces())
  .flatMap((addrs) => addrs ?? [])
  .filter((a) => a.family === "IPv4" && !a.internal)
  .map((a) => a.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // Self-contained server in .next/standalone (used by the Docker image).
  output: "standalone",
  // Pin the project root so a stray package-lock.json in a parent folder doesn't confuse Next.js.
  outputFileTracingRoot: process.cwd(),
  // Keep the ffmpeg binary as a real file on disk instead of bundling it.
  serverExternalPackages: ["ffmpeg-static"],
  // ...and ship that binary with the upload-processing function when deployed (e.g. Vercel).
  outputFileTracingIncludes: { "/api/lectures/[id]/process": ["./node_modules/ffmpeg-static/ffmpeg*"] },
};

export default nextConfig;
