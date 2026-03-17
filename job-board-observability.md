# Observability Learning Plan — Job Board Platform

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
- **Alerting** — Alertmanager (active vs passive observability)

---

## The project — Job board platform

**One sentence:** Employer posts a job, system indexes it for search, applicant submits application with resume, resume is parsed asynchronously, employer gets notified.

This project was chosen because:
- Domain is instantly understandable
- File upload (resume) introduces MinIO naturally
- Resume parsing introduces a long-running async job — different from e-commerce's short-lived events
- Queue backlog has direct business meaning: unprocessed applications = delayed hiring pipeline
- Search is central to the domain — Meilisearch fits naturally from early stages

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
| Alertmanager | Active alert routing from Prometheus rules |

---

## Three ingestion models covered

| Model | Example in this plan |
|---|---|
| OTel push (SDK in app) | Node.js, Python, Go services push via OTLP to OTel Collector |
| Prometheus scrape via exporter sidecar | postgres-exporter, redis-exporter |
| Native Prometheus endpoint | RabbitMQ, MinIO, Meilisearch expose `/metrics` directly |

---

## All steps

### Phase 1 — Foundation (Steps 1–3)

**Step 1 — Node.js Express + Dozzle**
- Services: Job service (Node.js/Express), Dozzle
- Job service: `GET /jobs`, `GET /jobs/:id`, `POST /jobs` — hardcoded data, no DB yet
- Every request logged to stdout via structured logger (Pino)
- Dozzle tails raw stdout from all containers in browser UI
- New concept: raw container log visibility
- Why: before instrumenting anything you must see what the service is doing

**Step 2 — Add Prometheus**
- Services: + Prometheus
- Add `prom-client` to Node.js, expose `GET /metrics`
- Metrics: `http_requests_total`, `http_request_duration_seconds`, default Node.js metrics
- Prometheus scrapes `/metrics` every 15 seconds
- New concept: metrics scrape model, time-series data, counters vs histograms

**Step 3 — Add Grafana**
- Services: + Grafana
- Connect Grafana to Prometheus as data source
- Dashboard panels: job post rate, request latency p95, error rate, memory usage
- PromQL: `rate()`, `histogram_quantile()`, label filters
- New concept: PromQL, visual dashboards, time-range analysis

---

### Phase 2 — OTel Pipeline (Steps 4–6)

**Step 4 — Add OTel Collector + Loki**
- Services: + OTel Collector, + Loki
- Replace stdout logs with structured JSON logger sending via OTLP to OTel Collector
- Collector routes logs to Loki with labels: `{service="job-service", level="error"}`
- Grafana: add Loki data source, LogQL queries — `{service="job-service"} |= "error"`
- New concept: push-based structured logging, collector as central routing layer, LogQL

**Step 5 — Add Tempo**
- Services: + Tempo
- Enable tracing in OTel SDK — every HTTP request creates a root span
- Span contains: service name, HTTP method, URL, status, duration
- OTel Collector routes traces to Tempo
- Grafana: Tempo data source, trace search, span waterfall view
- New concept: distributed traces, spans, trace ID

**Step 6 — Correlate logs + traces in Grafana**
- Services: no new services
- Inject `traceId` and `spanId` into every log line via OTel SDK
- Grafana Loki derived field: `traceId` → clickable link to Tempo
- Tempo → Loki link: given trace ID, show all logs for that trace
- Navigation path: dashboard → spike → logs → click trace ID → span tree
- New concept: signal correlation — the core observability skill

---

### Phase 3 — Database Layer (Steps 7–8)

**Step 7 — Add PostgreSQL + postgres-exporter**
- Services: + PostgreSQL, + postgres-exporter
- Replace hardcoded job data with real PostgreSQL
- Tables: `jobs (id, employer_id, title, description, location, status, created_at)`
- postgres-exporter queries `pg_stat_*` tables, exposes Prometheus metrics
- Prometheus scrapes postgres-exporter — not PostgreSQL directly
- DB query spans in traces: HTTP span → DB query span
- Metrics: active connections, sequential scans (missing index signal), DB size, checkpoint time
- New concept: exporter sidecar pattern — second ingestion model

**Step 8 — Add Redis + redis-exporter**
- Services: + Redis, + redis-exporter
- Cache `GET /jobs` listing response in Redis with 30s TTL
- Cache `GET /jobs/:id` individual job page with 120s TTL
- redis-exporter exposes Redis `INFO` as Prometheus metrics
- Key demo: expire all Redis keys → watch cache miss spike AND PostgreSQL query rate spike simultaneously
- Metrics: hit/miss ratio, eviction count, memory usage, command latency
- New concept: cache-layer observability, two signals visibly relating to each other

---

### Phase 4 — File Storage + Search (Steps 9–10)

> **Why this order differs from e-commerce:**
> In the job board, file storage (resumes) and search (job listings) are more central to the core user journey than messaging. A job board without search or file upload is not really functional. Messaging comes after — once we have something worth processing asynchronously.

