# Notification System Design

## Stage 1 — API Design

### GET /notifications
- Description: List notifications for the authenticated student.
- Request body: None
- Response:
```json
{
	"data": [
		{
			"id": "notif_123",
			"studentId": 1042,
			"type": "placement",
			"message": "Placement drive is live.",
			"isRead": false,
			"createdAt": "2026-05-02T09:15:00Z"
		}
	],
	"paging": {
		"limit": 20,
		"cursor": "eyJjcmVhdGVkQXQiOiIyMDI2LTA1LTAyVDA5OjE1OjAwWiIsImlkIjoibm90aWZfMTIzIn0="
	}
}
```

### GET /notifications/:id
- Description: Fetch a single notification by id.
- Request body: None
- Response:
```json
{
	"data": {
		"id": "notif_123",
		"studentId": 1042,
		"type": "result",
		"message": "Your result is available.",
		"isRead": true,
		"createdAt": "2026-05-01T18:42:00Z"
	}
}
```

### POST /notifications
- Description: Create a new notification.
- Request body:
```json
{
	"studentId": 1042,
	"type": "event",
	"message": "Career fair starts tomorrow.",
	"metadata": {
		"eventId": "evt_908"
	}
}
```
- Response:
```json
{
	"data": {
		"id": "notif_987",
		"studentId": 1042,
		"type": "event",
		"message": "Career fair starts tomorrow.",
		"isRead": false,
		"createdAt": "2026-05-02T11:05:00Z"
	}
}
```

### PATCH /notifications/:id/read
- Description: Mark a notification as read.
- Request body: None
- Response:
```json
{
	"data": {
		"id": "notif_987",
		"isRead": true,
		"updatedAt": "2026-05-02T11:10:00Z"
	}
}
```

### PATCH /notifications/read-all
- Description: Mark all notifications as read for the authenticated student.
- Request body: None
- Response:
```json
{
	"data": {
		"updatedCount": 18
	}
}
```

### DELETE /notifications/:id
- Description: Delete a notification.
- Request body: None
- Response:
```json
{
	"data": {
		"id": "notif_987",
		"deleted": true
	}
}
```

## Stage 2 — Persistent Storage

PostgreSQL is a good fit for notifications because it provides ACID guarantees,
strong relational modeling for students and notifications, and mature indexing
options for fast reads at scale.

```sql
CREATE TABLE students (
	studentId BIGINT PRIMARY KEY,
	email TEXT NOT NULL UNIQUE,
	fullName TEXT NOT NULL,
	createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
	id BIGSERIAL PRIMARY KEY,
	studentId BIGINT NOT NULL REFERENCES students(studentId),
	type TEXT NOT NULL,
	message TEXT NOT NULL,
	isRead BOOLEAN NOT NULL DEFAULT false,
	createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (createdAt);

CREATE TABLE notifications_2026_05 PARTITION OF notifications
	FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

Partitioning by `createdAt` keeps recent partitions small and hot. Older
monthly partitions can be detached and archived to cheaper storage (for example,
S3) once they are outside the product SLA, while the main table stays fast.

## Stage 3 — Query Optimization

The query below is slow on 5M rows because it scans the entire notifications
table without a supporting index, then sorts the result. This causes heavy I/O
and CPU usage as the table grows.

```sql
SELECT *
FROM notifications
WHERE studentId = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

Recommended index:
```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (studentId, isRead, createdAt DESC);
```

Indexing every column is harmful because it increases write amplification,
expands storage, and can confuse the query planner when it has too many choices
for execution paths.

7-day placement query:
```sql
SELECT DISTINCT s.studentId
FROM notifications n
JOIN students s ON s.studentId = n.studentId  
WHERE n.type = 'placement'
	AND n.createdAt >= NOW() - INTERVAL '7 days';
```

## Stage 4 — Scaling

- Redis cache with TTL for per-student notification lists (cache key per student)
- Cursor-based pagination instead of OFFSET for stable performance at scale
- Read replicas for high read throughput, with writes kept on the primary
- CDN for static assets (images, attachments) to reduce app server load

