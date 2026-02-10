# Alaska Bot

Alaska Bot 是用來監控阿拉斯加航空哩程計劃航班資訊，並根據設定條件篩選符合需求的航班，透過 LINE 或 Slack 發送通知。

---

## 功能特色

1. **雙模式航班監控**
   - **固定日期查詢**：精確查詢特定日期的航班資訊
   - **彈性日期查詢**：掃描日期範圍內的最低票價（NEW!）

2. **智慧條件篩選**
   - 航班日期範圍
   - 最大里程數限制
   - 艙等選擇（經濟艙/高級經濟艙/商務艙）
   - 航空公司篩選
   - 乘客人數

3. **雙通道通知系統**
   - LINE 訊息推播
   - Slack Webhook 通知
   - 可獨立開關或同時啟用

4. **自動化排程管理**
   - 每日兩次自動檢查（上午 10 點、晚上 10 點）
   - 智慧 TTL 管理，過期自動清理
   - Redis 持久化儲存

---

## 環境設定

### 安裝依賴
```bash
npm install
```

### 環境變數配置
複製 `env.example` 為 `.env` 並設定以下變數：

```bash
# 基本設定
HEADLESS=true
PORT=8080
NODE_ENV=production
REDIS_URL=redis://localhost:6379

# Chrome 執行路徑
# macOS
CHROME_EXECUTABLE_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
# Linux (Docker)
# CHROME_EXECUTABLE_PATH=/usr/bin/chromium

# 通知設定
ENABLE_LINE_NOTIFY=false
ENABLE_SLACK_NOTIFY=true

# LINE 設定
LINE_CHANNEL_ACCESS_TOKEN=your_token
LINE_USER_ID=your_user_id

# Slack 設定
MY_SLACK_WEBHOOK_URL=your_webhook_url
```

### 啟動服務
```bash
# 開發模式
npm run dev

# 生產模式
npm start
```

---

## API 使用說明

### 1. 新增固定日期航班排程
查詢特定日期的所有符合條件航班：

```bash
curl -X POST http://localhost:8080/alaska \
-H "Content-Type: application/json" \
-d '{
  "departureDate": "2026-03-25",
  "departure": "SEA",
  "arrival": "LAX",
  "peoples": 1,
  "maximumMiles": 25000,
  "airlines": ["AS"],
  "ticketClass": ["economy", "business"]
}'
```

### 2. 批量新增多個固定日期排程
一次新增多個日期的查詢：

```bash
curl -X POST http://localhost:8080/alaska/multiple \
-H "Content-Type: application/json" \
-d '[
  {
    "departureDate": "2026-03-25",
    "departure": "SEA",
    "arrival": "LAX",
    "peoples": 1,
    "maximumMiles": 25000,
    "airlines": ["AS"],
    "ticketClass": ["economy"]
  },
  {
    "departureDate": "2026-03-26",
    "departure": "LAX",
    "arrival": "SEA",
    "peoples": 1,
    "maximumMiles": 25000,
    "airlines": ["AS"],
    "ticketClass": ["economy"]
  }
]'
```

### 3. 新增彈性日期範圍查詢（NEW!）
掃描日期範圍內的最低票價：

```bash
curl -X POST http://localhost:8080/alaska/flexible \
-H "Content-Type: application/json" \
-d '{
  "startDate": "2026-03-20",
  "endDate": "2026-03-31",
  "departure": "SEA",
  "arrival": "LAX",
  "peoples": 1,
  "maximumMiles": 25000,
  "ticketClass": ["economy"]
}'
```

### 參數說明

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `departureDate` | string | 是（固定日期） | 出發日期（YYYY-MM-DD） |
| `startDate` | string | 是（彈性日期） | 開始日期（YYYY-MM-DD） |
| `endDate` | string | 是（彈性日期） | 結束日期（YYYY-MM-DD） |
| `departure` | string | 是 | 出發機場代碼（如：SEA） |
| `arrival` | string | 是 | 目的地機場代碼（如：LAX） |
| `peoples` | number | 是 | 乘客人數 |
| `maximumMiles` | number | 是 | 最大里程數限制 |
| `airlines` | array | 否 | 航空公司代碼列表（如：["AS", "AA"]） |
| `ticketClass` | array | 是 | 艙等列表：`["economy"]`, `["business"]`, `["premium"]` 或組合 |

---

## 通知設定

Alaska Bot 支援 LINE 和 Slack 雙通知管道，可以獨立開關或同時啟用。

### LINE 通知設定

