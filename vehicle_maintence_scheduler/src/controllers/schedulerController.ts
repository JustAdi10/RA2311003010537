import { Request, Response } from "express";
import { Log } from "logging-middleware";
import { scheduleAllDepots } from "../services/schedulerService";

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

export const getSchedule = async (
  req: Request,
  res: Response
): Promise<void> => {
  await safeLog("debug", `Schedule request received: ${req.method} ${req.path}`);

  try {
    const schedule = await scheduleAllDepots();
    await safeLog("info", "Schedule generated successfully");
    res.json(schedule);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await safeLog("error", `Failed to generate schedule: ${errorMessage}`);
    res.status(500).json({ error: "Internal server error" });
  }
};
