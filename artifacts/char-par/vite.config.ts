import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT || 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH || "/";

// ── Determine API URL for proxy ──────────────────────────────────────────────
// For local development, proxy to backend
// For production, use environment variable
const isDev = process.env.NODE_ENV !== "production";
const apiTarget = isDev 
  ? "http://localhost:8080"  // Local backend
  : process.env.VITE_API_URL || "https://charpar-arena.onrender.com";

console.log(`🔧 API Target: ${apiTarget}`);
console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    // ── Only proxy in development ──────────────────────────────────────────────
    proxy: isDev ? {
      '/api': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/socket.io': {
        target: apiTarget,
        ws: true,
        changeOrigin: true,
      },
    } : undefined,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
