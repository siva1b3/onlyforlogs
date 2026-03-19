# Observability Learning Plan — FileBox

> Paste this entire file at the start of any new conversation to resume exactly where you left off.
> Update the **Current Status** section after every session.

---

## Who I am

- Full stack developer — Node.js / JavaScript ecosystem
- Load balancer engineer with networking background
- Works across system architecture, cloud architecture, DevOps, SRE
- Based in Andhra Pradesh, India
- Learning phase — not building production systems

---

## My primary goal

Learn **microservices observability** by building a real, incremental system.

**Observability is the primary objective. The app is the vehicle, not the destination.**

The three pillars I want to master:
- **Logs** — Loki, Dozzle
- **Traces** — Tempo, OTel SDK
- **Metrics** — Prometheus, exporters, native endpoints

Plus:
- **Ingestion pipeline** — OTel Collector (central routing layer)
- **Dashboards** — Grafana (unified view of all three signals)

---

## The project — FileBox (File Upload & Processing Platform)

**One sentence:** Users upload files, files get processed (thumbnails, metadata extraction, compression), users search and download files, real-time notifications when processing completes.

This project was chosen because:
- Domain is instantly understandable — zero time spent on business logic
- File processing naturally creates distributed traces across sync and async boundaries
- A single user action (upload file) touches multiple services — rich tracing story
- Two runtimes (Node.js, Python) show OTel instrumentation across languages
- Infrastructure services (Redis, Meilisearch, MinIO) teach exporter-based monitoring without writing instrumentation code
- Different execution models (always-on API, cron, batch job, stream processor, WebSocket) each produce fundamentally different telemetry shapes

---

## Core learning principles

1. **Incremental only** — one service, one new concept per step
2. **Always working** — every step produces a runnable, observable system before moving to the next
3. **Each step answers one question** — *what does this add that I could not see before?*
4. **No two new concepts in one step**
5. **Small steps, not leaps** — understanding compounds, never overwhelms

---

## Observability stack (final state — built incrementally)

| Tool | Role |
|---|---|
| Dozzle | Raw container stdout tailing during development |
| Prometheus | Metrics storage — scrape-based pull model |
| Grafana | Unified dashboards — logs + traces + metrics |
| OTel Collector | Central ingestion pipeline — receives from all services, routes to backends |
| Loki | Log aggregation and storage — queryable via LogQL |
| Tempo | Distributed trace storage — queryable via TraceQL |

---

## Three ingestion models covered

| Model | Example in this plan |
|---|---|
| OTel push (SDK in app) | Node.js, Python services push via OTLP to OTel Collector |
| Prometheus scrape via exporter sidecar | postgres-exporter, redis-exporter |
| Native Prometheus endpoint | RabbitMQ, MinIO, Meilisearch expose `/metrics` directly |

---

## All 14 phases — detailed breakdown

---

### Phase 1 — Bare App — Zero Observability

**New containers:** Express API, PostgreSQL, Grafana, Dozzle
**Container count after phase:** 4

**What you build:**
- Express API with three endpoints: `POST /files` (upload), `GET /files` (list), `GET /files/:id/download` (download)
- Files stored on local disk, metadata (filename, size, type, upload time) stored in PostgreSQL
- Grafana installed but empty — no data sources configured yet
- Dozzle attached to Docker daemon

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `express-api` | REST API. Accepts file uploads, stores metadata, serves downloads. | Core application. Without this, nothing exists. |
| `postgres` | Stores file metadata rows (id, filename, size, mimetype, path, created_at). | API needs persistent structured data. Files live on disk, but you need to query "list all files" and "find file by id." |
| `grafana` | Runs on port 3000. No data sources yet. Empty dashboards. | Installed early so you see the "before" state. Opening Grafana and seeing nothing teaches you: without explicit observability setup, a running app is a black box. |
| `dozzle` | Connects to Docker socket, shows live stdout/stderr from all containers in a web UI. | Your first and simplest observability tool. No configuration, no pipeline. Just raw container logs. You will compare this against structured Loki logs later — the contrast teaches why structured logging pipelines exist. |

**What you observe at end of Phase 1:**
- Dozzle shows raw Express logs (`GET /files 200 12ms`) and PostgreSQL startup logs
- Grafana is empty
- If the API crashes, the only way to know is checking Dozzle manually or noticing the API is down
- No metrics, no traces, no searchable logs — this is your baseline "before" picture

