import axios from "axios";

type Stack = "backend" | "frontend";
type Level = "debug" | "info" | "warn" | "error" | "fatal";
type BackendPackage =
  | "cache"
  | "controller"
  | "cron_job"
  | "db"
  | "domain"
  | "handler"
  | "repository"
  | "route"
  | "service"
  | "auth"
  | "config"
  | "middleware"
  | "utils";

const VALID_STACKS: Stack[] = ["backend", "frontend"];
const VALID_LEVELS: Level[] = ["debug", "info", "warn", "error", "fatal"];
const VALID_BACKEND_PACKAGES: BackendPackage[] = [
  "cache",
  "controller",
  "cron_job",
  "db",
  "domain",
  "handler",
  "repository",
  "route",
  "service",
  "auth",
  "config",
  "middleware",
  "utils"
];

const LOG_ENDPOINT = "http://20.207.122.201/evaluation-service/logs";

const requireNonEmpty = (value: string, label: string): void => {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
};

const validateStack: (stack: string) => asserts stack is Stack = (stack) => {
  if (!VALID_STACKS.includes(stack as Stack)) {
    throw new Error(
      `Invalid stack "${stack}". Valid stacks: ${VALID_STACKS.join(", ")}.`
    );
  }
};

const validateLevel: (level: string) => asserts level is Level = (level) => {
  if (!VALID_LEVELS.includes(level as Level)) {
    throw new Error(
      `Invalid level "${level}". Valid levels: ${VALID_LEVELS.join(", ")}.`
    );
  }
};

const validateBackendPackage: (pkg: string) => asserts pkg is BackendPackage = (
  pkg
) => {
  if (!VALID_BACKEND_PACKAGES.includes(pkg as BackendPackage)) {
    throw new Error(
      `Invalid backend package "${pkg}". Valid backend packages: ${VALID_BACKEND_PACKAGES.join(", ")}.`
    );
  }
};

const formatResponseBody = (data: unknown): string => {
  if (data === undefined) {
    return "";
  }

  if (typeof data === "string") {
    return data;
  }

  return JSON.stringify(data);
};

export async function Log(
  stack: string,
  level: string,
  pkg: string,
  message: string
): Promise<void> {
  requireNonEmpty(stack, "stack");
  requireNonEmpty(level, "level");
  requireNonEmpty(pkg, "package");
  requireNonEmpty(message, "message");

  validateStack(stack);
  validateLevel(level);

  if (stack === "backend") {
    validateBackendPackage(pkg);
  }

  const authToken = process.env.AUTH_TOKEN;
  if (!authToken || authToken.trim().length === 0) {
    throw new Error("AUTH_TOKEN is required to send logs");
  }

  try {
    const response = await axios.post(
      LOG_ENDPOINT,
      {
        stack,
        level,
        package: pkg,
        message
      },
      {
        headers: {
          Authorization: `Bearer ${authToken}`
        }
      }
    );

    if (response.status !== 200) {
      throw new Error(
        `Log request failed with status ${response.status}: ${formatResponseBody(
          response.data
        )}`
      );
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(
        `Log request failed with status ${error.response.status}: ${formatResponseBody(
          error.response.data
        )}`
      );
    }

    const fallbackMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Log request failed: ${fallbackMessage}`);
  }
}
