import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ApiFault } from "../lib/errors";

export function correlationId(req: Request, res: Response, next: NextFunction) {
  req.correlationId = randomUUID();
  res.setHeader("x-request-id", req.correlationId);
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  next();
}

const buckets = new Map<string, { count: number; resetAt: number }>();
export function writeRateLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  if (buckets.size > 1_000) for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  const key = `${req.identity?.subject ?? req.ip}:writes`;
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
  bucket.count += 1; buckets.set(key, bucket);
  if (bucket.count > 120) return next(new ApiFault(429, "RATE_LIMITED", "Write rate limit exceeded."));
  next();
}