**New concept:** Raw container log visibility. What "zero observability" looks like.

---

### Phase 2 — Structured Logging Pipeline

**New containers:** OTel Collector, Loki
**Container count after phase:** 6

**What changes in existing services:** Express API modified to emit structured JSON logs instead of plain text.

**What you build:**
- Express API logs every request as JSON: `{"timestamp": "...", "level": "info", "method": "GET", "path": "/files", "status": 200, "duration_ms": 12}`
- OTel Collector receives these logs and forwards them to Loki
- Loki stores logs, Grafana queries them
- First Grafana dashboard: "API Request Logs" — filter by level, path, status code

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `otel-collector` | Receives telemetry data via OTLP protocol (HTTP/gRPC). Routes logs to Loki. Currently handles only logs — traces and metrics pipelines added in later phases. | Without a central collector, every service would need to know where Loki lives, how to authenticate, what format to use. The collector decouples producers from backends. Change your log storage from Loki to something else? Change one collector config, zero app changes. |
| `loki` | Receives logs from OTel Collector. Indexes them by labels (service name, log level). Stores them compressed. Queryable via LogQL. | Dozzle shows live logs but has no search, no filtering across time ranges, no correlation. Loki lets you query "show me all ERROR logs from express-api in the last 30 minutes." This is the difference between watching logs scroll and actually investigating incidents. |

**Why not send logs directly from Express to Loki?**
- You could. But then in Phase 4 when you add traces, you'd need a separate pipeline to Tempo. In Phase 3, a separate pipeline to Prometheus. The OTel Collector exists to be the single egress point. Add it now while the setup is simple — one moving part — rather than retrofitting later when there are 10 services.

**What you observe at end of Phase 2:**
- Dozzle still works (raw logs, unchanged)
- Grafana → Loki data source → you can search logs by service, level, time range
- You type a LogQL query like `{service_name="express-api"} |= "ERROR"` and get results
- Side-by-side comparison: Dozzle (raw stream) vs Loki in Grafana (structured, searchable, filterable)

**New concept:** Push-based structured logging, collector as routing layer, LogQL.

---

### Phase 3 — Metrics

**New containers:** Prometheus
**Container count after phase:** 7

**What changes in existing services:** Express API adds a `/metrics` endpoint exposing Prometheus-format metrics.

**What you build:**
- Express API uses `prom-client` library to expose:
  - `http_requests_total` (counter) — total requests, labeled by method, path, status
  - `http_request_duration_seconds` (histogram) — response time distribution
  - `http_request_errors_total` (counter) — 4xx and 5xx responses
- Prometheus scrapes `/metrics` every 15 seconds
- Second Grafana dashboard: "API RED Metrics" — request rate, error rate, duration percentiles

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `prometheus` | Scrapes metrics endpoints on a schedule. Stores time-series data. Queryable via PromQL. | Logs tell you *what happened* to individual requests. Metrics tell you *how the system is behaving overall*. "Average response time increased from 50ms to 800ms in the last 5 minutes" — you cannot derive this from logs efficiently. Metrics are pre-aggregated numbers designed for this. |

**Why Prometheus scrapes (pull model) instead of apps pushing?**
- Prometheus controls the collection rate. If an app is overloaded, Prometheus still collects from healthy ones. Pull model means the app doesn't need to know where Prometheus lives — just expose `/metrics` and Prometheus finds you via config. This is a fundamental architectural concept you'll see in production.

**What you observe at end of Phase 3:**
- Grafana now has two data sources: Loki (logs) and Prometheus (metrics)
- You see graphs: request rate over time, p50/p95/p99 latency, error rate percentage
- You can correlate: "error rate spiked at 14:30" in metrics → switch to Loki → "show me ERROR logs around 14:30" → find the root cause
- This log-to-metric correlation is the first taste of why having multiple pillars matters

**New concept:** Metrics scrape model, time-series data, PromQL, RED metrics (Rate/Error/Duration).

---

### Phase 4 — Distributed Tracing (Single Service)

**New containers:** Tempo
**Container count after phase:** 8

**What changes in existing services:** Express API adds OpenTelemetry tracing SDK. Each request generates a trace with spans (HTTP handler → DB query → response).

