import axios from "axios";
import { Log } from "logging-middleware";
import {
  EVALUATION_SERVICE_BASE_URL,
  NOTIFICATION_TYPE_WEIGHTS,
  NotificationType
} from "../config/constants";
import { env } from "../config/env";

export type Notification = {
  id: string;
  studentId: number;
  type: NotificationType;
  message: string;
  isRead: boolean;
  createdAt: string;
};

export type ScoredNotification = Notification & {
  score: number;
};

const safeLog = async (
  level: "debug" | "info" | "error",
  message: string
): Promise<void> => {
  try {
    await Log("backend", level, "service", message);
  } catch {
    return;
  }
};

const isNotificationType = (value: string): value is NotificationType =>
  value === "placement" || value === "result" || value === "event";

const formatBody = (data: unknown): string => {
  if (data === undefined) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  return JSON.stringify(data);
};

const formatError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    if (error.response) {
      return `status ${error.response.status}: ${formatBody(error.response.data)}`;
    }

    return error.message;
  }

  return error instanceof Error ? error.message : "Unknown error";
};

const getHoursAgo = (createdAt: string): number => {
  const createdMs = new Date(createdAt).getTime();
  const diffMs = Date.now() - createdMs;
  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return 0;
  }

  return diffMs / 36e5;
};

export const fetchNotifications = async (): Promise<Notification[]> => {
  await safeLog("debug", "Fetching notifications");

  try {
    const response = await axios.get(
      `${EVALUATION_SERVICE_BASE_URL}/notifications`,
      {
        headers: {
          Authorization: `Bearer ${env.AUTH_TOKEN}`
        },
        validateStatus: () => true
      }
    );

    if (response.status !== 200) {
      throw new Error(
        `Notifications request failed with status ${response.status}: ${formatBody(
          response.data
        )}`
      );
    }

    const rawNotifications = Array.isArray(response.data) ? response.data : [];
    const notifications = rawNotifications.filter((item): item is Notification =>
      Boolean(item) &&
      typeof item.id === "string" &&
      typeof item.studentId === "number" &&
      typeof item.message === "string" &&
      typeof item.createdAt === "string" &&
      isNotificationType(String(item.type))
    );

    await safeLog("info", `Fetched ${notifications.length} notifications`);
    return notifications;
  } catch (error) {
    await safeLog("error", `Failed to fetch notifications: ${formatError(error)}`);
    throw error;
  }
};

export const getPriorityInbox = async (
  topN: number
): Promise<ScoredNotification[]> => {
  const limit = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 10;
  await safeLog("debug", `Computing priority inbox for top ${limit}`);

  const notifications = await fetchNotifications();
  const scored = notifications
    .map((notification) => {
      const hoursAgo = getHoursAgo(notification.createdAt);
      const recencyScore = 1 / (hoursAgo + 1);
      const score = NOTIFICATION_TYPE_WEIGHTS[notification.type] + recencyScore;
      return { ...notification, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  await safeLog("info", `Priority inbox computed (${scored.length} items)`);
  return scored;
};
