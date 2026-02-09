
const puppeteer = require("puppeteer-core");
require('dotenv').config();
const notify = require('./notify');

const TICKET_CLASS_MAPPING = {
  'economy': 'Refundable Main',
  'premium': 'Refundable Partner Premium',
  'business': 'Refundable Partner Business',
}

const checkAlaskaSchedules = (async (schedule) => {

  const browser = await puppeteer.launch({
      headless: 'new',
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

    await page.evaluateOnNewDocument(() => {
      const newProto = navigator.__proto__;
      delete newProto.webdriver;
      navigator.__proto__ = newProto;
    });

    await page.goto(searchConditionUrl, {timeout: 20000, visible: true});
    
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
          if (spans.length < 2) return;

          const classNameEl = spans[0]; // "Main", "Business", "Premium", etc.
          const milesEl = spans[1]; // "7.5k", "15k", etc.

          // 從價格行提取稅費
          const priceLine = button.querySelector('.price-line');
          const priceText = priceLine ? priceLine.textContent.trim() : '';

          const className = classNameEl ? classNameEl.textContent.trim() : null;
          const miles = milesEl ? milesEl.textContent.trim() : null;

          // 從 "7.5k points pts + $29" 提取 "$29"
          const taxMatch = priceText.match(/\$(\d+)/);
          const tax = taxMatch ? taxMatch[1] : null;

          if (!className || !miles || !tax) {
            return;
          }

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

  module.exports = { checkAlaskaSchedules };