**What you build:**
- Express API auto-instrumented with `@opentelemetry/sdk-node` and instrumentations for Express and `pg` (PostgreSQL client)
- Every request creates: root span (HTTP request) → child span (PostgreSQL query) → response
- Traces flow: Express → OTel Collector → Tempo
- OTel Collector config updated: now routes logs to Loki AND traces to Tempo
- Third Grafana dashboard: trace search. Click a trace → see waterfall of spans with timing.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `tempo` | Receives and stores distributed traces. Queryable by trace ID, service name, duration, status. | Metrics tell you "p99 latency is 800ms." Logs tell you "this specific request hit an error." Traces tell you *why* — the request spent 5ms in Express handler, 780ms waiting for PostgreSQL, 15ms serializing response. Without traces, you know *what* is slow but not *where inside the request* the time went. |

**Why add tracing now with only one service?**
- Tracing in a single service shows you the internal span structure (HTTP → DB → response). This is the foundation. When you add more services in Phase 5, you'll see traces *extend across service boundaries*. Understanding single-service traces first means you'll immediately recognize what changes when a trace spans two services.

**Critical concept introduced — Trace ID correlation:**
- Express API now injects `trace_id` into every log line
- In Grafana: you see a log entry with an error → click the trace ID → jump directly to the full trace in Tempo → see exactly which span failed and how long each step took
- This log↔trace linking is the highest-value observability feature in production systems

**What you observe at end of Phase 4:**
- Grafana has three data sources: Loki, Prometheus, Tempo
- Full correlation loop: metric graph shows spike → click to see logs around that time → log line has trace ID → click to see full trace → trace shows the slow span
- All three pillars working on one service — this is your complete observability foundation

**New concept:** Distributed traces, spans, trace ID, trace search, log↔trace correlation.

---

### Phase 5 — Async Processing — Trace Crosses Message Queue

**New containers:** RabbitMQ, Python Worker
**Container count after phase:** 10

**What changes in existing services:** Express API no longer processes files. It saves the file, publishes a "file uploaded" message to RabbitMQ, returns 202 Accepted immediately. Python worker consumes the message, generates thumbnail, extracts metadata, updates PostgreSQL.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `rabbitmq` | Message broker. Express API publishes "file.uploaded" events. Python worker subscribes and processes them. Management UI on port 15672. Built-in Prometheus metrics endpoint. | Without a message queue, the API must process files synchronously — user waits for thumbnail generation. With RabbitMQ, API returns instantly, work happens in background. From observability perspective: this creates an *async boundary* — the hardest thing to trace in distributed systems. |
| `python-worker` | Consumes messages from RabbitMQ. For each file: generates thumbnail (Pillow), extracts metadata (file size, dimensions, mimetype), updates PostgreSQL row with processed status and metadata. | Separates fast work (accept upload) from slow work (process file). From observability perspective: this is a second runtime (Python). You'll instrument it with OpenTelemetry Python SDK. You now see: does the trace started in Express continue through RabbitMQ into the Python worker? This is the core distributed tracing learning moment. |

**Why this is the most important observability phase:**
- In Phases 1–4, traces stay inside one process. Here, a single user action (upload file) creates a trace that spans: Express API → RabbitMQ → Python Worker → PostgreSQL. Four services, one trace.
- The trace context must be injected into the RabbitMQ message headers by Express and extracted by Python worker. This is *trace propagation* — the mechanism that makes distributed tracing work.
- If propagation breaks, you see two disconnected traces instead of one. Debugging this teaches you more about distributed tracing than any tutorial.