1. 前往 [LINE Developers Console](https://developers.line.biz/) 建立 Messaging API 頻道
2. 取得 Channel Access Token
3. 取得您的 LINE User ID（可透過 LINE Bot 的 webhook 取得）
4. 在 `.env` 中設定：
   ```bash
   ENABLE_LINE_NOTIFY=true
   LINE_CHANNEL_ACCESS_TOKEN=your_channel_access_token
   LINE_USER_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

### Slack 通知設定

1. 建立 Slack Incoming Webhook：
   - 前往 Slack App 管理頁面
   - 搜尋並新增 "Incoming Webhooks"
   - 選擇要發送通知的頻道
   - 複製 Webhook URL
2. 在 `.env` 中設定：
   ```bash
   ENABLE_SLACK_NOTIFY=true
   MY_SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

### 通知設定注意事項

- ✅ 可以同時啟用 LINE 和 Slack 雙通道
- ✅ 向後相容：若只設定 `MY_SLACK_WEBHOOK_URL` 而不設定 `ENABLE_SLACK_NOTIFY`，Slack 會自動啟用
- ⚠️ LINE 必須明確設定 `ENABLE_LINE_NOTIFY=true` 才會啟用

---

## 專案架構

### 核心檔案

```
alaska-bot/
├── index.js           # 應用程式入口點
│   ├── Express API Server
│   ├── Cron Job 排程器（每日 10:00, 22:00）
│   └── Redis 連線管理
│
├── alaska.js          # 航班爬蟲核心
│   ├── checkAlaskaSchedules()     # 固定日期查詢
│   └── checkAlaskaFlexibleDates() # 彈性日期查詢
│
├── notify.js          # 通知管理器
│   └── 統一協調 LINE 和 Slack 通知
│
├── line.js            # LINE Messaging API 整合
├── slack.js           # Slack Webhook 整合
└── add-all-holidays.js # 批量新增假日排程工具
```

### 技術棧

| 技術 | 用途 |
|------|------|
| **Node.js + Express** | HTTP API 服務器 |
| **Puppeteer Core** | 無頭瀏覽器，模擬真實使用者爬取航班資料 |
| **Redis** | 航班排程快取與 TTL 管理 |
| **Cron** | 定時任務排程（時區：Asia/Taipei） |
| **LINE Messaging API** | 推送 LINE 訊息 |
| **Slack Incoming Webhooks** | 發送 Slack 通知 |
| **Moment.js** | 日期時間處理 |

---

## 工作流程

1. **新增排程**：透過 API 新增固定日期或彈性日期查詢排程
2. **Redis 儲存**：排程資料儲存至 Redis，並自動計算 TTL
3. **定時檢查**：Cron 每日 10:00 和 22:00（台北時間）自動執行
4. **爬取航班**：使用 Puppeteer 訪問阿拉斯加航空官網
5. **條件篩選**：過濾不符合條件的航班
6. **發送通知**：將結果推送至 LINE/Slack
7. **自動清理**：過期排程自動刪除

---

## 通知範例

### 固定日期查詢結果
```
[2026-03-25 SEA => LAX]:
Flight: AS123
Miles:
Economy: 15000 miles $5
Business: 25000 miles $10
Link: https://www.alaskaair.com/search/results?A=1&C=0&L=0&O=SEA&D=LAX&OD=2026-03-25&RT=false&ShoppingMethod=onlineaward
```

### 彈性日期查詢結果
```
[Flexible 2026-03-20 ~ 2026-03-31 SEA => LAX]:
03/22: 12.5k miles +$6
03/24: 15k miles +$6
03/28: 17.5k miles +$8
Link: https://www.alaskaair.com/search/calendar?O=SEA&D=LAX&OD=2026-03-20&A=1&RT=false&RequestType=Calendar&ShoppingMethod=onlineaward&FareType=Main
```

---

## 注意事項

### Redis TTL 管理
- 固定日期排程：TTL 根據出發日期自動計算
- 彈性日期排程：TTL 根據結束日期自動計算
- 過期排程會自動從 Redis 刪除，無需手動清理

### Puppeteer 設定
- 預設為無頭模式（`HEADLESS=true`）
- 除錯時可設定 `HEADLESS=false` 顯示瀏覽器畫面
- Docker 環境需使用 Chromium 路徑：`/usr/bin/chromium`

### Cron 排程
- 執行時間：每日 10:00 和 22:00（台北時間）
- 時區設定：`Asia/Taipei`
- 可在 `index.js` 中修改 cron 表達式

### 機場代碼參考
常用美國機場代碼：
- SEA（西雅圖）
- LAX（洛杉磯）
- SFO（舊金山）
- JFK（紐約甘迺迪）
- ORD（芝加哥）

---

## Docker 部署

### 使用 Docker Compose

```yaml
version: '3.8'
services:
  alaska-bot:
    build: .
    ports:
      - "8080:8080"
    environment:
      - REDIS_URL=redis://redis:6379
      - CHROME_EXECUTABLE_PATH=/usr/bin/chromium
      - ENABLE_SLACK_NOTIFY=true
      - MY_SLACK_WEBHOOK_URL=${MY_SLACK_WEBHOOK_URL}
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

### Fly.io 部署

專案包含 `fly.toml` 配置檔，可直接部署至 Fly.io：

```bash
# 登入 Fly.io
flyctl auth login

# 部署應用
flyctl deploy

# 設定環境變數
flyctl secrets set MY_SLACK_WEBHOOK_URL=your_webhook_url
```

---

## 常見問題

### Q: 為什麼沒有收到通知？
- 檢查 `.env` 中的通知設定是否正確
- 確認 `ENABLE_SLACK_NOTIFY` 或 `ENABLE_LINE_NOTIFY` 已設為 `true`
- 檢查 Redis 中是否有排程：`redis-cli KEYS "alaska:*"`

### Q: 彈性日期查詢和固定日期查詢有什麼差別？
- **固定日期**：查詢單一日期的所有航班，顯示每個航班的艙等價格
- **彈性日期**：掃描日期範圍內每天的最低票價，適合尋找最便宜的日期

### Q: 如何修改檢查頻率？
編輯 `index.js` 中的 cron 表達式：
```javascript
new CronJob(
  '0 10,22 * * *',  // 每日 10:00 和 22:00
  // 改為 '0 */6 * * *' 則為每 6 小時檢查一次
  ...
)
```

### Q: 可以同時查詢多個航線嗎？
可以，使用 `/alaska/multiple` 端點批量新增排程，或多次呼叫 `/alaska` API。

---

## 開發工具

### add-all-holidays.js
批量新增假日排程的輔助腳本：
```bash
node add-all-holidays.js
```

---

## 授權

本專案採用 ISC 授權。

---

## 貢獻

歡迎提交 Issue 或 Pull Request！

## 聯絡方式

如有問題或建議，請開啟 GitHub Issue。