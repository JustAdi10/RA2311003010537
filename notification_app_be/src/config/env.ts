import dotenv from "dotenv";
import { Log } from "logging-middleware";

dotenv.config();

const requiredVars = ["AUTH_TOKEN", "PORT"] as const;

const missingVars = requiredVars.filter(
  (key) => !process.env[key] || process.env[key]?.trim().length === 0
);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(", ")}`
  );
}

const portValue = Number(process.env.PORT);
if (!Number.isFinite(portValue) || portValue <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const env = {
  AUTH_TOKEN: process.env.AUTH_TOKEN as string,
  PORT: portValue
};

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "config", message);
  } catch {
    return;
  }
};

void safeLog("Environment configuration loaded");

export { env };
