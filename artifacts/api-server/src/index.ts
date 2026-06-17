import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { setupSocketIO } from "./lib/matchmaker";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = createServer(app);

// ── Get allowed origins from environment ──────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "https://charpar-frontend.vercel.app",
  "https://charpar-frontend-gj5wvbdfk-abdulnabi9966s-projects.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
];

// ── Socket.IO with proper CORS ─────────────────────────────────────────────────
// Using '/socket.io' path (not '/api/socket.io') for simpler setup
const io = new SocketIOServer(httpServer, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling", "websocket"], // Polling first, then upgrade
  allowEIO3: true,
});

setupSocketIO(io);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening with Socket.IO");
});
