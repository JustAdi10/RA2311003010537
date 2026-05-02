import express from "express";
import { Log } from "logging-middleware";
import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { requestLogger } from "./middleware/requestLogger";
import notificationRoutes from "./routes/notifications";

const app = express();

app.use(requestLogger);
app.use(express.json());
app.use("/api", notificationRoutes);
app.use(errorHandler);

const safeLog = async (message: string): Promise<void> => {
  try {
    await Log("backend", "info", "service", message);
  } catch {
    return;
  }
};

app.listen(env.PORT, () => {
  void safeLog(`Notification app listening on port ${env.PORT}`);
});
