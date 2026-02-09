require('dotenv').config();
const slack = require('./slack');
const line = require('./line');

function shouldEnableSlack() {
  const enableSlackNotify = process.env.ENABLE_SLACK_NOTIFY;
  const webhookUrl = process.env.MY_SLACK_WEBHOOK_URL;

  // Backward compatibility: if webhook is set but ENABLE_SLACK_NOTIFY is not set, enable Slack
  if (enableSlackNotify === undefined && webhookUrl) {
    return true;
  }

  return enableSlackNotify === 'true';
}

function shouldEnableLine() {
  const enableLineNotify = process.env.ENABLE_LINE_NOTIFY;

  // Opt-in: LINE is only enabled if explicitly set to true
  return enableLineNotify === 'true';
}

async function send(message) {
  const promises = [];

  if (shouldEnableLine()) {
    promises.push(
      line.send(message).catch((err) => {
        console.error('[通知錯誤] LINE 發送失敗:', err.message);
      })
    );
  }

  if (shouldEnableSlack()) {
    promises.push(
      slack.send(message).catch((err) => {
        console.error('[通知錯誤] Slack 發送失敗:', err.message);
      })
    );
  }

  await Promise.allSettled(promises);
}

module.exports = { send };
