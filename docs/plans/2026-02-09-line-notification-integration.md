# LINE Notification Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add LINE notification support to Alaska Bot alongside existing Slack notifications with independent channel control.

**Architecture:** Create unified notification manager (notify.js) that dispatches to LINE (line.js) and refactored Slack (slack.js) modules. Both use native https for consistency. Environment variables control which channels are active.

**Tech Stack:** Node.js native https module, LINE Messaging API, dotenv

---

## Task 1: Create LINE Module

**Files:**
- Create: `line.js`

**Step 1: Create LINE module with send function**

Create `line.js`:

```javascript
require('dotenv').config();
const https = require('https');

function send(message) {
  console.log(`[LINE] ${message}`);

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineUserId = process.env.LINE_USER_ID;

  if (!lineToken || !lineUserId) {
    return Promise.resolve();
  }

  const payload = JSON.stringify({
    to: lineUserId,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.line.me',
        path: '/v2/bot/message/push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lineToken}`,
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { send };
```

**Step 2: Verify file created**

Run: `cat line.js | head -20`
Expected: File content displayed

**Step 3: Commit**

```bash
git add line.js
git commit -m "feat: add LINE notification module

Implement LINE Messaging API push notification client using native
https module. Silently skips if credentials not configured.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Refactor Slack Module

**Files:**
- Modify: `slack.js`

**Step 1: Rewrite slack.js to use native https**

Replace entire contents of `slack.js`:

```javascript
require('dotenv').config();
const https = require('https');

function send(message) {
  console.log(`[Slack] ${message}`);

  const webhookUrl = process.env.MY_SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return Promise.resolve();
  }

  const url = new URL(webhookUrl);
  const payload = JSON.stringify({ text: message });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { send };
```

**Step 2: Verify file updated**

Run: `cat slack.js`
Expected: New implementation with native https

**Step 3: Commit**

```bash
git add slack.js
git commit -m "refactor: migrate Slack to native https

Replace slack-notify dependency with native https implementation to
match line.js interface and remove external dependency.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 3: Create Unified Notification Manager

**Files:**
- Create: `notify.js`

**Step 1: Create notify.js with unified send interface**

Create `notify.js`:

```javascript
require('dotenv').config();
const slack = require('./slack');
const line = require('./line');

function shouldEnableSlack() {
  const enableSlackNotify = process.env.ENABLE_SLACK_NOTIFY;
  const webhookUrl = process.env.MY_SLACK_WEBHOOK_URL;

  // Backward compatibility: if webhook is set but ENABLE_SLACK_NOTIFY is not set, enable Slack
  if (enableSlackNotify === undefined && webhookUrl) {
    return true;
  }

  return enableSlackNotify === 'true';
}

function shouldEnableLine() {
  const enableLineNotify = process.env.ENABLE_LINE_NOTIFY;

  // Opt-in: LINE is only enabled if explicitly set to true
  return enableLineNotify === 'true';
}

async function send(message) {
  const promises = [];

  if (shouldEnableLine()) {
    promises.push(
      line.send(message).catch((err) => {
        console.error('[通知錯誤] LINE 發送失敗:', err.message);
      })
    );
  }

  if (shouldEnableSlack()) {
    promises.push(
      slack.send(message).catch((err) => {
        console.error('[通知錯誤] Slack 發送失敗:', err.message);
      })
    );
  }

  await Promise.allSettled(promises);
}

module.exports = { send };
```

**Step 2: Verify file created**

Run: `cat notify.js`
Expected: File content with send function and channel logic

**Step 3: Commit**

```bash
git add notify.js
git commit -m "feat: add unified notification manager

Create notify.js to manage LINE and Slack notifications with
independent channel control. Includes backward compatibility for
existing Slack setups.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 4: Update Main Program

**Files:**
- Modify: `index.js:20` (import)
- Modify: `index.js:64` (flight notification)
- Modify: `index.js:118` (startup notification)

**Step 1: Update import statement (line 20)**

Change line 20 from:
```javascript
const { slack } = require('./slack');
```

To:
```javascript
const notify = require('./notify');
```

**Step 2: Update flight notification (line 64)**

Change line 64 from:
```javascript
slack.send(message);
```

To:
```javascript
notify.send(message);
```

**Step 3: Update startup notification (line 118)**

Change line 118 from:
```javascript
server.listen(process.env.PORT, () => slack.send('Start !'));
```

To:
```javascript
server.listen(process.env.PORT, () => notify.send('Start !'));
```

**Step 4: Verify changes**

Run: `grep -n "notify\|slack" index.js | head -10`
Expected: Shows notify imports and calls, no slack references

**Step 5: Commit**

```bash
git add index.js
git commit -m "feat: switch to unified notification manager

Replace direct slack.send() calls with notify.send() to support
multiple notification channels.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 5: Remove slack-notify Dependency

**Files:**
- Modify: `package.json`

**Step 1: Remove slack-notify from dependencies**

Run: `npm uninstall slack-notify`

**Step 2: Verify removal**

Run: `cat package.json | grep slack-notify`
Expected: No output (dependency removed)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove slack-notify dependency

Remove slack-notify package as we now use native https for Slack
notifications.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 6: Update Environment Configuration

**Files:**
- Modify: `env.example`

**Step 1: Update env.example with new variables**

Replace entire contents of `env.example`:

```bash
HEADLESS=true
PORT=8080
NODE_ENV=development
REDIS_URL=redis://localhost:6379
CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# Notification Settings
ENABLE_LINE_NOTIFY=false
ENABLE_SLACK_NOTIFY=true

# LINE Configuration
LINE_CHANNEL_ACCESS_TOKEN=
LINE_USER_ID=

