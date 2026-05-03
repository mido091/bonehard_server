import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env, isProduction } from "./config/env.js";
import { testDatabaseConnection } from "./config/db.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import caseRoutes from "./routes/case.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import pusherRoutes from "./routes/pusher.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import statusRoutes from "./routes/status.routes.js";
import orderRoutes from "./routes/order.routes.js";
import userOrderRoutes from "./routes/userOrder.routes.js";
import userRoutes from "./routes/user.routes.js";
import storageRoutes from "./routes/storage.routes.js";
import siteSettingsRoutes from "./routes/siteSettings.routes.js";
import { csrfProtection } from "./middlewares/csrf.middleware.js";
import { apiLimiter } from "./middlewares/rateLimit.middleware.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { sendSuccess } from "./utils/apiResponse.js";

const app = express();

// ── CORS configuration ──────────────────────────────────────────────────────
// Must be registered BEFORE helmet so that preflight OPTIONS responses carry
// the correct Access-Control-Allow-* headers and are not blocked by Helmet.
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. curl, server-to-server, same-origin)
    if (!origin) return callback(null, true);

    if (env.frontendOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-csrf-token",
    "x-requested-with",
  ],
  exposedHeaders: ["x-csrf-token"],
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
};

// Handle preflight (OPTIONS) before any other middleware
app.options("*", cors(corsOptions));

// Middleware — order matters:
// 1. cors() must run BEFORE helmet() so CORS headers on preflight aren't removed
// 2. cors() before cookieParser/json so OPTIONS responds immediately
app.use(cors(corsOptions));
app.use(
  helmet({
    // Allow cross-origin resource sharing — helmet's defaults block it
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));
app.use(apiLimiter);
app.use(csrfProtection);

// Routes
app.get("/health", (_req, res) => {
    sendSuccess(res, {
      data: {
        status: "ok",
        environment: env.nodeEnv,
      },
    });
});

app.get("/health/db", async (_req, res, next) => {
    try {
        const result = await testDatabaseConnection();
        sendSuccess(res, {
          data: {
            status: "ok",
            database: result.databaseName,
          },
        });
    } catch (error) {
        next(error);
    }
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/pusher", pusherRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/case-statuses", statusRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/user", userRoutes);
app.use("/api/user/orders", userOrderRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api", siteSettingsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
    const dbStatus = await testDatabaseConnection();

    console.log("Database connection verified", {
        database: dbStatus.databaseName,
        host: dbStatus.host,
        port: dbStatus.port,
    });

    app.listen(env.port, () => {
        console.log(`Server is running on port ${env.port}`);
    });
};

if (!process.env.VERCEL) {
    startServer().catch((error) => {
        console.error("Failed to start server", {
            name: error.name,
            message: error.message,
        });
        process.exit(1);
    });
}

export default app;
