# README

## 專案名稱
Alaska Bot

## 專案描述
Alaska Bot 是用來監控阿拉斯加航空哩程計劃航班資訊，並根據設定條件篩選符合需求的航班，透過 Slack 發送通知。

---

## 功能
1. **航班監控**：定期檢查 Redis 中的航班排程，並透過 Puppeteer 爬取阿拉斯加航空的航班資訊。
2. **條件篩選**：根據用戶設定的條件（例如航班日期、最大里程數、艙等等）篩選符合需求的航班。
3. **通知功能**：將篩選結果以格式化訊息的方式發送至 Slack。
4. **API 支援**：
   - 新增特定的航班查詢條件

---

## 使用方式

### 1. 新增航班排程
透過 POST 請求新增航班排程：
```bash
curl -X POST http://localhost:3000/alaska \
-H "Content-Type: application/json" \
-d '{
  "departureDate": "2023-12-25",
  "departure": "SEA",
  "arrival": "LAX",
  "peoples": 1,
  "maximumMiles": 25000,
  "airlines": ["AS"],
  "ticketClass": ["economy", "business"]
}'
```

---

## 專案架構

### 主要檔案
- **index.js**：專案的入口檔案，負責啟動服務、設定 Cron 任務以及處理 API 請求。
- **alaska.js**：負責爬取阿拉斯加航空的航班資訊，並根據條件篩選航班。
- **slack.js**：封裝 Slack 通知功能。

### 主要技術
- **Puppeteer**：用於模擬瀏覽器操作，爬取航班資訊。
- **Redis**：用於儲存航班排程資料。
- **Cron**：定期執行航班檢查任務。
- **Slack Notify**：用於發送通知至 Slack。

---

## 注意事項
1. **Redis TTL**：航班排程的 TTL（存活時間）會根據航班日期自動計算，過期後會自動刪除。
2. **Puppeteer 設定**：若需要顯示瀏覽器畫面，請將 [`.env`](command:_github.copilot.openRelativePath?%5B%7B%22scheme%22%3A%22file%22%2C%22authority%22%3A%22%22%2C%22path%22%3A%22%2FUsers%2Fbibiota%2FDocuments%2Fprojects%2Falaska-bot%2F.env%22%2C%22query%22%3A%22%22%2C%22fragment%22%3A%22%22%7D%5D "/Users/bibiota/Documents/projects/alaska-bot/.env") 中的 `HEADLESS` 設為 `false`。
3. **時區設定**：Cron 任務的時區已設定為 `Asia/Taipei`。

---

## 範例輸出
當有符合條件的航班時，Slack 通知範例如下：
```
[2023-12-25 SEA => LAX]: 
Flight: AS123
Miles:
Economy: 15000 miles 5 USD 
Business: 25000 miles 10 USD 
Link: https://www.alaskaair.com/search/results?A=1&C=0&L=0&O=SEA&D=LAX&OD=2023-12-25&RT=false&ShoppingMethod=onlineaward
```

---

## 授權
本專案採用 ISC 授權。