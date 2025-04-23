require('dotenv').config();
const SlackNotify = require('slack-notify');
const slack = SlackNotify(process.env.MY_SLACK_WEBHOOK_URL);

module.exports = { slack };
