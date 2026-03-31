# Project Structure — Appendix

---

## Development vs Production Philosophy

This project uses a **split compose architecture** during development and a **single compose file** for production.

The core idea:

- During development, each concern is isolated in its own compose file. Start, stop, and rebuild any layer without touching the others.
- After development, one single `docker-compose.prod.yml` runs the entire system. One command, everything up.

---

## Development — Multiple Compose Files, Single Responsibility Each

During development the system is split into four compose files. Each file owns exactly one concern.

| File | Owns | When to restart |
|---|---|---|
| `dev/docker-compose.network.yml` | Creates `ecommerce-network` bridge network + nginx gateway placeholder | Almost never — only if network is deleted |
| `dev/docker-compose.infra.yml` | Observability tools — Dozzle, Prometheus, Grafana, Loki, Tempo, OTel Collector, Alertmanager | When adding a new observability tool |
| `dev/docker-compose.dev.yml` | Application dev containers — Node.js, Python, Go (git clone + run inside container) | When adding a new service |
| `dev/docker-compose.k6.yml` | k6 load runner — profile-gated, runs and exits | When running load tests |

### Key Properties of the Dev Setup

- All four files attach to the same external network `ecommerce-network`
- Containers resolve each other by service name across files because they share the network
- The Node.js dev container clones code from GitHub on startup — no local Node.js installation needed on the host machine
- VS Code Remote - Containers attaches directly to the running dev container — write code inside the container
- k6 uses `profiles: [load]` — never starts on `docker compose up`, only starts on an explicit `run` command

---

## Development Startup Order

**Always start in this exact order.** The network must exist before any other container starts. If you start infra or dev before the network file, Docker will create isolated default networks per project and containers will not see each other.

```bash
# Step 1 — network first, always
docker compose -f dev/docker-compose.network.yml up -d

# Step 2 — observability tools
docker compose -f dev/docker-compose.infra.yml up -d

# Step 3 — application dev containers
docker compose -f dev/docker-compose.dev.yml up -d

# Step 4 — run a k6 scenario (on demand, not always-on)
docker compose -f dev/docker-compose.k6.yml --profile load run --rm k6 run /scripts/baseline.js
```

### Shutdown Order (always reverse of startup)

```bash
docker compose -f dev/docker-compose.dev.yml down
docker compose -f dev/docker-compose.infra.yml down
docker compose -f dev/docker-compose.network.yml down
```

> **Important:** Always bring down dev and infra before bringing down the network file.
> Docker refuses to delete a network that still has active container endpoints attached to it.
> If you run `docker-compose.network.yml down` while dev containers are still running, Docker will throw an error and the network will not be removed.

---

## Why the Network File Exists Separately

Docker Compose automatically creates a default network per project. The network name is derived from the `name:` field in each compose file. When you have multiple compose files with different `name:` values, each gets its own isolated default network — containers in different files cannot see each other by default.

The `docker-compose.network.yml` file solves this by:

1. Creating one explicitly named bridge network: `ecommerce-network`
2. All other compose files declare this network as `external: true` — meaning "this network already exists externally, do not create a new one, just attach to it"
3. The nginx `gateway` container acts as the anchor — it keeps the network alive even when dev or infra containers are stopped and restarted

**Result:** `product-service` (started by dev file), `dozzle` (started by infra file), and `k6` (started by k6 file) all resolve each other by container name, because all three are attached to `ecommerce-network`.

### What `external: true` Means

Every compose file except the network file ends with this block:

```yaml
networks:
  ecommerce-network:
    external: true
```

This tells Docker Compose:
- Do not create this network
- Do not manage this network lifecycle
- Just attach new containers to the already-existing network named `ecommerce-network`
- If the network does not exist yet, fail with an error (which is intentional — it reminds you to start the network file first)

---

## Production — One Single Compose File

After development is complete for a step, `docker-compose.prod.yml` is updated to reflect the full working system at that point.

### Properties of the Prod File

- Defines `ecommerce-network` internally — no `external: true`, no separate network file needed
- All services built from their `Dockerfile` — no git clone, no bind mounts, no `tail -f /dev/null`
- No Dozzle — it is a dev-only raw log viewer, not needed in production
- No k6 — load testing is not part of the production runtime
- Single command to bring up the entire system:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- Single command to tear it down:

```bash
docker compose -f docker-compose.prod.yml down
```

---

## How Dev and Prod Stay in Sync

At the end of each learning step:

1. Code is written and tested inside the dev container (VS Code attached)
2. Code is committed and pushed to the GitHub repository
3. `docker-compose.prod.yml` is updated to include the new service using its Dockerfile build
4. `docker compose -f docker-compose.prod.yml up -d --build` is run to verify the prod build works end to end

The `Dockerfile` is the contract between dev and prod:

