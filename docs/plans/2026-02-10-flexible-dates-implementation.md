# Flexible Dates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add flexible dates calendar search to alaska-bot, querying a date range and notifying when award fares fall below a miles threshold.

**Architecture:** New `checkAlaskaFlexibleDates()` function in alaska.js navigates to Alaska Airlines' calendar page (`/search/calendar`), parses daily fares from `aria-label` attributes on `button.day` elements, and filters by date range + maximumMiles. Supports cross-month queries by navigating to each month via the `CM=YYYY-MM` URL parameter. New `POST /alaska/flexible` endpoint stores schedules in Redis with `alaska:flexible:*` keys, processed by existing cron.

**Tech Stack:** Puppeteer-core, Express, Redis, moment.js (all existing dependencies)

---

### Task 1: Add `checkAlaskaFlexibleDates()` to alaska.js

**Files:**
- Modify: `alaska.js`

**Step 1: Write the new function**

Add after the existing `checkAlaskaSchedules` function, before `module.exports`:

```javascript
const FARE_TYPE_MAPPING = {
  'economy': 'Main',
  'premium': 'Partner Premium',
  'business': 'Partner Business',
  'first': 'First Class',
};

const checkAlaskaFlexibleDates = (async (schedule) => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process'
    ],
    protocolTimeout: 60000,
  });

  const { startDate, endDate, maximumMiles, departure, arrival, peoples, ticketClass } = JSON.parse(schedule);

  const fareType = ticketClass && ticketClass.length === 1
    ? FARE_TYPE_MAPPING[ticketClass[0]] || 'Lowest price available'
    : 'Lowest price available';

  let flexibleData = {
    departure,
    arrival,
    startDate,
    endDate,
    dates: [],
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      const newProto = navigator.__proto__;
      delete newProto.webdriver;
      navigator.__proto__ = newProto;
    });

    // Calculate months to query
    const start = moment(startDate);
    const end = moment(endDate);
    const months = [];
    let current = start.clone().startOf('month');
    while (current.isSameOrBefore(end, 'month')) {
      months.push(current.format('YYYY-MM'));
      current.add(1, 'month');
    }

    const allDays = [];

    for (const month of months) {
      const calendarUrl = `https://www.alaskaair.com/search/calendar?O=${departure}&D=${arrival}&OD=${startDate}&A=${peoples}&RT=false&RequestType=Calendar&ShoppingMethod=onlineaward&FareType=${encodeURIComponent(fareType)}&CM=${month}`;

      await page.goto(calendarUrl, { timeout: 20000, waitUntil: 'networkidle2' });

      const loaded = await page.waitForSelector('[data-testid="loaded-calendar"]', { timeout: 20000 }).catch(() => null);

      if (!loaded) continue;

      const days = await page.evaluate(() => {
        const calendar = document.querySelector('[data-testid="loaded-calendar"]');
        if (!calendar) return [];

        const buttons = calendar.querySelectorAll('button.day');
        const result = [];

        for (const btn of buttons) {
          const ariaLabel = btn.getAttribute('aria-label');
          // Format: "Feb 10, 2026. Fare: 20k + $6"
          const match = ariaLabel.match(/(\w+ \d+, \d+)\. Fare: ([\d.]+k?) \+ \$(\d+)/);
          if (match) {
            const milesStr = match[2];
            const miles = parseFloat(milesStr.replace('k', '')) * (milesStr.includes('k') ? 1000 : 1);
            result.push({
              date: match[1],
              miles: miles,
              tax: parseInt(match[3]),
            });
          }
        }

        return result;
      });

      allDays.push(...days);
    }

    // Filter by date range and maximumMiles
    flexibleData.dates = allDays.filter(day => {
      const dayMoment = moment(day.date, 'MMM D, YYYY');
      if (dayMoment.isBefore(start, 'day') || dayMoment.isAfter(end, 'day')) return false;
      if (day.miles > maximumMiles) return false;
      return true;
    }).map(day => ({
      date: moment(day.date, 'MMM D, YYYY').format('YYYY-MM-DD'),
      miles: day.miles,
      tax: day.tax,
    }));

    flexibleData.url = `https://www.alaskaair.com/search/calendar?O=${departure}&D=${arrival}&OD=${startDate}&A=${peoples}&RT=false&RequestType=Calendar&ShoppingMethod=onlineaward&FareType=${encodeURIComponent(fareType)}`;

    browser.close();
    return flexibleData;

  } catch (error) {
    console.log(error);
    notify.send('Error (flexible): ' + error.message);
    browser.close();
    return flexibleData;
  }
});
```

**Step 2: Export the new function**

Change:
```javascript
module.exports = { checkAlaskaSchedules };
```
To:
```javascript
module.exports = { checkAlaskaSchedules, checkAlaskaFlexibleDates };
```

**Step 3: Add moment require at top of alaska.js**

Add after existing requires:
```javascript
const moment = require('moment');
```

**Step 4: Commit**

```bash
git add alaska.js
git commit -m "feat: add checkAlaskaFlexibleDates calendar scraping function"
```

---

### Task 2: Add `POST /alaska/flexible` endpoint to index.js

**Files:**
- Modify: `index.js`

**Step 1: Import the new function**

Change:
```javascript
const { checkAlaskaSchedules } = require('./alaska');
```
To:
```javascript
const { checkAlaskaSchedules, checkAlaskaFlexibleDates } = require('./alaska');
```

**Step 2: Add the endpoint**

Add after the existing `POST /alaska/multiple` route:

```javascript
app.post('/alaska/flexible', jsonParser, async(req, response) => {
  const { startDate, endDate, departure, arrival } = req.body;

  const momentEndDate = moment(endDate);
  const ttl = momentEndDate.diff(moment(), 'seconds');

  if (ttl <= 0) {
    response.status(400).json({
      status: 'error',
      message: 'End date is in the past',
      data: req.body,
    });
    return;
  }

  const momentStartDate = moment(startDate);
  if (momentStartDate.isAfter(momentEndDate)) {
    response.status(400).json({
      status: 'error',
      message: 'Start date is after end date',
      data: req.body,
    });
    return;
  }

  const key = `alaska:flexible:${momentStartDate.format('YYYYMMDD')}:${momentEndDate.format('YYYYMMDD')}:${departure}:${arrival}`;

  await client.set(key, JSON.stringify(req.body), {
    EX: ttl,
  });

  const expiredDays = momentEndDate.diff(moment(), 'days');

  response.json({
    status: 'success',
    message: 'Add Alaska flexible schedule. Expired in ' + expiredDays + ' days',
    data: req.body,
  });
});
```

**Step 3: Commit**

```bash
git add index.js
git commit -m "feat: add POST /alaska/flexible endpoint"
```

---

### Task 3: Add flexible schedules to cron job

**Files:**
- Modify: `index.js`

**Step 1: Add flexible schedule processing to cron**

Inside the existing `CronJob` callback, after the existing `for` loop for `alaska:schedules:*`, add:

```javascript
    // Process flexible date schedules
    const flexSchedules = await client.keys('alaska:flexible:*');

    if (flexSchedules.length > 0) {
      for (let i = 0; i < flexSchedules.length; i++) {
        const schedule = await client.get(flexSchedules[i]);
        const parts = flexSchedules[i].split(':');
        const endDateStr = parts[3]; // YYYYMMDD

        if (moment(endDateStr, 'YYYYMMDD').isBefore(moment())) {
          await client.del(flexSchedules[i]);
          continue;
        }

        const flexibleData = await checkAlaskaFlexibleDates(schedule);

        console.log({ flexible: true, ...flexibleData });

        let message = '';
        if (flexibleData.dates.length > 0) {
          message += `[Flexible ${flexibleData.startDate} ~ ${flexibleData.endDate} ${flexibleData.departure} => ${flexibleData.arrival}]:\n`;
          flexibleData.dates.forEach((day) => {
            const dateStr = moment(day.date).format('MM/DD');
            const miles = day.miles >= 1000 ? (day.miles / 1000) + 'k' : day.miles;
            message += `${dateStr}: ${miles} miles +$${day.tax}\n`;
          });
          message += `Link: ${flexibleData.url}\n`;
        }

        if (message) {
          notify.send(message);
        }
      }
    }
