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

// const io = new SocketIOServer(httpServer, {
//   path: "/api/socket.io",
//   cors: {
//     origin: "*",
//     methods: ["GET", "POST"],
//   },
// });

const io = new SocketIOServer(httpServer, {
  path: "/api/socket.io",
  cors: {
    origin: ["https://charpar-frontend.vercel.app"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

setupSocketIO(io);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening with Socket.IO");
});
