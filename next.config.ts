import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  // This creates a minimal production build with all dependencies
  output: "standalone",

  // Disable x-powered-by header for security
  poweredByHeader: false,

  // Enable experimental features if needed
  experimental: {
    // Optimize package imports for faster builds
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
