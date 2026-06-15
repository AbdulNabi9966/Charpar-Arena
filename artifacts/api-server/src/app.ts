import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Get allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [
  "https://charpar-frontend.vercel.app",
];

console.log("CORS allowed origins:", allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  })
);

// Handle preflight requests
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root route
app.get("/", (_req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Charpar Arena backend is running 🚀",
  });
});

// API routes
app.use("/api", router);

// 404 handler (must be LAST)
app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
  });
});

export default app;
