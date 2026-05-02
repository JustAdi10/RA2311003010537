import { Router } from "express";
import { Log } from "logging-middleware";
import { getSchedule } from "../controllers/schedulerController";

const router = Router();

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "route", message);
  } catch {
    return;
  }
};

router.get("/schedule", getSchedule);

void safeLog("Registered scheduler routes");

export default router;
