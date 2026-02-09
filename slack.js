require('dotenv').config();
const https = require('https');

function send(message) {
  console.log(`[Slack] ${message}`);

  const webhookUrl = process.env.MY_SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return Promise.resolve();
  }

  const url = new URL(webhookUrl);
  const payload = JSON.stringify({ text: message });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { send };
