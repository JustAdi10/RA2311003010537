import { NextFunction, Request, Response } from "express";
import { Log } from "logging-middleware";

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "middleware", message);
  } catch {
    return;
  }
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const summary = `${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`;
    void safeLog(summary);
  });

  next();
};
