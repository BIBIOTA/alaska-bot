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
    const schedules = await client.keys('alaska:schedules:*');

    const sortedSchedules = schedules.sort((a, b) => {
      const dateA = a.split(':')[2];
      const dateB = b.split(':')[2];
      return moment(dateA).diff(moment(dateB));
    });

    if (sortedSchedules.length > 0) {
      for (let i = 0; i < schedules.length; i++) {
        const schedule = await client.get(schedules[i]);
        const date = schedules[i].split(':')[2];
        if (moment(date).isBefore(moment())) {
          await client.del(schedules[i]);
          continue;
        }

        const flightData = await checkAlaskaSchedules(schedule);

        console.log({date, ...flightData});

        let message = '';
        if (flightData.flights.length > 0) {
          message += `[${date} ${flightData.departure} => ${flightData.arrival}]: \n`;
          flightData.flights.forEach((flight) => {
            message += `Flight: ${flight.flight}\n`;
            let classMiles = 'Miles:\n';
            flight.cabins.map(cabin => {
              const className = cabin.class.charAt(0).toUpperCase() + cabin.class.slice(1);
              const miles = cabin.miles + ' miles';
              const tax = cabin.tax + ' USD';
              classMiles += `${className}: ${miles} ${tax} \n`;
            });
            message += classMiles;
          });
          message += `Link: ${flightData.url}\n`;
        }
  
        if (message) {
          notify.send(message);
        }  
      }
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