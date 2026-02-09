# LINE Notification Integration Design

**Date:** 2026-02-09
**Status:** Approved

## Overview

Add LINE notification support to Alaska Bot while maintaining existing Slack functionality. Users can independently enable/disable each notification channel via environment variables.

## Requirements

1. Support LINE push notifications using LINE Messaging API
2. Maintain backward compatibility with existing Slack notifications
3. Allow enabling/disabling each notification channel independently via ENV
4. Use unified plain text message format for simplicity
5. Based on proven implementation from jcb-easy-card-bot

## Architecture

### Components

```
alaska-bot/
├── line.js          # NEW: LINE Push Message API client
├── notify.js        # NEW: Unified notification manager
├── slack.js         # MODIFIED: Refactor to use native https (match line.js interface)
├── index.js         # MODIFIED: Replace slack.send() with notify.send()
└── .env             # MODIFIED: Add LINE settings
```

### Notification Flow

```
index.js → notify.send(message)
             ├─→ line.send(message)   [if ENABLE_LINE_NOTIFY=true]
             └─→ slack.send(message)  [if ENABLE_SLACK_NOTIFY=true]
```

## Implementation Details

### 1. LINE Module (`line.js`)

**API Endpoint:** `https://api.line.me/v2/bot/message/push`

**Authentication:** Bearer token (LINE Channel Access Token)

**Payload Format:**
```json
{
  "to": "U1234567890abcdef1234567890abcdef",
  "messages": [
    { "type": "text", "text": "notification message" }
  ]
}
```

**Implementation:**
- Use Node.js native `https` module
- Match jcb-easy-card-bot implementation exactly

**Error Handling:**
- Silent skip if token/userId not configured (return resolved Promise)
- Log errors to console
- Do not interrupt program execution

### 2. Notification Manager (`notify.js`)

**Responsibilities:**
- Provide unified `send(message)` interface
- Dispatch to enabled channels in parallel
- Isolate errors per channel using `Promise.allSettled`

**Key Design:**
```javascript
async function send(message) {
  const promises = [];

  if (config.enableLineNotify) {
    promises.push(
      line.send(message).catch((err) => {
        console.error('[通知錯誤] LINE 發送失敗:', err.message);
      })
    );
  }

  if (config.enableSlackNotify) {
    promises.push(
      slack.send(message).catch((err) => {
        console.error('[通知錯誤] Slack 發送失敗:', err.message);
      })
    );
  }

  await Promise.allSettled(promises);
}
```

### 3. Slack Module Refactor (`slack.js`)

**Changes:**
- Remove `slack-notify` dependency
- Implement using native `https` module (match line.js structure)
- Maintain same `send(message)` interface
- Keep existing webhook URL configuration

**Before:**
```javascript
const SlackNotify = require('slack-notify');
const slack = SlackNotify(process.env.MY_SLACK_WEBHOOK_URL);
module.exports = { slack };
```

**After:**
```javascript
const https = require('https');
function send(message) { /* ... */ }
module.exports = { send };
```

### 4. Main Program Changes (`index.js`)

**Modification Points:**

1. **Line 20 - Import statement:**
   ```javascript
   // Old: const { slack } = require('./slack');
   // New: const notify = require('./notify');
   ```

2. **Line 118 - Server startup notification:**
   ```javascript
   // Old: server.listen(process.env.PORT, () => slack.send('Start !'));
   // New: server.listen(process.env.PORT, () => notify.send('Start !'));
   ```

3. **Line 64 - Flight notification:**
   ```javascript
   // Old: slack.send(message);
   // New: notify.send(message);
   ```

## Environment Variables

### New Configuration

