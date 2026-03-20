// Admin config endpoint
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let CHAT_ID = process.env.TELEGRAM_CHAT_ID;

exports.handler = async (event, context) => {
  // GET - return current config (without exposing token fully)
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: BOT_TOKEN ? BOT_TOKEN.substring(0, 10) + '...' : '',
        chatId: CHAT_ID
      })
    };
  }

  // POST - update config
  if (event.httpMethod === 'POST') {
    try {
      const params = new URLSearchParams(event.body);
      const token = params.get('token');
      const chatId = params.get('chatId');

      if (token && chatId) {
        // Note: In production, persist this to database or Netlify environment
        BOT_TOKEN = token;
        CHAT_ID = chatId;

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: true })
        };
      } else {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ success: false })
        };
      }
    } catch (error) {
      console.error('Error:', error);
      return { statusCode: 500, body: 'Internal Server Error' };
    }
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
