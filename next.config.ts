import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modules natifs / binaires : ne pas les bundler
  serverExternalPackages: ["@libsql/client", "libsql", "exceljs", "@react-pdf/renderer"],
  poweredByHeader: false,
  // MapLibre n'aime pas le double montage de React StrictMode en dev (hash d'URL perdu, deux cartes WebGL)
  reactStrictMode: false,
  // Les fichiers de base locale ne doivent jamais partir dans le bundle serverless
  outputFileTracingExcludes: { "*": [".data/**", "scripts/**", "e2e/**", "data/demo.db"] },
  // Base de données allégée (morceaux gzip) lue au démarrage à froid : à embarquer dans chaque fonction serveur
  outputFileTracingIncludes: { "/**": ["./data/lite/**"] },
};

export default nextConfig;
