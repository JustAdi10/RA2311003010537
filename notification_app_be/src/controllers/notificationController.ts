import { Request, Response } from "express";
import { Log } from "logging-middleware";
import {
  fetchNotifications,
  getPriorityInbox as buildPriorityInbox
} from "../services/notificationService";

const safeLog = async (
  level: "debug" | "info" | "error",
  message: string
): Promise<void> => {
  try {
    await Log("backend", level, "controller", message);
  } catch {
    return;
  }
};

export const getAllNotifications = async (
  req: Request,
  res: Response
): Promise<void> => {
  await safeLog(
    "debug",
    `Notifications request received: ${req.method} ${req.path}`
  );

  try {
    const notifications = await fetchNotifications();
    await safeLog("info", "Notifications fetched successfully");
    res.json({ data: notifications });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await safeLog("error", `Failed to fetch notifications: ${message}`);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getPriorityInbox = async (
  req: Request,
  res: Response
): Promise<void> => {
  const rawLimit = Array.isArray(req.query.n) ? req.query.n[0] : req.query.n;
  const parsedLimit = rawLimit ? Number(rawLimit) : 10;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.floor(parsedLimit)
      : 10;

  await safeLog(
    "debug",
    `Priority inbox request received: top ${limit} items`
  );

  try {
    const items = await buildPriorityInbox(limit);
    await safeLog("info", "Priority inbox generated successfully");
    res.json({ data: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await safeLog("error", `Failed to build priority inbox: ${message}`);
    res.status(500).json({ error: "Internal server error" });
  }
};
