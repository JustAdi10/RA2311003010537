import { Router } from "express";
import { Log } from "logging-middleware";
import {
  getAllNotifications,
  getPriorityInbox
} from "../controllers/notificationController";

const router = Router();

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "route", message);
  } catch {
    return;
  }
};

router.get("/notifications", getAllNotifications);
router.get("/notifications/priority", getPriorityInbox);

void safeLog("Registered notification routes");

export default router;