# Slack Configuration
MY_SLACK_WEBHOOK_URL=
```

**Step 2: Verify file updated**

Run: `cat env.example`
Expected: New format with notification settings

**Step 3: Commit**

```bash
git add env.example
git commit -m "docs: update env.example with LINE settings

Add LINE notification configuration and channel enable flags to
environment template.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 7: Update Documentation

**Files:**
- Modify: `README.md`

**Step 1: Add LINE notification section to README**

Add after line 51 (before "## 專案架構"):

```markdown
### 2. 通知設定

Alaska Bot 支援 LINE 和 Slack 雙通知管道，可以獨立開關：

**LINE 通知設定：**
1. 在 [LINE Developers Console](https://developers.line.biz/) 建立 Messaging API 頻道
2. 取得 Channel Access Token
3. 取得您的 LINE User ID（可使用 LINE Bot 取得）
4. 在 `.env` 中設定：
   ```bash
   ENABLE_LINE_NOTIFY=true
   LINE_CHANNEL_ACCESS_TOKEN=your_token
   LINE_USER_ID=your_user_id
   ```

**Slack 通知設定：**
```bash
ENABLE_SLACK_NOTIFY=true
MY_SLACK_WEBHOOK_URL=your_webhook_url
```

**注意：**
- 可以同時啟用兩個通知管道
- 如果只設定 `MY_SLACK_WEBHOOK_URL` 而不設定 `ENABLE_SLACK_NOTIFY`，Slack 會自動啟用（向後相容）
- LINE 需要明確設定 `ENABLE_LINE_NOTIFY=true` 才會啟用

```

**Step 2: Update dependencies section**

Find the "主要技術" section and update to:

```markdown
### 主要技術
- **Puppeteer**：用於模擬瀏覽器操作，爬取航班資訊。
- **Redis**：用於儲存航班排程資料。
- **Cron**：定期執行航班檢查任務。
- **LINE Messaging API**：用於發送 LINE 通知。
- **Slack Webhook**：用於發送 Slack 通知。
```

**Step 3: Verify changes**

Run: `grep -A 5 "通知設定" README.md`
Expected: Shows new notification setup section

**Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add LINE notification documentation

Document LINE notification setup, configuration options, and
dual-channel support.

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

---

## Task 8: Manual Testing Preparation

**Files:**
- Note: No code changes, just verification steps

**Step 1: Check all files are committed**

Run: `git status`
Expected: "nothing to commit, working tree clean"

**Step 2: Review commit history**

Run: `git log --oneline -10`
Expected: Shows all 7 commits from this implementation

**Step 3: List modified files**

Run: `git diff master --name-status`
Expected:
```
A       line.js
M       slack.js
A       notify.js
M       index.js
M       package.json
M       package-lock.json
M       env.example
M       README.md
```

**Step 4: Summary report**

Create summary in console:

```
Implementation Complete
=======================

✅ Created line.js - LINE Messaging API client
✅ Refactored slack.js - Native https implementation
✅ Created notify.js - Unified notification manager
✅ Updated index.js - Switched to notify.send()
✅ Removed slack-notify - No longer needed
✅ Updated env.example - Added LINE configuration
✅ Updated README.md - Added notification docs

Ready for manual testing:
- Test with LINE only
- Test with Slack only
- Test with both enabled
- Test error handling
- Test backward compatibility
```

---

## Manual Testing Checklist

After implementation, perform these manual tests:

### Test 1: Slack Only (Backward Compatibility)

**Setup `.env`:**
```bash
ENABLE_LINE_NOTIFY=false
ENABLE_SLACK_NOTIFY=true
MY_SLACK_WEBHOOK_URL=<your_webhook>
```

**Test:** Start server, add a schedule
**Expected:** Slack notification received, no LINE notification

### Test 2: LINE Only

**Setup `.env`:**
```bash
ENABLE_LINE_NOTIFY=true
ENABLE_SLACK_NOTIFY=false
LINE_CHANNEL_ACCESS_TOKEN=<your_token>
LINE_USER_ID=<your_user_id>
```

**Test:** Start server, add a schedule
**Expected:** LINE notification received, no Slack notification

### Test 3: Both Enabled

**Setup `.env`:**
```bash
ENABLE_LINE_NOTIFY=true
ENABLE_SLACK_NOTIFY=true
LINE_CHANNEL_ACCESS_TOKEN=<your_token>
LINE_USER_ID=<your_user_id>
MY_SLACK_WEBHOOK_URL=<your_webhook>
```

**Test:** Start server
**Expected:** Both LINE and Slack receive "Start !" notification

### Test 4: Error Handling

**Setup `.env`:**
```bash
ENABLE_LINE_NOTIFY=true
ENABLE_SLACK_NOTIFY=true
LINE_CHANNEL_ACCESS_TOKEN=invalid_token
MY_SLACK_WEBHOOK_URL=<your_webhook>
```

**Test:** Start server
**Expected:**
- Console shows "[通知錯誤] LINE 發送失敗"
- Slack still receives notification
- Server continues running

### Test 5: Legacy Compatibility

**Setup `.env`:**
```bash
# Do not set ENABLE_SLACK_NOTIFY
MY_SLACK_WEBHOOK_URL=<your_webhook>
```

**Test:** Start server
**Expected:** Slack notification received (backward compatible)

---

## Rollback Plan

If issues occur, rollback with:

```bash
git checkout master
cd ../../
git worktree remove .worktrees/line-notification-integration
git branch -D feature/line-notification-integration
```

## Merge Instructions

After successful testing:

1. Return to main worktree: `cd /Users/yuki/projects/alaska-bot`
2. Merge feature branch: `git merge feature/line-notification-integration`
3. Update `.env` with actual credentials
4. Restart service
5. Clean up worktree using @superpowers:finishing-a-development-branch
