# Docker Compose Migration Design

**Date:** 2026-03-02
**Status:** Approved

## Problem

alaska-bot runs via PM2 on macOS with no Redis running, causing `ECONNREFUSED` errors. The schedule management feature is broken. The setup uses two separate management tools (PM2 for Node, Docker for other services) and lacks automatic recovery on reboot.

## Goal

1. Stable local operation with automatic recovery on reboot
2. Full Docker Compose setup (bot + Redis) replacing PM2

## Architecture

```
docker-compose.yml
├── alaska-bot (Node.js + Chromium)
│   ├── build from existing Dockerfile
│   ├── depends_on: redis
│   ├── restart: unless-stopped
│   ├── env_file: .env
│   └── ports: 8080:8080
│
└── redis (redis:7-alpine)
    ├── restart: unless-stopped
    ├── volume: redis-data (persistent)
    └── internal network only (no exposed ports)
```

## Key Decisions

- **Redis data persistence**: Docker volume mounted at `/data` to survive container restarts
- **Redis not exposed**: Only accessible within Docker internal network via `redis://redis:6379`
- **Env adjustment**: `REDIS_URL` changes to Docker internal address, `CHROME_EXECUTABLE_PATH` to `/usr/bin/chromium`
- **PM2 retired**: After successful Docker migration, remove alaska-bot from PM2

## Migration Steps

1. Create `docker-compose.yml` in project root
2. Adjust `.env` for Docker environment (Redis URL, Chrome path)
3. `docker compose up -d` to start services
4. Verify: API responds, Redis connected, cron job runs
5. `pm2 delete alaska-bot` to clean up PM2

## Notes

- Existing Dockerfile already installs Chromium — no changes needed
- `restart: unless-stopped` ensures Docker Desktop auto-recovers services on macOS reboot
- Redis volume prevents schedule data loss on container restart
