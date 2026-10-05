import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);
app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;

      log(logLine);
    }
  });

  next();
});

(async () => {
  const { pool } = await import("./db");
  const { ensureMediaTables } = await import("./modules/media/schema");
  await ensureMediaTables(pool);
  // Start weather update schedule
  const { startWeatherUpdateSchedule } = await import("./lib/weather");
  if (process.env.DISABLE_SCHEDULERS !== "true") startWeatherUpdateSchedule();

  // Start daily message scheduler for Telegram channel
  const {
    startDailyMessageScheduler,
    startDailyNewsScheduler,
    startListeningScheduler,
    startReadingScheduler,
  } = await import("./lib/telegram");
  if (process.env.DISABLE_SCHEDULERS !== "true") {
    startDailyMessageScheduler();
    startDailyNewsScheduler();
    startListeningScheduler();
    startReadingScheduler();
  }

  await registerRoutes(httpServer, app);
  const { startMediaWorker } = await import("./modules/media/worker");
  startMediaWorker();

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message =
      status === 413
        ? "Fayl 50 MB dan katta."
        : status >= 500
          ? "Server amali bajarilmadi."
          : err.message || "So‘rov noto‘g‘ri.";

    res.status(status).json({ message });
    if (status >= 500) console.error("Request failed:", err.name || "Error");
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
