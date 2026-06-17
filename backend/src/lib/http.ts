import { Request, Response, NextFunction, RequestHandler } from "express";
import { ZodError } from "zod";

// Wraps async handlers so thrown errors hit the error middleware.
export const h =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) =>
    fn(req, res).catch(next);

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(422).json({ error: "validation_error", issues: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_error" });
}
