import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "better-sqlite3-multiple-ciphers", "pdfjs-dist"],
};

export default nextConfig;
