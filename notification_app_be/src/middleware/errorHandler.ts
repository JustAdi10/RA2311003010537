import { NextFunction, Request, Response } from "express";
import { Log } from "logging-middleware";

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "error", "middleware", message);
  } catch {
    return;
  }
};

export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const message = err instanceof Error ? err.message : "Unknown error";
  void safeLog(`Unhandled error: ${message}`);
  res.status(500).json({ error: "Internal server error" });
};