**Step 9 — Add MinIO**
- Services: + MinIO
- New endpoint: `POST /applications` — accepts multipart form with resume file
- Job service uploads resume to MinIO bucket `resumes` using `@aws-sdk/client-s3`
- Application record stored in PG: `applications (id, job_id, applicant_email, resume_key, status, created_at)`
- MinIO native Prometheus endpoint: `/minio/v2/metrics/cluster`
- Prometheus scrapes MinIO directly — no exporter needed
- OTel span wraps MinIO SDK call — trace shows: HTTP span → PG insert span → MinIO upload span
- Metrics: PUT/GET request count, error rate, bucket object count, storage bytes
- New concept: object storage observability, native Prometheus endpoint — third ingestion model

**Step 10 — Add Meilisearch**
- Services: + Meilisearch
- `GET /jobs?search=` routes to Meilisearch instead of PostgreSQL full scan
- `POST /jobs` now also indexes the new job into Meilisearch after PG insert
- Meilisearch native Prometheus endpoint
- Metrics: search latency histogram, index size, document count
- OTel span for Meilisearch call — trace shows: HTTP span → Meilisearch span
- Key demo: post 100 jobs → watch index document count grow in Grafana, search latency stay flat
- Alert: `index_docs_count < pg_jobs_count` — index out of sync with database
- New concept: search engine metrics — indexing lag, search latency percentiles, sync drift detection

---

### Phase 5 — Messaging + Async Processing (Steps 11–12)

**Step 11 — Add RabbitMQ**
- Services: + RabbitMQ
- When application is submitted: Job service publishes `application.submitted` event to RabbitMQ
- No consumer yet — queue accumulates messages intentionally
- RabbitMQ management plugin exposes native `/metrics` endpoint
- Prometheus scrapes RabbitMQ directly
- Metrics: queue depth, publish rate, consumer count, unacknowledged messages, DLQ depth
- Key demo: submit 20 applications → watch queue depth grow with no consumer
- New concept: queue depth as a signal, dead-letter queue depth as a failure indicator

**Step 12 — Add Python worker (resume parser)**
- Services: + Python worker
- Python worker consumes `application.submitted` queue using `aio-pika`
- For each message: downloads resume from MinIO, parses it (stub — extracts word count, page count), updates application status in PG to `parsed`
- OTel SDK in Python emits traces to OTel Collector
- Context propagation: Job service injects `traceparent` into RabbitMQ message headers
- Python worker reads `traceparent`, creates child span linked to same trace
- Trace result:
  ```
  Trace abc123
  ├── job-service: POST /applications (45ms)
  │   ├── postgres: INSERT applications (8ms)
  │   └── minio: PUT resumes/abc.pdf (18ms)
  └── python-worker: parse resume (120ms)
      ├── minio: GET resumes/abc.pdf (15ms)
      └── postgres: UPDATE application status (6ms)
  ```
- New concept: cross-service cross-language trace, W3C TraceContext propagation, async span linking

---

### Phase 6 — Multi-service (Steps 13–14)

**Step 13 — Add Application service (second Node.js service)**
- Services: + Application service (Node.js/Express)
- Dedicated Application service: `POST /applications`, `GET /applications/:id`, `GET /applications?job_id=`
- Job service calls Application service for application-related operations
- Both services instrumented with OTel
- Notification stub: Application service publishes `employer.notify` event to separate RabbitMQ queue after application submitted
- Tempo service map: `[job-service] → [application-service] → [rabbitmq] → [python-worker]`
- New concept: multi-service trace, service dependency map, service-to-service latency visibility

**Step 14 — Add nginx as API gateway**
- Services: + nginx
- nginx on port 80: routes `/jobs*` → Job service, `/applications*` → Application service
- Structured JSON access logs: timestamp, method, URI, status, upstream response time, request ID
- nginx logs → OTel Collector log receiver → Loki (`{service="nginx"}`)
- nginx-prometheus-exporter → Prometheus scrape
- Grafana: nginx upstream response time by service side by side — which service is slower?
- New concept: edge observability, client-facing latency vs service self-reported latency

---

### Phase 7 — Alerting (Step 15)

**Step 15 — Add Alertmanager + Prometheus rules**
- Services: + Alertmanager
- Prometheus alert rules:

| Alert | Condition | Duration | Severity |
|---|---|---|---|
| HighApplicationErrorRate | `rate(http_requests_total{status=~"5.."}[5m]) > 0.05` | 2m | critical |
| ResumeQueueBacklog | `rabbitmq_queue_messages_ready{queue="application.submitted"} > 500` | 5m | warning |
| ResumeParserDown | `up{job="python-worker"} == 0` | 1m | critical |
| SearchIndexDrift | `meilisearch_index_docs_count < pg_jobs_count * 0.95` | 10m | warning |
| MinIODiskHigh | `minio_node_disk_used_bytes / minio_node_disk_total_bytes > 0.85` | 5m | warning |
| PostgreSQLConnectionsHigh | `pg_stat_activity_count > 80` | 2m | critical |
| SlowJobSearch | `p95 search latency > 500ms` | 5m | warning |

