import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import healthRouter from "./routes/health";
import router, { createApiRouter } from "./routes";
import { logger } from "./lib/logger";
import { errorHandler, notFound } from "./lib/errors";
import { DevelopmentIdentityProvider, requireIdentity, type IdentityProvider } from "./middleware/identity";
import { correlationId, securityHeaders } from "./middleware/security";
import type { ItemWriteService } from "./services/item-write-service";
import type { Phase2Service } from "./services/phase2-service";

export function createApp(options: { identityProvider?: IdentityProvider; itemWriteService?: ItemWriteService; phase2Service?: Phase2Service } = {}): Express {
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
app.use(cors({ origin(origin, callback) { callback(null, !origin || allowedOrigins.includes(origin)); }, credentials: true, methods: ["GET", "POST", "PUT", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-Request-Id", "X-Development-User"] }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT ?? "256kb", type: "application/json" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.use("/api", healthRouter);
app.use("/api", requireIdentity(options.identityProvider ?? new DevelopmentIdentityProvider()), (req,res,next)=>{const started=performance.now();res.once("finish",()=>logger.info({correlationId:req.correlationId,actorId:req.identity?.subject,batchId:req.params?.batchId,itemId:req.params?.itemId,action:`${req.method} ${req.path}`,status:res.statusCode,latencyMs:Math.round(performance.now()-started)},"api operation"));next();}, options.itemWriteService ? createApiRouter(options.itemWriteService, options.phase2Service) : router);
app.use(notFound);
app.use(errorHandler);

  return app;
}

export default createApp();
