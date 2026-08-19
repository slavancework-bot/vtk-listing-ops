declare global {
  namespace Express {
    interface Request {
      identity?: { subject: string; role: "employee" | "reviewer" | "admin" };
      correlationId: string;
    }
  }
}
export {};
