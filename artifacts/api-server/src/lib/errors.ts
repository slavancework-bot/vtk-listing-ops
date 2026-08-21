import type { NextFunction, Request, Response } from "express";
import { logger } from "./logger";

export class ApiFault extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Record<string, unknown>) { super(message); }
}

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(new ApiFault(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  const candidate=error as {type?:string};
  const fault = error instanceof ApiFault ? error : candidate?.type==="entity.too.large" ? new ApiFault(413,"UPLOAD_TOO_LARGE","The request body exceeds the configured limit.") : new ApiFault(500, "SYSTEM_ERROR", "An unexpected system error occurred.");
  if (fault.status >= 500) logger.error({ err: error, correlationId: req.correlationId }, "Request failed");
  res.status(fault.status).json({ code: fault.code, message: fault.message, correlationId: req.correlationId, ...fault.details });
}
