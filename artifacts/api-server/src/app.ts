import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./lib/errors";
import { DevelopmentIdentityProvider, requireIdentity } from "./middleware/identity";
import { correlationId, securityHeaders } from "./middleware/security";

const app: Express = express();
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(correlationId);
app.use(securityHeaders);

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
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); }, credentials: true, methods: ["GET", "POST", "PUT", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id"] }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "256kb", type: "application/json" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.use("/api", requireIdentity(new DevelopmentIdentityProvider()), router);
app.use(notFound);
app.use(errorHandler);

export default app;