Trade-offs:
- Cache staleness vs performance (TTL and invalidation strategy are required)
- Replica lag can return slightly stale data
- Cursor pagination improves performance but needs good UX for deep navigation

## Stage 5 — Reliability & Async Processing

The naive approach (synchronous loop that sends 50k notifications) is brittle:
it blocks the process, has no retries, and a single failure can stop the batch.

Redesign with a message queue (Bull or RabbitMQ):
- Producer enqueues all 50k notification jobs
- Workers process in parallel batches
- Save to DB first (source of truth), then enqueue email separately
- Retry email sends with exponential backoff, push permanent failures to DLQ

Pseudocode:
```ts
const notificationQueue = new Queue("notifications");
const emailQueue = new Queue("emails");

// Producer
for (const studentId of studentIds) {
	await notificationQueue.add("createNotification", {
		studentId,
		payload: notificationPayload
	});
}

// Worker
notificationQueue.process("createNotification", async (job) => {
	const { studentId, payload } = job.data;
	const notificationId = await saveNotificationToDb(studentId, payload);

	await emailQueue.add(
		"sendEmail",
		{ studentId, notificationId },
		{ attempts: 5, backoff: { type: "exponential", delay: 30000 } }
	);
});

emailQueue.process("sendEmail", async (job) => {
	await sendEmail(job.data);
});
```

## Stage 6 — Priority Inbox

Priority formula: priority = typeWeight + recencyScore

Weights: placement = 3, result = 2, event = 1

Recency score: 1 / (hoursAgo + 1)

```ts
import axios from "axios";
import { Log } from "logging-middleware";

type NotificationType = "placement" | "result" | "event";

type Notification = {
	id: string;
	studentId: number;
	type: NotificationType;
	message: string;
	isRead: boolean;
	createdAt: string;
};

type ScoredNotification = Notification & {
	score: number;
};

const TYPE_WEIGHTS: Record<NotificationType, number> = {
	placement: 3,
	result: 2,
	event: 1
};

const BASE_URL = "http://20.207.122.201/evaluation-service";

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

const isNotificationType = (value: string): value is NotificationType =>
	value === "placement" || value === "result" || value === "event";

const getHoursAgo = (createdAt: string): number => {
	const createdMs = new Date(createdAt).getTime();
	const diffMs = Date.now() - createdMs;
	return Number.isFinite(diffMs) && diffMs > 0 ? diffMs / 36e5 : 0;
};

export const getTopPriorityNotifications = async (): Promise<
	ScoredNotification[]
> => {
	const authToken = process.env.AUTH_TOKEN;
	if (!authToken) {
		throw new Error("AUTH_TOKEN is required");
	}

	await safeLog("debug", "Fetching notifications for priority inbox");

	try {
		const response = await axios.get(`${BASE_URL}/notifications`, {
			headers: {
				Authorization: `Bearer ${authToken}`
			},
			validateStatus: () => true
		});

		if (response.status !== 200) {
			throw new Error(`Request failed with status ${response.status}`);
		}

		const raw = Array.isArray(response.data) ? response.data : [];
		const scored = raw
			.filter((item): item is Notification =>
				Boolean(item) &&
				typeof item.id === "string" &&
				typeof item.studentId === "number" &&
				typeof item.message === "string" &&
				typeof item.createdAt === "string" &&
				isNotificationType(String(item.type))
			)
			.map((notification) => {
				const hoursAgo = getHoursAgo(notification.createdAt);
				const recencyScore = 1 / (hoursAgo + 1);
				const score = TYPE_WEIGHTS[notification.type] + recencyScore;
				return { ...notification, score };
			})
			.sort((a, b) => b.score - a.score)
			.slice(0, 10);

		await safeLog("info", `Priority inbox ready (${scored.length} items)`);
		return scored;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await safeLog("error", `Failed to build priority inbox: ${message}`);
		throw error;
	}
};
```
