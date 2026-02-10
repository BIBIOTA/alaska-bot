
const puppeteer = require("puppeteer-core");
require('dotenv').config();
const notify = require('./notify');
const moment = require('moment');

const TICKET_CLASS_MAPPING = {
  'economy': 'Refundable Main',
  'premium': 'Refundable Partner Premium',
  'business': 'Refundable Partner Business',
}

const FARE_TYPE_MAPPING = {
  'economy': 'Main',
  'premium': 'Partner Premium',
  'business': 'Partner Business',
  'first': 'First Class',
};

const checkAlaskaSchedules = (async (schedule) => {

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

  const alaskaSearchUrl = 'https://www.alaskaair.com/search/results';

  const { departureDate, airlines, maximumMiles, departure, arrival, peoples, ticketClass } = JSON.parse(schedule);

  const searchConditionUrl = `${alaskaSearchUrl}?A=${peoples}&C=0&L=0&O=${departure}&D=${arrival}&OD=${departureDate}&RT=false&ShoppingMethod=onlineaward`;

  let flightData = {
    departure,
    arrival,
    flights: [],
  }

  try {
    const page = await browser.newPage();

    // 設置 viewport 和 user agent 以確保獲得桌面版頁面
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.evaluateOnNewDocument(() => {
      const newProto = navigator.__proto__;
      delete newProto.webdriver;
      navigator.__proto__ = newProto;
    });

    await page.goto(searchConditionUrl, {timeout: 20000, waitUntil: 'networkidle2'});

    const pageResult = await page.waitForSelector('.resultsTableHeader', {timeout: 20000}).catch(async () => {
      return await page.evaluate(() => {
        const errorElement = document.querySelector('.no-flights');
        return errorElement;
      });
    });

    if (!pageResult) {
      return flightData;
    }

    const result = await page.evaluate(() => {
      const rows = document.querySelectorAll('tr[data-testid="matrix-row"]');
      const output = [];

      rows.forEach(row => {
        const flightInfo = row.querySelector('p');
        const flightNumber = flightInfo ? flightInfo.textContent.split('—')[0].trim() : 'N/A';
        const fareButtons = row.querySelectorAll('button');
        const cabins = [];

        fareButtons.forEach(button => {
          const spans = button.querySelectorAll('span');
          if (spans.length < 6) return;

          // spans[0]: "Main", "Business", etc.
          // spans[1]: "7.5k", "15k", etc.
          // spans[5]: "$29", "$10", etc.
          const className = spans[0] ? spans[0].textContent.trim() : null;
          const miles = spans[1] ? spans[1].textContent.trim() : null;
          const taxText = spans[5] ? spans[5].textContent.trim() : null;

          if (!className || !miles || !taxText) {
            return;
          }

          // 提取稅費數字 ($29 -> 29)
          const taxMatch = taxText.match(/\$?(\d+)/);
          const tax = taxMatch ? taxMatch[1] : null;

          if (!tax) return;

          // 將類別名稱轉換為小寫 (Main -> economy, Business -> business, Premium -> premium)
          let classKey = className.toLowerCase();
          if (classKey === 'main') classKey = 'economy';

          cabins.push({
            class: classKey,
            miles: parseFloat(miles.replace('k', '')) * 1000,
            tax: tax
          });
        });

        output.push({
          flight: flightNumber,
          cabins: cabins,
        });
      });

      return output;
    });

    flightData.flights = result.filter((flight) => {
      if (!airlines.some(airline => flight.flight.includes(airline))) {
        return false;
      }

      const cabins = flight.cabins.filter(cabin => {
        if (cabin.miles > maximumMiles) {
          return false;
        }

        let hasClass = false;
        ticketClass.forEach((className) => {
          if (className === cabin.class) {
            hasClass = true;
          }
        });

        return hasClass;
      });

      if (cabins.length === 0) {
        return false;
      }

      return true;
    });

    browser.close();

    flightData.departure = departure;
    flightData.arrival = arrival;
    flightData.url = searchConditionUrl;

    return flightData;

  } catch (error) {
    console.log(error);
    
    notify.send('Error: ' + error.message + '\n' + 'url:' + searchConditionUrl);
    browser.close();

    return flightData;
  }
});

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

  module.exports = { checkAlaskaSchedules, checkAlaskaFlexibleDates };
