require('dotenv').config();
const https = require('https');

function send(message) {
  console.log(`[LINE] ${message}`);

  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineUserId = process.env.LINE_USER_ID;

  if (!lineToken || !lineUserId) {
    return Promise.resolve();
  }

  const payload = JSON.stringify({
    to: lineUserId,
    messages: [
      {
        type: 'text',
        text: message,
      },
    ],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.line.me',
        path: '/v2/bot/message/push',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lineToken}`,
        },
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
