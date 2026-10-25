import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat API reads lender and model configs from disk at runtime; ship them with the function.
  outputFileTracingIncludes: {
    "/api/chat": ["./config/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;
