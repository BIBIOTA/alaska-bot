# Batch Notifications by Route

## Problem

Each schedule triggers its own notification. More schedules = more messages, creating noise.

## Design

### Core Change

Instead of notifying per-schedule, collect all results from a cron run, group by route, and send one message per route.

### Rules

- Group by route key (`${departure}-${arrival}`)
- Fixed date and flexible date schedules are grouped separately
- Only dates with matching flights are included in the message
- Routes with zero results send no notification
- Error notifications remain per-schedule (unchanged)

### Message Format (Fixed Date)

```
[SEA → LAX] 找到符合條件航班：

📅 2026-03-25
  AS123 | Economy: 15,000 miles +$5
  AS456 | Business: 25,000 miles +$10

📅 2026-03-28
  AS789 | Economy: 12,500 miles +$6

🔗 https://www.alaskaair.com/search/results?...
```

### Message Format (Flexible Date)

```
[Flexible SEA → LAX] 找到符合條件日期：

📅 2026-03-20 ~ 2026-03-31
  03/22: 12.5k miles +$6
  03/24: 15k miles +$6

📅 2026-04-01 ~ 2026-04-15
  04/03: 10k miles +$5

🔗 https://www.alaskaair.com/search/calendar?...
```

### Implementation Scope

1. **`alaska.js`** — `checkAlaskaSchedules()` and `checkAlaskaFlexibleDates()` return result objects instead of calling `notify.send()` internally
2. **`index.js`** — Cron job collects results, groups by route key, formats messages, calls `notify.send()` per route group
3. **`notify.js` / `line.js` / `slack.js`** — No changes needed

### Data Flow

```
Before: schedule → scrape → notify.send() (per schedule)
After:  schedule → scrape → return results → group by route → notify.send() (per route)
```
