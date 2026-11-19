import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modules natifs / binaires : ne pas les bundler
  serverExternalPackages: ["@libsql/client", "libsql", "exceljs", "@react-pdf/renderer"],
  poweredByHeader: false,
  // Découverte OAuth du connecteur Claude (adresses normalisées ne pouvant pas être des dossiers de l'application)
  async rewrites() {
    return [
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-authorization-server/:path*", destination: "/api/oauth/metadata" },
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/resource" },
      { source: "/.well-known/oauth-protected-resource/:path*", destination: "/api/oauth/resource" },
    ];
  },
  // MapLibre n'aime pas le double montage de React StrictMode en dev (hash d'URL perdu, deux cartes WebGL)
  reactStrictMode: false,
  // Les fichiers de base locale ne doivent jamais partir dans le bundle serverless
  outputFileTracingExcludes: { "*": [".data/**", "scripts/**", "e2e/**", "data/demo.db"] },
};

export default nextConfig;
