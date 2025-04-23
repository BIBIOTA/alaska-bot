
const puppeteer = require("puppeteer");
require('dotenv').config();
const { slack } = require('./slack');

const TICKET_CLASS_MAPPING = {
  'economy': 'Refundable Main',
  'premium': 'Refundable Partner Premium',
  'business': 'Refundable Partner Business',
}

const checkAlaskaSchedules = (async (schedule) => {

  const browser = await puppeteer.launch({
      headless: process.env.HEADLESS === 'true',
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

    await page.waitForSelector('.resultsTableHeader', {timeout: 20000});
    const noFlightElement = await page.$('.no-flights');
  
    if (noFlightElement) {
      return flightData;
    }

    const result = await page.evaluate((TICKET_CLASS_MAPPING) => {
      const rows = document.querySelectorAll('tr[data-testid="matrix-row"]');
      const output = [];
  
      rows.forEach(row => {
        const flightInfo = row.querySelector('p.footnote-description');
        const flightNumber = flightInfo ? flightInfo.textContent.split('—')[0].trim() : 'N/A';
        const fareButtons = row.querySelectorAll('div[id^="Fare_"] button.valuetile');
        const cabins = [];
  
        fareButtons.forEach(button => {
          const classNameEl = button.querySelector('.class-of-service-text');
          const milesEl = button.querySelector('.miles');
          const taxEl = button.querySelector('.currency-container');
  
          const className = classNameEl ? classNameEl.textContent.trim() : null;
          const miles = milesEl ? milesEl.textContent.trim() : null;
          const tax = taxEl ? taxEl.textContent.trim() : null;

          if (!className || !miles || !tax) {
            return;
          }
  
          cabins.push({
            class: Object.keys(TICKET_CLASS_MAPPING).find(key => TICKET_CLASS_MAPPING[key] === className),
            miles: parseFloat(miles.split(' ')[0].replace('k', '')) * 1000,
            tax: tax
          });
        });
  
        output.push({
          flight: flightNumber,
          cabins: cabins,
        });
      });
  
      return output;
    }, TICKET_CLASS_MAPPING);

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
    slack.send('Error: ' + error.message + '\n' + 'url:' + searchConditionUrl);
    browser.close();

    return flightData;
  }
});

  module.exports = { checkAlaskaSchedules };
