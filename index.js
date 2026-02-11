const { checkAlaskaSchedules, checkAlaskaFlexibleDates } = require('./alaska');
require('dotenv').config();
const CronJob = require('cron').CronJob;
const express = require('express');
const app = express();
app.use(express.static(process.cwd()));
const http = require('http');
const server = http.createServer(app);
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json();
const redis = require('redis');
const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
client.connect().then(() => {
  console.log('Connected to Redis');
});
const moment = require('moment');
moment.locale('zh-tw');
const notify = require('./notify');

new CronJob(
  '0 10,22 * * *',
  async function() {
    // --- Fixed date schedules ---
    const schedules = await client.keys('alaska:schedules:*');
    // routeKey -> [{ date, flightData }]
    const fixedRouteResults = {};

    const sortedSchedules = schedules.sort((a, b) => {
      const dateA = a.split(':')[2];
      const dateB = b.split(':')[2];
      return moment(dateA).diff(moment(dateB));
    });

    for (const key of sortedSchedules) {
      const schedule = await client.get(key);
      const date = key.split(':')[2];
      if (moment(date).isBefore(moment())) {
        await client.del(key);
        continue;
      }

      const flightData = await checkAlaskaSchedules(schedule);
      console.log({ date, ...flightData });

      if (flightData.flights.length > 0) {
        const routeKey = `${flightData.departure}-${flightData.arrival}`;
        if (!fixedRouteResults[routeKey]) {
          fixedRouteResults[routeKey] = [];
        }
        fixedRouteResults[routeKey].push({ date, flightData });
      }
    }

    // Send one message per route
    for (const [routeKey, results] of Object.entries(fixedRouteResults)) {
      const [dep, arr] = routeKey.split('-');
      let message = `[${dep} → ${arr}] 找到符合條件航班：\n`;

      for (const { date, flightData } of results) {
        message += `\n📅 ${date}\n`;
        flightData.flights.forEach((flight) => {
          flight.cabins.forEach(cabin => {
            const className = cabin.class.charAt(0).toUpperCase() + cabin.class.slice(1);
            message += `  ${flight.flight} | ${className}: ${cabin.miles} miles +$${cabin.tax}\n`;
          });
        });
      }

      message += `\n🔗 ${results[0].flightData.url}\n`;
      notify.send(message);
    }

    // --- Flexible date schedules ---
    const flexSchedules = await client.keys('alaska:flexible:*');
    // routeKey -> [{ flexibleData }]
    const flexRouteResults = {};

    for (const key of flexSchedules) {
      const schedule = await client.get(key);
      const parts = key.split(':');
      const endDateStr = parts[3];

      if (moment(endDateStr, 'YYYYMMDD').isBefore(moment())) {
        await client.del(key);
        continue;
      }

      const flexibleData = await checkAlaskaFlexibleDates(schedule);
      console.log({ flexible: true, ...flexibleData });

      if (flexibleData.dates.length > 0) {
        const routeKey = `${flexibleData.departure}-${flexibleData.arrival}`;
        if (!flexRouteResults[routeKey]) {
          flexRouteResults[routeKey] = [];
        }
        flexRouteResults[routeKey].push(flexibleData);
      }
    }

    // Send one message per route
    for (const [routeKey, results] of Object.entries(flexRouteResults)) {
      const [dep, arr] = routeKey.split('-');
      let message = `[Flexible ${dep} → ${arr}] 找到符合條件日期：\n`;

      for (const flexibleData of results) {
        message += `\n📅 ${flexibleData.startDate} ~ ${flexibleData.endDate}\n`;
        flexibleData.dates.forEach((day) => {
          const dateStr = moment(day.date, 'YYYY-MM-DD').format('MM/DD');
          const miles = day.miles >= 1000 ? (day.miles / 1000) + 'k' : day.miles;
          message += `  ${dateStr}: ${miles} miles +$${day.tax}\n`;
        });
      }

      message += `\n🔗 ${results[0].url}\n`;
      notify.send(message);
    }
  },
  null,
  true,
  'Asia/Taipei'
);

app.post('/alaska', jsonParser, async(req, response) => {
  const { departureDate, departure, arrival } = req.body;

  momentDepartureDate = moment(departureDate);

  const ttl = momentDepartureDate.diff(moment(), 'seconds');

  if (ttl <= 0) {
    response.status(400).json({
      status: 'error',
      message: 'Departure date is in the past',
      data: req.body,
    });
    return;
  }

  await client.set(`alaska:schedules:${momentDepartureDate.format('YYYYMMDD')}:${departure}:${arrival}`, JSON.stringify(req.body), {
    EX: ttl,
  });

  const expiredDays = momentDepartureDate.diff(moment(), 'days');

  response.json({
    status: 'success',
    message: 'Add Alaska schedule. Expired in ' + expiredDays + ' days',
    data: req.body,
  });
});

app.post('/alaska/multiple', jsonParser, async(req, response) => {
  const schdules = req.body;

  for (const schedule of schdules) {
    const { departureDate, departure, arrival } = schedule;
    momentDepartureDate = moment(departureDate);
    const ttl = momentDepartureDate.diff(moment(), 'seconds');

    if (ttl > 0) {
      await client.set(`alaska:schedules:${momentDepartureDate.format('YYYYMMDD')}:${departure}:${arrival}`, JSON.stringify(schedule), {
        EX: ttl,
      });
    }
  }

  response.json({
    status: 'success',
    message: 'Add Alaska multiple schedules',
    data: req.body,
  });
});

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

app.get('', (request, response) => {
  response.json({
    message: 'Hello world',
  });
});

server.listen(process.env.PORT, () => notify.send('Start !'));