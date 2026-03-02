# Docker Compose Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace PM2 with Docker Compose to run alaska-bot + Redis with automatic restart on reboot.

**Architecture:** Two-service Docker Compose setup. alaska-bot uses existing Dockerfile, Redis uses `redis:7-alpine` with a named volume for persistence. Docker-specific env vars (REDIS_URL, CHROME_EXECUTABLE_PATH) are overridden in `docker-compose.yml` so `.env` stays unchanged for secrets.

**Tech Stack:** Docker Compose, existing Dockerfile (Node 18 + Chromium), Redis 7

---

### Task 1: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Step 1: Create the compose file**

```yaml
services:
  alaska-bot:
    build: .
    ports:
      - "8080:8080"
    depends_on:
      redis:
        condition: service_started
    restart: unless-stopped
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
      - CHROME_EXECUTABLE_PATH=/usr/bin/chromium
      - HEADLESS=true
      - PORT=8080
      - NODE_ENV=production

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

Key design notes for the implementing engineer:
- `env_file: .env` loads secrets (LINE token, Slack webhook, etc.)
- `environment` block **overrides** `.env` values for Docker-specific settings
- This means `.env` does NOT need editing — it keeps working for local dev too
- Redis has NO exposed ports — only reachable within Docker network
- `redis-data` named volume persists data across container restarts
- `HEADLESS=true` is required because there's no display inside the container

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for bot + Redis"
```

---

### Task 2: Stop PM2 and start Docker Compose

**Step 1: Stop alaska-bot in PM2**

```bash
pm2 stop alaska-bot
```

We stop (not delete) first, so we can fall back if Docker doesn't work.

**Step 2: Build and start Docker Compose**

```bash
cd /Users/yuki/projects/alaska-bot
docker compose up -d --build
```

Expected: Both `alaska-bot` and `redis` containers start. Check with:

```bash
docker compose ps
```

Expected output: two services, both "Up".

**Step 3: Check logs for successful startup**

```bash
docker compose logs alaska-bot --tail 20
```

Expected: See `Connected to Redis` and `[LINE] Start !` / `[Slack] Start !` messages.

---

### Task 3: Verify services are working

**Step 1: Verify API responds**

```bash
curl http://localhost:8080/
```

Expected: `{"message":"Hello world"}`

**Step 2: Verify Redis is connected by adding a test schedule**

```bash
curl -X POST http://localhost:8080/alaska \
  -H "Content-Type: application/json" \
  -d '{"departureDate":"2026-12-25","departure":"TPE","arrival":"KIX","maxMiles":50000,"cabinClass":"economy","airlines":["CX"]}'
```

Expected: `{"status":"success","message":"Add Alaska schedule. Expired in ...`

**Step 3: Verify Redis has the data**

```bash
docker compose exec redis redis-cli KEYS "alaska:*"
```

Expected: Shows the key we just added, e.g. `alaska:schedules:20261225:TPE:KIX`

**Step 4: Clean up test data**

```bash
docker compose exec redis redis-cli DEL "alaska:schedules:20261225:TPE:KIX"
```

---

### Task 4: Clean up PM2

**Step 1: Delete alaska-bot from PM2**

```bash
pm2 delete alaska-bot
pm2 save
```

**Step 2: Verify PM2 no longer manages alaska-bot**

```bash
pm2 list
```

Expected: alaska-bot is no longer listed (or list is empty except jcb-bot).

**Step 3: Final commit — update .gitignore if needed**

No changes needed. `docker-compose.yml` should be tracked. `.env` is already in `.gitignore`.

---

### Task 5: Add re-add existing schedules (if any needed)

**Step 1: Check with user if they have schedules to re-add**

Since the old Redis was not running, existing schedules were lost. Ask user if they want to add any schedules via the API now that the system is working.

This is an optional manual step — not a code change.