| | Dev | Prod |
|---|---|---|
| Code source | `git clone` on container startup | `COPY` baked into image at build time |
| Dependencies | `npm install` on container startup | `RUN npm install` baked into image at build time |
| Start command | `node src/index.js` via compose `command:` | `CMD ["node", "src/index.js"]` in Dockerfile |
| Image | Base `node:25.2.1-bookworm-slim` pulled from registry | Custom image built from Dockerfile |
| Rebuild needed | No — restart container, it re-clones | Yes — `docker compose up --build` |

Same code, same Node.js version, different execution model.

---

## Directory Layout

This is the final state after all 22 steps are complete. Each entry notes which step introduced it.

```
ecommerce-observability/
│
├── docker-compose.prod.yml                  ← single file, entire system, run and done
│
├── dev/
│   ├── docker-compose.network.yml           ← owns ecommerce-network + gateway placeholder
│   ├── docker-compose.infra.yml             ← observability tools (grows per step)
│   ├── docker-compose.dev.yml               ← app dev containers (grows per step)
│   └── docker-compose.k6.yml                ← k6 load runner
│
├── services/
│   ├── product-service/                     ← Step 1
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js
│   ├── order-service/                       ← Step 13
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js
│   ├── inventory-service/                   ← Step 19 (Go — multi-stage build)
│   │   ├── Dockerfile
│   │   └── main.go
│   ├── scheduler-service/                   ← Step 20
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js
│   └── python-worker/                       ← Step 12
│       ├── Dockerfile
│       └── worker.py
│
├── observability/
│   ├── prometheus/
│   │   └── prometheus.yml                   ← Step 2
│   ├── otel-collector/
│   │   └── otel-collector.yml               ← Step 5
│   ├── loki/
│   │   └── loki.yml                         ← Step 6
│   ├── tempo/
│   │   └── tempo.yml                        ← Step 7
│   ├── grafana/
│   │   ├── provisioning/
│   │   │   ├── datasources/                 ← Step 3
│   │   │   └── dashboards/                  ← Step 3
│   │   └── dashboards/                      ← Step 3
│   ├── alertmanager/
│   │   └── alertmanager.yml                 ← Step 16
│   └── nginx/
│       └── nginx.conf                       ← Step 14
│
└── k6/
    └── scripts/
        ├── baseline.js                      ← Step 1
        ├── read_spike.js                    ← Step 1
        ├── write_storm.js                   ← Step 1
        ├── error_gen.js                     ← Step 1
        ├── mixed_realistic.js               ← Step 1
        ├── order_flow.js                    ← Step 13
        ├── order_burst.js                   ← Step 13
        ├── order_errors.js                  ← Step 13
        ├── search_traffic.js                ← Step 18
        ├── search_spike.js                  ← Step 18
        └── stock_depletion.js               ← Step 19
```

---

## Idempotency Guarantee

Every compose file in this project is idempotent.

**What idempotent means here:** Running `docker compose up -d` twice produces the same result as running it once. The second run is always safe.

Specific guarantees:

- If a container is already running and its config has not changed, Docker skips it — no restart, no downtime
- If a config file or environment variable changed, Docker recreates only the affected container — everything else stays running
- The network file can be run repeatedly — Docker skips network creation if `ecommerce-network` already exists
- `--build` on the prod file rebuilds images only when the Dockerfile or source files have changed (layer cache)

**The one non-idempotent operation to avoid:**

Running `docker-compose.network.yml down` while dev or infra containers are still attached to `ecommerce-network`. Docker will refuse to delete the network and return an error. Always follow the shutdown order: dev down → infra down → network down.

---

## Quick Reference — All Commands

```bash
# ── DEVELOPMENT ──────────────────────────────────────────────

# Start everything (in order)
docker compose -f dev/docker-compose.network.yml up -d
docker compose -f dev/docker-compose.infra.yml up -d
docker compose -f dev/docker-compose.dev.yml up -d

# Stop everything (in reverse order)
docker compose -f dev/docker-compose.dev.yml down
docker compose -f dev/docker-compose.infra.yml down
docker compose -f dev/docker-compose.network.yml down

# Restart a single service (e.g. after changing env var)
docker compose -f dev/docker-compose.dev.yml restart product-service

# Run a k6 scenario
docker compose -f dev/docker-compose.k6.yml --profile load run --rm k6 run /scripts/baseline.js

# Attach VS Code to dev container
# VS Code → Remote Explorer → Containers → product-service → Attach

# ── PRODUCTION ───────────────────────────────────────────────

# Start entire system
docker compose -f docker-compose.prod.yml up -d --build

# Stop entire system
docker compose -f docker-compose.prod.yml down

# Rebuild and restart a single service
docker compose -f docker-compose.prod.yml up -d --build product-service
```
