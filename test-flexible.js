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
