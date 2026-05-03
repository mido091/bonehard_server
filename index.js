import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
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

// Middleware
app.use(helmet());
app.use(cors({
    origin: env.frontendOrigins,
    credentials: true,
}));
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
