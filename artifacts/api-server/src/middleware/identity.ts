import type { NextFunction, Request, Response } from "express";
import { ApiFault } from "../lib/errors";

export interface IdentityProvider { authenticate(req: Request): Promise<{ subject: string; role: "employee" | "reviewer" | "admin" } | null>; }

// Development-only adapter. Production must replace this with a trusted session/OIDC provider.
export class DevelopmentIdentityProvider implements IdentityProvider {
  async authenticate(req: Request) {
    if (process.env.NODE_ENV === "production") return null;
    return { subject: req.header("x-development-user") ?? "development-employee", role: "employee" as const };
  }
}

export function requireIdentity(provider: IdentityProvider) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const identity = await provider.authenticate(req);
      if (!identity) throw new ApiFault(401, "UNAUTHORIZED", "Authentication is required.");
      req.identity = identity;
      next();
    } catch (error) { next(error); }
  };
}

export function requireRole(...roles: Array<"employee" | "reviewer" | "admin">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.identity || !roles.includes(req.identity.role)) return next(new ApiFault(403, "FORBIDDEN", "This role cannot perform the requested action."));
    next();
  };
}
