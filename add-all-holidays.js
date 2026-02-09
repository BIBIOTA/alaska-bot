const schedules = require('./setup-holidays.json');

async function addAll() {
  console.log(`準備添加 ${schedules.length} 個航班監控...\n`);
  
  for (let i = 0; i < schedules.length; i++) {
    const schedule = schedules[i];
    const data = {
      departureDate: schedule.departureDate,
      departure: schedule.departure,
      arrival: schedule.arrival,
      peoples: 1,
      maximumMiles: 15000,
      airlines: schedule.airlines,
      ticketClass: schedule.ticketClass
    };
    
    try {
      const response = await fetch('http://localhost:3000/alaska', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();
      if (response.ok) {
        console.log(`✅ ${i+1}/${schedules.length} ${schedule.name}: ${result.message}`);
      } else {
        console.log(`⏭️  ${i+1}/${schedules.length} ${schedule.name}: ${result.message} (跳過)`);
      }
    } catch (error) {
      console.error(`❌ ${schedule.name}: ${error.message}`);
    }
  }
  
  console.log('\n🎉 所有連假航班監控已設定完成！');
  process.exit(0);
}

addAll();
