import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Os testes e2e usam outra pasta de build, para não colidir com um `npm run dev` já aberto.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