**RabbitMQ's own observability:**
- RabbitMQ exposes `/api/metrics` — queue depth, message rates, consumer count
- Prometheus scrapes this directly — no OTel SDK needed
- New Grafana dashboard: "Queue Health" — messages published vs consumed, queue depth (growing queue = worker can't keep up)

**What you observe at end of Phase 5:**
- Upload a file → Grafana Tempo shows one trace spanning Express → RabbitMQ → Python Worker → PostgreSQL
- Grafana Loki shows logs from both Node.js and Python, both containing the same trace ID
- RabbitMQ dashboard shows queue depth — publish rate vs consume rate
- If you stop the Python worker, queue depth climbs — visible in real-time in Grafana. Restart worker, queue drains — you see the backlog processing in metrics

**New concept:** Cross-service cross-language trace propagation, W3C TraceContext, async boundary tracing, native Prometheus endpoint (third ingestion model).

---

### Phase 6 — API Gateway — Trace Entry Point

**New containers:** Nginx
**Container count after phase:** 11

**What changes in existing services:** All external traffic now enters through Nginx. Express API is no longer exposed directly.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `nginx` | Reverse proxy. Routes `/api/*` to Express API. Serves as single entry point. Generates access logs. Can be configured with OpenTelemetry Nginx module for trace initiation. | In production, you never expose app servers directly. Nginx handles TLS, rate limiting, routing. From observability perspective: the trace now starts at Nginx, not Express. Access logs in Nginx format flow to Loki via OTel Collector. You get upstream response time (how long Express took, as measured by Nginx) — this is different from Express self-reported duration because it includes network latency between Nginx and Express. |

**Why add Nginx now and not in Phase 1?**
- In Phase 1, adding Nginx would be premature complexity with no observability benefit — you couldn't see its logs or traces anyway. Now that the full pipeline exists (Loki, Tempo, Prometheus), Nginx immediately produces value: access logs in Loki, request duration in Prometheus (via nginx-prometheus-exporter or OTel), trace initiation in Tempo.

**New observability pattern — comparing perspectives:**
- Nginx says request took 850ms (includes network hop to Express + Express processing)
- Express says the same request took 820ms (its own processing time)
- The 30ms gap is network latency between containers — visible only because you have traces from both

**What you observe at end of Phase 6:**
- Full trace: Nginx → Express → RabbitMQ → Python Worker → PostgreSQL
- Access logs in Loki from Nginx with fields: client IP, method, path, status, upstream time
- Nginx metrics in Prometheus: request rate, status code distribution, upstream latency

**New concept:** Edge observability — client-facing view independent of service self-reporting.

---

### Phase 7 — Caching — Infrastructure Monitoring Without Code Instrumentation

**New containers:** Redis, Redis Exporter
**Container count after phase:** 13

**What changes in existing services:** Express API caches file metadata in Redis. On `GET /files/:id`, checks Redis first — cache hit returns immediately, cache miss queries PostgreSQL and populates Redis.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `redis` | In-memory key-value store. Caches file metadata JSON. TTL-based expiration. | Without cache: every file detail request hits PostgreSQL. With cache: repeated reads are sub-millisecond. From observability perspective: Redis is the first infrastructure service that is monitored *without any OTel SDK*. Redis doesn't run your code — it's a black box. You observe it purely through external metrics. |
| `redis-exporter` | Sidecar container. Connects to Redis, reads internal stats, exposes them as Prometheus metrics. | Redis itself has no `/metrics` endpoint in Prometheus format. The exporter translates Redis INFO command output into Prometheus metrics: memory usage, connected clients, hit/miss counts, eviction rate, keys count. This is the **exporter pattern** — the standard way to monitor infrastructure you don't control. |

**Why this phase is architecturally important for observability learning:**
- Phases 2–6: you added OTel SDK to your own code. You controlled the instrumentation.
- Phase 7: Redis has no OTel SDK. You cannot modify Redis source code. The exporter pattern solves this — a separate sidecar translates vendor-specific metrics into Prometheus format.
- This split (SDK instrumentation for your code vs exporter for infrastructure) is how production observability actually works.

**New trace behavior:**
- Express trace now shows: HTTP handler → Redis GET (cache check) → cache miss → PostgreSQL query → Redis SET (populate cache) → response
- Second request for same file: HTTP handler → Redis GET (cache hit) → response. Trace is much shorter. Duration drops from ~50ms to ~2ms.
- Comparing these two trace shapes side by side teaches you how caching affects system behavior — visible in traces.

**New Grafana dashboard:** "Cache Performance" — hit ratio over time, memory usage, eviction rate, keys count.

**What you observe at end of Phase 7:**
- Cache hit ratio starts at 0%, climbs as you access files repeatedly
- Trace waterfall visually shorter on cache hits
- If Redis runs out of memory, eviction rate spikes in Prometheus — you see it happen
- Redis is fully observable without a single line of instrumentation code in Redis

**New concept:** Exporter sidecar pattern — second ingestion model. Infrastructure monitoring without app instrumentation.

---

### Phase 8 — Scheduled Jobs — Observing Periodic Work

**New containers:** Cron Job (Node.js)
**Container count after phase:** 14

**What changes in existing services:** None modified. New standalone container runs on a schedule.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `cron-cleanup` | Node.js service using `node-cron`. Every 10 minutes: queries PostgreSQL for files marked as "expired" or "deleted", removes them from disk, updates database rows, emits summary log: `{"job": "cleanup", "files_deleted": 12, "duration_ms": 340, "status": "success"}`. Exposes metrics: `job_runs_total`, `job_duration_seconds`, `job_last_success_timestamp`. | Files accumulate. Temp files pile up. Without cleanup, disk fills. From observability perspective: this is fundamentally different from an always-on API. An API is continuously generating telemetry. A cron job generates telemetry in bursts every 10 minutes, then goes silent. The question changes from "is it fast?" to "did it run?" and "did it succeed?" |

**Why cron observability is different:**
- For the Express API, absence of metrics means no traffic. Normal.
- For a cron job, absence of metrics means the job didn't run. Problem.
- Key metric: `time_since_last_successful_run`. If this exceeds 2x the expected interval (20 minutes for a 10-minute cron), something is wrong. This is a fundamentally different alerting pattern.

**New observability concepts:**
- **Dead man's switch:** An alert that fires when something *stops happening* — opposite of normal alerts that fire when something happens
- **Job histogram:** Instead of request duration, you track job duration. Is cleanup getting slower as file count grows?

**What you observe at end of Phase 8:**
- Grafana dashboard: "Scheduled Jobs" — last run time, success/failure, duration trend, files cleaned per run
- Loki: structured logs with `job=cleanup` label — filterable separately from API logs
- If you deliberately break the cron (bad SQL query), you see: `job_last_success_timestamp` stops updating, failure logs appear in Loki, duration metric shows the failure was fast (query errored immediately)

**New concept:** Job-based observability — absence of success as the alert signal. Dead man's switch pattern.

---

### Phase 9 — gRPC — Non-HTTP Protocol Tracing

**New containers:** gRPC Image Service (Python)
**Container count after phase:** 15

**What changes in existing services:** Python worker no longer generates thumbnails directly. It calls the gRPC image service: "resize this image to 200x200."

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `grpc-image-service` | Python gRPC server. Accepts `ResizeImage(file_path, width, height)` RPC call. Returns resized image path. Instrumented with OpenTelemetry Python gRPC instrumentation. | Thumbnail generation is CPU-heavy. Extracting it into a separate service lets you scale it independently. From observability perspective: gRPC traces are structurally different from HTTP. gRPC uses HTTP/2, has different metadata propagation, different status codes (gRPC codes, not HTTP codes). Seeing both in Tempo side by side teaches you that observability adapts to protocol. |

**Why gRPC and not just another REST service?**
- Another REST service would produce traces identical to Express. Zero new learning.
- gRPC introduces: different span attributes (`rpc.system`, `rpc.service`, `rpc.method` instead of `http.method`, `http.route`), different status codes (gRPC `OK`/`INTERNAL`/`UNAVAILABLE` instead of HTTP 200/500/503), streaming potential (not used yet, but the trace structure supports it)
- In Tempo, gRPC spans look visibly different — you learn to read both

**Updated trace for file upload:**
- Nginx → Express API → RabbitMQ → Python Worker → gRPC Image Service → Python Worker updates PostgreSQL
- The trace now spans 6 services, two protocols (HTTP + gRPC), two runtimes, one async boundary

**What you observe at end of Phase 9:**
- Tempo trace waterfall shows gRPC spans with different attributes than HTTP spans
- gRPC service exposes its own metrics: RPC call count, duration, error rate by method
- If gRPC service is slow, the Python worker span shows it waiting — you see the bottleneck in the trace

**New concept:** Non-HTTP protocol tracing. Different span attributes, different status codes.

---

### Phase 10 — WebSocket — Long-Lived Connection Observability

**New containers:** WebSocket Notification Server (Node.js)
**Container count after phase:** 16

**What changes in existing services:** Python worker, after processing a file, publishes a "file.processed" event to RabbitMQ. WebSocket server subscribes to this event and pushes notification to connected clients.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `ws-notifications` | Node.js WebSocket server. Clients connect via `ws://`. Server subscribes to RabbitMQ "file.processed" events. When a file finishes processing, pushes JSON notification to all connected clients. Exposes metrics: `ws_active_connections` (gauge), `ws_messages_sent_total` (counter), `ws_connection_duration_seconds` (histogram). | Without this, users must poll `GET /files/:id` repeatedly to check if processing is done. WebSocket gives real-time push. From observability perspective: every service so far has a request/response cycle — a discrete action with start and end. WebSocket is a persistent connection. It stays open for minutes or hours. You need *gauge* metrics (current count) not just *counters* (total count). |

**Why WebSocket observability is fundamentally different:**
- REST API: every request is a trace. 100 requests = 100 traces. Counter metrics: total requests.
- WebSocket: one connection lasts 30 minutes. During that time, 15 messages are sent. No per-message trace (overhead would be absurd). Gauge metrics: current active connections.
- Different questions: not "how fast was the request?" but "how many connections are open right now?" and "what's the message delivery rate?"
- Failure mode is different: an API request fails and the client retries. A WebSocket drops and you lose the notification channel entirely. Connection drop rate becomes a critical metric.

**New Grafana dashboard:** "Real-Time Connections" — active connections gauge, message send rate, connection duration distribution, disconnect reasons.

**What you observe at end of Phase 10:**
- Open a WebSocket client (browser console or wscat), upload a file, see notification arrive
- Grafana shows connection count go from 0 → 1 when you connect
- Upload several files — message rate spikes in the dashboard
- Kill the WebSocket server — active connections drop to 0. Reconnection pattern visible in logs.

**New concept:** Long-lived connection observability. Gauge metrics vs counters. No per-request traces.

---

### Phase 11 — More Infrastructure — Search & Object Storage

**New containers:** Meilisearch, MinIO
**Container count after phase:** 18

**What changes in existing services:** Express API stores files in MinIO instead of local disk. File metadata indexed in Meilisearch for full-text search. New endpoint: `GET /files/search?q=invoice` returns matching files.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `meilisearch` | Full-text search engine. File metadata (filename, tags, description) indexed here. Search endpoint returns results ranked by relevance. Built-in metrics at `/metrics`. | PostgreSQL `LIKE '%invoice%'` is slow on large datasets. Meilisearch provides millisecond search with typo tolerance. From observability perspective: another infrastructure service with built-in metrics. Search latency percentiles, indexing throughput, document count. Different performance characteristics from a database — search engines have their own bottlenecks (indexing backlog, memory for ranking). |
| `minio` | S3-compatible object storage. Files stored as objects in a "filebox" bucket. Express API uses S3 SDK to upload/download. Built-in Prometheus metrics endpoint. | Local disk storage doesn't scale and has no redundancy. MinIO provides object storage with proper lifecycle management. From observability perspective: yet another infrastructure service with native metrics. Upload/download latency, storage capacity, object count, bandwidth. Different metric profile from a database or search engine. |

**Why add two services in one phase?**
- Both are infrastructure services with built-in Prometheus metrics endpoints. Both use the same observability pattern (scrape built-in endpoint, dashboard in Grafana). Adding them together avoids a phase that teaches nothing new. The learning in this phase is *breadth* — more dashboards, more metrics, more things to monitor — not a new concept.

**Updated trace for file upload:**
- Nginx → Express API → MinIO (store file) → RabbitMQ → Python Worker → gRPC Image Service → MinIO (store thumbnail) → Meilisearch (index metadata) → PostgreSQL (update row)

**What you observe at end of Phase 11:**
- Grafana has dashboards for Meilisearch and MinIO
- Trace shows MinIO upload/download as spans
- Search latency visible in Grafana — as document count grows, you can see if search slows down
- MinIO storage capacity trending — how fast are you filling up storage

**New concept:** Infrastructure breadth — multiple built-in metrics endpoints, no code instrumentation.

---

### Phase 12 — Batch Job — Ephemeral Container Observability

**New containers:** ETL Job (Python)
**Container count after phase:** 18+ (ETL job runs and exits, doesn't persist — but it's defined in compose)

**What changes in existing services:** None. This is a standalone container that runs, works, and exits.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `etl-daily-report` | Python script. Runs once (triggered by `docker compose run` or a scheduler). Queries PostgreSQL: counts files per user, calculates total storage per user, file type distribution. Writes summary to `daily_reports` table. Emits structured logs. Pushes metrics to OTel Collector. Exits with code 0 (success) or 1 (failure). | Daily analytics. In production, batch jobs generate reports, clean data, sync systems. From observability perspective: the container doesn't exist when you want to check on it. It ran at 2 AM and exited. Prometheus can't scrape it — it's gone. Logs must be pushed before exit, not pulled. Traces must be flushed before the process terminates. This is the **push vs pull dilemma** — the most common production issue with batch job observability. |

**Why ephemeral container observability is hard:**
- Prometheus pull model fails. Container exits before next scrape.
- Solution: push metrics to OTel Collector (which forwards to Prometheus via remote write) before exiting. OTel SDK must be configured with proper flush/shutdown.
- If the process crashes before flushing, you lose telemetry. You'll see this happen and learn why graceful shutdown matters.
- Docker container exit code becomes a signal: exit 0 = success, exit 1 = failure. This is observable via Docker daemon — Dozzle shows it.

**What you observe at end of Phase 12:**
- Run the ETL job manually. See its logs appear in Loki, trace appear in Tempo, metrics (records_processed, duration) pushed to Prometheus.
- Check Grafana 5 minutes later — the container is gone but its telemetry remains
- Deliberately cause a failure (bad SQL) — see exit code 1, error logs, truncated trace
- This teaches you: telemetry outlives the process that created it. That's the whole point.

**New concept:** Ephemeral container observability. Push vs pull telemetry. Graceful shutdown for telemetry flush.

---

### Phase 13 — Stream Processing — Continuous Throughput Monitoring

**New containers:** Stream Processor (Node.js)
**Container count after phase:** 19

**What changes in existing services:** Express API publishes "file.accessed" events to RabbitMQ whenever a file is downloaded. Stream processor consumes these events continuously.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `stream-trending` | Node.js service. Subscribes to RabbitMQ "file.accessed" events. Maintains rolling 1-hour window of access counts per file. Writes top-10 trending files to Redis every 30 seconds. New API endpoint `GET /files/trending` reads from Redis. Exposes metrics: `events_processed_total`, `processing_lag_seconds`, `window_size`. | Users want "trending files." Computing this on-demand from PostgreSQL is expensive. A stream processor maintains a running aggregate. From observability perspective: this service has no request/response cycle. It continuously consumes events. The key metrics are **throughput** (events per second), **lag** (how far behind the stream is), and **backpressure** (events arriving faster than processing). These are fundamentally different from REST API metrics. |

**Why stream processing observability is different:**
- REST API: idle = healthy, nobody is calling.
- Stream processor: idle = broken, events should be flowing.
- Key alert: processing lag increasing. If lag grows, the processor can't keep up — you need to scale it or optimize it.
- Throughput jitter: if events arrive in bursts (100 downloads in 1 second, then quiet for 30 seconds), you see spiky throughput. The processor must handle bursts without falling behind.

**What you observe at end of Phase 13:**
- Grafana dashboard: "Stream Processing" — throughput, lag, window size, trending files list
- Download files rapidly → see throughput spike → lag stays near zero (processor keeps up)
- Pause the stream processor → lag climbs visibly → resume → lag drops as it catches up (this is a backlog drain, visible in real-time)

**New concept:** Continuous throughput monitoring. Lag, backpressure, stream health — no request/response boundary.

---

### Phase 14 — Synthetic Monitoring — Outside-In Observability

**New containers:** Synthetic Monitor (Python)
**Container count after phase:** 20

**What changes in existing services:** None. This service only reads from other services.

**Service breakdown:**

| Service | What it does | Problem it solves |
|---------|-------------|-------------------|
| `synthetic-monitor` | Python script running in a loop. Every 30 seconds: hits health endpoints of every service (Nginx /health, Express /health, RabbitMQ /api/healthchecks, PostgreSQL TCP check, Redis PING, Meilisearch /health, MinIO /minio/health/live). Records response time and status for each. Exposes metrics: `health_check_status` (1 = up, 0 = down per service), `health_check_duration_seconds` (per service). | All previous monitoring is self-reported. Express says it's responding in 50ms — but is it? What if DNS resolution to Express takes 200ms from another container? Synthetic monitoring measures from the **client perspective**. It answers: "can I actually reach this service right now, and how long does it take?" This is the same concept as uptime monitoring (Pingdom, UptimeRobot) but internal. |

**Why this is the final phase:**
- Phases 1–13: each service reports about itself
- Phase 14: one service reports about everything else
- This closes the loop. You now have: internal telemetry (what the service says about itself) + external telemetry (what a client experiences). Discrepancy between the two means a network issue, DNS issue, or load balancer problem — invisible from inside the service.

**Final Grafana dashboard:** "System Health Overview" — grid of all services, green/red status, response time from monitor's perspective. This is the dashboard you open first during an incident.

**What you observe at end of Phase 14:**
- All green — everything healthy
- Kill one service — turns red within 30 seconds
- Network slow between containers — synthetic monitor shows high latency even though the service itself reports fast responses
- This is your "war room" dashboard

**New concept:** Outside-in health monitoring. Client-perspective latency. Discrepancy between self-reported and externally-observed health.

---

## Phase summary table

| Phase | New Containers | Running Total | Core Learning |
|-------|---------------|---------------|---------------|
| 1 | Express API, PostgreSQL, Grafana, Dozzle | 4 | Baseline app, raw logs, zero observability |
| 2 | OTel Collector, Loki | 6 | Structured logging pipeline |
| 3 | Prometheus | 7 | Metrics — system behavior as numbers |
| 4 | Tempo | 8 | Distributed tracing — request journey |
| 5 | RabbitMQ, Python Worker | 10 | Async trace propagation, multi-runtime logs |
| 6 | Nginx | 11 | Gateway tracing, access logs, perspective comparison |
| 7 | Redis, Redis Exporter | 13 | Infrastructure monitoring via exporter pattern |
| 8 | Cron Job | 14 | Periodic job observability, dead man's switch |
| 9 | gRPC Image Service | 15 | Non-HTTP protocol tracing |
| 10 | WebSocket Server | 16 | Long-lived connection observability, gauge metrics |
| 11 | Meilisearch, MinIO | 18 | Infrastructure breadth, built-in metrics |
| 12 | ETL Batch Job | 18+ | Ephemeral container, push vs pull telemetry |
| 13 | Stream Processor | 19 | Throughput, lag, backpressure monitoring |
| 14 | Synthetic Monitor | 20 | Outside-in health monitoring |

---

## Final service inventory (Phase 14 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Express API | Node.js / Express | File upload/download/list REST API |
| Python Worker | Python / pika | Async file processor — metadata extraction, thumbnail orchestration |
| gRPC Image Service | Python / gRPC | CPU-heavy image resizing, separate scalable unit |
| WebSocket Server | Node.js / ws | Real-time file processing notifications |
| Cron Cleanup | Node.js / node-cron | Periodic expired file cleanup and disk maintenance |
| Stream Processor | Node.js | Trending files — continuous event stream processing |
| ETL Daily Report | Python | Ephemeral batch job — daily storage analytics |
| Synthetic Monitor | Python | Outside-in health checking of all services |
| PostgreSQL | postgres:16 | Primary relational store — file metadata |
| Redis | redis:8.4 | File metadata cache |
| RabbitMQ | rabbitmq:management | AMQP message broker — file events |
| MinIO | minio | S3-compatible file storage |
| Meilisearch | meilisearch | Full-text file search |
| Nginx | nginx:alpine | API gateway, reverse proxy |
| Prometheus | prom/prometheus | Metrics storage and scraping |
| Grafana | grafana/grafana | Unified dashboards — logs + traces + metrics |
| OTel Collector | otel/opentelemetry-collector | Central signal ingestion and routing |
| Loki | grafana/loki | Log storage |
| Tempo | grafana/tempo | Trace storage |
| Dozzle | amir20/dozzle | Raw stdout tailing (dev only) |
| Redis Exporter | oliver006/redis_exporter | Redis metrics for Prometheus |

---

## Execution rules for Claude

When I start a new session with this file:

1. Read the **Current Status** section below — that is where we are
2. Do not re-explain completed steps unless I ask
3. Do not jump ahead of the current step
4. Each step produces:
   - `docker-compose.yml` (full file, all services to that point)
   - All application source files needed for that step
   - Any config files (prometheus.yml, otel-collector.yml, etc.)
   - A simple test command to verify the step is working
5. After completing a step, tell me exactly what to update in **Current Status**
6. One step at a time — do not combine steps unless I explicitly ask

---

## Current status

**Current step:** NOT STARTED — ready to begin Phase 1

**Completed steps:** None

**Last session summary:** Plan finalized. Ready to execute.

**Notes from last session:** None

---

## How to resume

Paste this entire file into a new conversation and say:

> "Resume from current status. Execute the next phase."

Or to jump to a specific phase:

> "Resume from current status. Execute Phase N."

Or to re-explain a completed phase:

> "Explain Phase N again before we continue."