- Alertmanager: groups alerts, routes critical → webhook stub
- Grafana: alert annotations on dashboards — vertical red lines at alert fire time
- New concept: active alerting, alert grouping, silence, inhibition

---

### Phase 8 — Breadth Expansion (Steps 16–18)

**Step 16 — Add Go recommendation service**
- Services: + Recommendation service (Go)
- Endpoints: `GET /recommendations?job_id=` — returns similar jobs based on title/location
- Algorithm stub: queries Meilisearch for similar job titles, returns top 5
- Job service calls Recommendation service on `GET /jobs/:id` response
- OTel SDK in Go: `go.opentelemetry.io/otel`, `otelhttp` middleware
- Same OTel Collector receives Go traces — no new collector config
- Custom metrics: `recommendation_latency_seconds`, `recommendation_results_count` histogram
- Trace: nginx → Job service → Recommendation service → Meilisearch (three languages in one trace)
- New concept: OTel language independence — Node.js, Python, Go all in one pipeline

**Step 17 — Add Notification service (third Node.js service)**
- Services: + Notification service (Node.js/Express)
- Consumes `employer.notify` queue from RabbitMQ
- Sends email notification stub (logs the action, does not actually send)
- Tracks: notification sent count, failed count, retry count
- Custom metrics: `notifications_sent_total{channel="email"}`, `notification_failures_total`
- OTel traces: Application service → RabbitMQ → Notification service — full application journey in one trace
- New concept: fan-out trace pattern — one user action triggers multiple async downstream services visible in one trace

**Step 18 — Add scheduler/cron job**
- Services: + Scheduler service (Node.js with `node-cron`)
- Three jobs:

| Job | Schedule | Action |
|---|---|---|
| Expire old job posts | Every 5 min (simulated daily) | Query PG for jobs older than 30 days → set status to `expired` → remove from Meilisearch index |
| Resume parse retry | Every 3 min | Check PG for applications stuck in `pending` > 10 min → republish to RabbitMQ |
| Application summary report | Every 2 min (simulated daily) | Count applications per job → write JSON summary to MinIO |

- Custom metrics per job: `job_last_success_timestamp_seconds`, `job_duration_seconds`, `job_runs_total{status="success|failure"}`
- Alert: `time() - job_last_success_timestamp_seconds{job="expire-jobs"} > 600` — missed run
- Alert: `job_runs_total{status="failure"} > 3` — repeated failure
- New concept: job-based observability, absence-of-success as the alert signal

---

## Final service inventory (Step 18 complete state)

| Service | Language/Tech | Role |
|---|---|---|
| Job service | Node.js / Express | Job CRUD, search via Meilisearch |
| Application service | Node.js / Express | Application submission, status tracking |
| Notification service | Node.js / Express | Employer email notification stub |
| Scheduler service | Node.js / node-cron | Background jobs — expiry, retry, reporting |
| Python worker | Python / aio-pika | Async resume parser |
| Recommendation service | Go | Similar job recommendations |
| PostgreSQL | postgres:16 | Primary relational store |
| Redis | redis:8.4 | Job listing cache |
| RabbitMQ | rabbitmq:management | AMQP message broker |
| MinIO | minio | Resume and report file storage |
| Meilisearch | meilisearch | Full-text job search |
| nginx | nginx:alpine | API gateway, reverse proxy |
| Prometheus | prom/prometheus | Metrics storage and alert evaluation |
| Alertmanager | prom/alertmanager | Alert routing and grouping |
| Grafana | grafana/grafana | Unified dashboards |
| OTel Collector | otel/opentelemetry-collector | Central signal ingestion and routing |
| Loki | grafana/loki | Log storage |
| Tempo | grafana/tempo | Trace storage |
| Dozzle | amir20/dozzle | Raw stdout tailing (dev only) |
| postgres-exporter | — | PG metrics for Prometheus |
| redis-exporter | — | Redis metrics for Prometheus |

---

## What this project teaches that e-commerce does not

| Concept | How job board teaches it differently |
|---|---|
| Long-running async jobs | Resume parsing takes seconds not milliseconds — different latency profile |
| File upload tracing | MinIO span appears mid-request before async processing begins |
| Index sync alerting | Meilisearch doc count vs PG row count — practical drift detection |
| Retry pattern observability | Stuck applications republished — DLQ + scheduler working together |
| Fan-out trace | One application triggers: parser + notifier in parallel — visible in Tempo |

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

**Current step:** NOT STARTED — ready to begin Step 1

**Completed steps:** None

**Last session summary:** Plan finalized. Ready to execute.

**Notes from last session:** None

---

## How to resume

Paste this entire file into a new conversation and say:

> "Resume from current status. Execute the next step."

Or to jump to a specific step:

> "Resume from current status. Execute Step N."

Or to re-explain a completed step:

> "Explain Step N again before we continue."