```

**Step 2: Commit**

```bash
git add index.js
git commit -m "feat: add flexible schedule processing to cron job"
```

---

### Task 4: Write test script and verify

**Files:**
- Create: `test-flexible.js`

**Step 1: Create test script**

```javascript
const { checkAlaskaFlexibleDates } = require('./alaska');

async function test() {
  const schedule = JSON.stringify({
    startDate: '2026-02-20',
    endDate: '2026-02-28',
    departure: 'SEA',
    arrival: 'LAX',
    peoples: 1,
    maximumMiles: 20000,
    ticketClass: ['economy'],
  });

  console.log('Testing flexible dates search...');
  const result = await checkAlaskaFlexibleDates(schedule);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

test();
```

**Step 2: Run test**

Run: `node test-flexible.js`
Expected: JSON output with dates array containing entries with miles <= 20000 between Feb 20-28.

**Step 3: Commit**

```bash
git add test-flexible.js
git commit -m "feat: add flexible dates test script"
```

---

### Task 5: Test API endpoint end-to-end

**Step 1: Start the server**

Run: `node index.js`

**Step 2: Add a flexible schedule via API**

```bash
curl -X POST http://localhost:3000/alaska/flexible \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-02-20","endDate":"2026-02-28","departure":"SEA","arrival":"LAX","peoples":1,"maximumMiles":20000,"ticketClass":["economy"]}'
```

Expected: `{"status":"success","message":"Add Alaska flexible schedule. Expired in X days",...}`

**Step 3: Verify Redis key was created**

```bash
redis-cli keys "alaska:flexible:*"
```

Expected: `alaska:flexible:20260220:20260228:SEA:LAX`

---

## Technical Reference

### Calendar URL format
```
https://www.alaskaair.com/search/calendar?O={departure}&D={arrival}&OD={date}&A={peoples}&RT=false&RequestType=Calendar&ShoppingMethod=onlineaward&FareType={fareType}&CM={YYYY-MM}
```

### FareType values
| ticketClass | FareType URL value |
|---|---|
| economy | Main |
| premium | Partner Premium |
| business | Partner Business |
| first | First Class |
| (multiple/default) | Lowest price available |

### Calendar DOM parsing
- Wait for: `[data-testid="loaded-calendar"]`
- Available days: `button.day` with `aria-label="Feb 10, 2026. Fare: 20k + $6"`
- Unavailable days: `button.unavailable-day` with `disabled`
- Next month: `<a aria-label="Next month">` with `CM=YYYY-MM` in href

### Cross-month navigation
Use the `CM=YYYY-MM` URL parameter to load a specific month directly (no need to click next/prev).
