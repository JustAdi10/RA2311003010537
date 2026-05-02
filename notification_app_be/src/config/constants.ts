export const NOTIFICATION_TYPE_WEIGHTS = {
  placement: 3,
  result: 2,
  event: 1
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPE_WEIGHTS;

export const EVALUATION_SERVICE_BASE_URL =
  "http://20.207.122.201/evaluation-service";
