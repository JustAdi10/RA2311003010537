import express from "express";
import { Log } from "logging-middleware";
import { env } from "./config/env";
import schedulerRoutes from "./routes/scheduler";

const app = express();

app.use(express.json());
app.use("/api", schedulerRoutes);

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "service", message);
  } catch {
    return;
  }
};

app.listen(env.PORT, () => {
  void safeLog(`Vehicle scheduler listening on port ${env.PORT}`);
});
