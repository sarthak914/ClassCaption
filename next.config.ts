import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so a stray package-lock.json in a parent folder doesn't confuse Next.js.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