```bash
# Notification Channel Control
ENABLE_LINE_NOTIFY=true          # Enable LINE notifications
ENABLE_SLACK_NOTIFY=true         # Enable Slack notifications

# LINE Configuration
LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
LINE_USER_ID=U1234567890abcdef1234567890abcdef

# Slack Configuration (existing)
MY_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

### Backward Compatibility

**Design Decisions:**
- If `MY_SLACK_WEBHOOK_URL` is set but `ENABLE_SLACK_NOTIFY` is not, default to `true` (backward compatible)
- If LINE token and userId are set but `ENABLE_LINE_NOTIFY` is not, default to `false` (opt-in)
- Existing users upgrading will see no behavior change

### Updated `.env.example`

```bash
HEADLESS=true
PORT=8080
NODE_ENV=development
REDIS_URL=redis://localhost:6379
CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Notification Settings
ENABLE_LINE_NOTIFY=true
ENABLE_SLACK_NOTIFY=true

# LINE Configuration
LINE_CHANNEL_ACCESS_TOKEN=
LINE_USER_ID=

# Slack Configuration
MY_SLACK_WEBHOOK_URL=
```

## Error Handling Flow

```
notify.send(message)
  ├─→ line.send(message)
  │   ├─ Success: return resolved promise
  │   ├─ Not configured: return resolved promise (silent skip)
  │   └─ Failure: catch error, log to console, return resolved promise
  │
  └─→ slack.send(message)
      ├─ Success: return resolved promise
      ├─ Not configured: return resolved promise (silent skip)
      └─ Failure: catch error, log to console, return resolved promise
```

**Key Principle:** One channel failure does not affect other channels or program execution.

## Testing Plan

### Test Scenarios

1. **LINE only** - `ENABLE_LINE_NOTIFY=true`, `ENABLE_SLACK_NOTIFY=false`
   - Verify messages arrive only at LINE

2. **Slack only** - `ENABLE_LINE_NOTIFY=false`, `ENABLE_SLACK_NOTIFY=true`
   - Verify backward compatibility

3. **Both enabled** - Both set to `true`
   - Verify both channels receive messages

4. **Error handling** - Use invalid LINE token
   - Verify program continues, Slack still works

5. **No configuration** - Neither channel configured
   - Verify program runs normally with console logs only

### Test Notifications

- Server start: "Start !"
- Flight found: Multi-line flight details with link
- No flights: (no notification sent)

## Implementation Steps

1. Create `line.js` module
2. Create `notify.js` module
3. Refactor `slack.js` to use native https
4. Update `index.js` notification calls
5. Update `.env` and `env.example`
6. Remove `slack-notify` from `package.json` dependencies
7. Local testing of all scenarios
8. Update README documentation

## Dependencies

### To Add
- None (using Node.js native modules only)

### To Remove
- `slack-notify` (replaced with native https implementation)

## LINE API Reference

- **Endpoint:** `https://api.line.me/v2/bot/message/push`
- **Method:** POST
- **Headers:**
  - `Content-Type: application/json`
  - `Authorization: Bearer {channelAccessToken}`
- **Docs:** https://developers.line.biz/en/reference/messaging-api/#send-push-message

## LINE Setup Requirements

To use LINE notifications, users need to:

1. Create a LINE Bot in LINE Developers Console
2. Get Channel Access Token from the bot settings
3. Get their LINE User ID (can use LINE Bot to obtain)
4. Add the bot as friend and allow messages

## Benefits

1. **Flexibility** - Choose notification channels per environment
2. **Reliability** - Multiple channels reduce notification failure risk
3. **Simplicity** - Plain text messages, no complex formatting
4. **Maintainability** - Unified interface, native modules only
5. **Backward Compatible** - Existing Slack setups continue to work
6. **Proven Design** - Based on successful jcb-easy-card-bot implementation

## Message Format

All notifications use plain text format (no special formatting):

```
Start !
```

```
[2026-03-15 TPE => NRT]:
Flight: AS123
Miles:
Economy: 15000 miles 5 USD
Business: 25000 miles 10 USD
Link: https://www.alaskaair.com/search/results?...
```

This consistent format works well on both LINE and Slack without special handling.
