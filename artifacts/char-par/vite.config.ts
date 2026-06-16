import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const port = Number(process.env.PORT || 3000);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const basePath = process.env.BASE_PATH || "/";

// ── Backend Configuration ──────────────────────────────────────────────────────
// Get backend URL from environment or use default
// Default backend port is 3001 (matching your Render config)
const backendPort = process.env.BACKEND_PORT || "3001";
const backendHost = process.env.BACKEND_HOST || "localhost";

// For local development
const localBackendUrl = `http://${backendHost}:${backendPort}`;

// For production (Render)
const prodBackendUrl = process.env.VITE_API_URL || "https://charpar-arena.onrender.com";

const isDev = process.env.NODE_ENV !== "production";
const apiTarget = isDev ? localBackendUrl : prodBackendUrl;

console.log(`🔧 Environment: ${isDev ? 'Development' : 'Production'}`);
console.log(`🔧 API Target: ${apiTarget}`);
console.log(`🔧 Backend Port: ${backendPort}`);

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
