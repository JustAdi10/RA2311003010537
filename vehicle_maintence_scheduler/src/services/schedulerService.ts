import axios from "axios";
import { Log } from "logging-middleware";
import { env } from "../config/env";

const BASE_URL = "http://20.207.122.201/evaluation-service";

type DepotId = string | number;

type Depot = {
  depotId?: DepotId;
  id?: DepotId;
  mechanicHours?: number;
  mechanic_hours?: number;
  [key: string]: unknown;
};

type VehicleTask = {
  id?: string | number;
  depotId?: DepotId;
  depot_id?: DepotId;
  impact?: number;
  Impact?: number;
  duration?: number;
  Duration?: number;
  [key: string]: unknown;
};

type ScheduleResult = {
  depotId: DepotId;
  selectedTasks: VehicleTask[];
  totalImpact: number;
  totalDuration: number;
};

const safeLog = async (
  level: "debug" | "info" | "warn" | "error",
  message: string
): Promise<void> => {
  try {
    await Log("backend", level, "service", message);
  } catch {
    return;
  }
};

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

const getAuthHeaders = () => ({
  Authorization: `Bearer ${env.AUTH_TOKEN}`
});

const toNumber = (value: unknown, fallback = 0): number => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const getDepotId = (depot: Depot): DepotId =>
  (depot.depotId ?? depot.id ?? "unknown") as DepotId;

const getMechanicHours = (depot: Depot): number =>
  toNumber(depot.mechanicHours ?? depot.mechanic_hours ?? 0);

const getVehicleDepotId = (vehicle: VehicleTask): DepotId | undefined =>
  (vehicle.depotId ?? vehicle.depot_id) as DepotId | undefined;

const getImpact = (vehicle: VehicleTask): number =>
  toNumber(vehicle.impact ?? vehicle.Impact ?? 0);

const getDuration = (vehicle: VehicleTask): number =>
  toNumber(vehicle.duration ?? vehicle.Duration ?? 0);

export const fetchDepots = async (): Promise<Depot[]> => {
  await safeLog("info", "Fetching depots from evaluation service");

  try {
    const response = await axios.get(`${BASE_URL}/depots`, {
      headers: getAuthHeaders(),
      validateStatus: () => true
    });

    if (response.status !== 200) {
      throw new Error(
        `Depots request failed with status ${response.status}: ${formatBody(
          response.data
        )}`
      );
    }

    const depots = Array.isArray(response.data) ? response.data : [];
    await safeLog("info", `Fetched ${depots.length} depots`);

    return depots as Depot[];
  } catch (error) {
    await safeLog("error", `Failed to fetch depots: ${formatError(error)}`);
    throw error;
  }
};

export const fetchVehicles = async (): Promise<VehicleTask[]> => {
  await safeLog("info", "Fetching vehicles from evaluation service");

  try {
    const response = await axios.get(`${BASE_URL}/vehicles`, {
      headers: getAuthHeaders(),
      validateStatus: () => true
    });

    if (response.status !== 200) {
      throw new Error(
        `Vehicles request failed with status ${response.status}: ${formatBody(
          response.data
        )}`
      );
    }

    const vehicles = Array.isArray(response.data) ? response.data : [];
    await safeLog("info", `Fetched ${vehicles.length} vehicles`);

    return vehicles as VehicleTask[];
  } catch (error) {
    await safeLog("error", `Failed to fetch vehicles: ${formatError(error)}`);
    throw error;
  }
};

export const scheduleForDepot = (
  depotId: DepotId,
  mechanicHours: number,
  vehicles: VehicleTask[]
): ScheduleResult => {
  void safeLog(
    "info",
    `Scheduling depot ${String(depotId)} with ${mechanicHours} hours`
  );

  if (mechanicHours <= 0) {
    void safeLog(
      "warn",
      `Depot ${String(depotId)} has zero or negative mechanic hours`
    );

    return {
      depotId,
      selectedTasks: [],
      totalImpact: 0,
      totalDuration: 0
    };
  }

  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    void safeLog("warn", `No vehicles provided for depot ${String(depotId)}`);

    return {
      depotId,
      selectedTasks: [],
      totalImpact: 0,
      totalDuration: 0
    };
  }

  const depotVehicles = vehicles.filter(
    (vehicle) => getVehicleDepotId(vehicle) === depotId
  );

  if (depotVehicles.length === 0) {
    void safeLog("warn", `No vehicles found for depot ${String(depotId)}`);

    return {
      depotId,
      selectedTasks: [],
      totalImpact: 0,
      totalDuration: 0
    };
  }

  const scoredVehicles = depotVehicles
    .map((vehicle) => {
      const impact = getImpact(vehicle);
      const duration = getDuration(vehicle);
      return {
        vehicle,
        impact,
        duration,
        ratio: duration > 0 ? impact / duration : 0
      };
    })
    .filter((entry) => entry.duration > 0 && entry.impact > 0)
    .sort((a, b) => b.ratio - a.ratio);

  if (scoredVehicles.length === 0) {
    void safeLog(
      "warn",
      `No schedulable vehicles for depot ${String(depotId)}`
    );

    return {
      depotId,
      selectedTasks: [],
      totalImpact: 0,
      totalDuration: 0
    };
  }

  const selectedTasks: VehicleTask[] = [];
  let remainingHours = mechanicHours;
  let totalImpact = 0;
  let totalDuration = 0;

  for (const entry of scoredVehicles) {
    if (entry.duration <= remainingHours) {
      selectedTasks.push(entry.vehicle);
      remainingHours -= entry.duration;
      totalImpact += entry.impact;
      totalDuration += entry.duration;
    }
  }

  void safeLog(
    "info",
    `Depot ${String(depotId)} scheduled ${selectedTasks.length} tasks (impact ${totalImpact}, duration ${totalDuration}, remaining ${remainingHours})`
  );

  return {
    depotId,
    selectedTasks,
    totalImpact,
    totalDuration
  };
};

export const scheduleAllDepots = async (): Promise<ScheduleResult[]> => {
  const [depots, vehicles] = await Promise.all([fetchDepots(), fetchVehicles()]);

  return depots.map((depot) =>
    scheduleForDepot(getDepotId(depot), getMechanicHours(depot), vehicles)
  );
};
