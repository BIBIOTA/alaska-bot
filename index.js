const { checkAlaskaSchedules } = require('./alaska');
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
const { slack } = require('./slack');

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
          slack.send(message);
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

  schdules.forEach(async(schedule) => {
    const { departureDate, departure, arrival } = schedule;
    momentDepartureDate = moment(departureDate);
    const ttl = momentDepartureDate.diff(moment(), 'seconds');
    await client.set(`alaska:schedules:${momentDepartureDate.format('YYYYMMDD')}:${departure}:${arrival}`, JSON.stringify(schedule), {
      EX: ttl,
    });
  });
  
  response.json({
    status: 'success',
    message: 'Add Alaska multiple schedules',
    data: req.body,
  });
});

app.get('', (request, response) => {
  response.json({
    message: 'Hello world',
  });
});

server.listen(process.env.PORT, () => slack.send('Start !'));