# Flexible Dates 日期區間哩程票查詢

## 功能概述

新增 `POST /alaska/flexible` endpoint，利用 Alaska Airlines 網站的月曆視圖，查詢指定日期區間內符合哩程門檻的哩程票，並透過現有的 LINE / Slack 通知。支援跨月查詢、Redis 排程與定時 cron 監控。

## API 設計

### `POST /alaska/flexible`

```json
{
  "startDate": "2026-03-05",
  "endDate": "2026-03-20",
  "departure": "SEA",
  "arrival": "LAX",
  "peoples": 1,
  "maximumMiles": 25000,
  "ticketClass": ["economy", "business"]
}
```

- `startDate` / `endDate` 可跨月，bot 自動判斷需要抓幾個月的月曆頁
- 不支援 `airlines` 篩選（Alaska flexible dates 月曆視圖不提供此功能）
- 其餘參數沿用現有定義

## 搜尋邏輯

新增 `checkAlaskaFlexibleDates(schedule)` 函數：

1. 根據 startDate 和 endDate 計算需要查詢的月份列表（例如 3/25~4/10 → 3月、4月）
2. 對每個月份，打開 Alaska Airlines 的 flexible dates 月曆視圖頁面
3. 從月曆 DOM 解析每一天的最低哩程數與艙等
4. 篩選：只保留 startDate~endDate 區間內、低於 maximumMiles 的日期
5. 回傳符合條件的日期清單

## Redis 排程

- Key 格式：`alaska:flexible:{startDate}:{endDate}:{departure}:{arrival}`
- TTL 根據 endDate 計算，過期後自動刪除
- Cron 跟現有一樣在 10:00 / 22:00 Asia/Taipei 執行，分別處理單日排程和 flexible 排程

## 通知格式

```
[Flexible 2026-03-05 ~ 2026-03-20 SEA => LAX]:
03/08 Economy: 15,000 miles
03/12 Economy: 20,000 miles
03/12 Business: 25,000 miles
Link: https://www.alaskaair.com/...
```

每個符合 maximumMiles 門檻的日期一行，列出艙等與哩程數。

## 需要新增/修改的檔案

- **alaska.js** — 新增 `checkAlaskaFlexibleDates()` 函數，處理月曆頁抓取與解析
- **index.js** — 新增 `POST /alaska/flexible` endpoint + cron 中加入 flexible 排程處理
- **notify.js** — 新增 flexible 結果的訊息格式化
