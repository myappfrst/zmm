process.env.TZ = "Asia/Tashkent";
/**
 * ============================================================================
 * ZOOM WORKPLACE — RENDER.COM PRODUCTION WEB & API SERVER (server.js)
 * ============================================================================
 * Render.com (HTTPS) va lokal muhit uchun asosiy server:
 * - index.html, style.css, app.js, api.js va src/ papkasidagi rasmlarni ulashadi
 * - Avtomatik ravishda chat_database.json xotira faylini yaratadi va har bir
 *   yozilgan xabar, tahrir, o'chirish, meeting hamda statusni doimiy saqlaydi
 * - Telegram Bot (bot.js) modulini avtomatik ishga tushiradi va 24/7 ushlab turadi
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { startTelegramBot, CONTACTS, parseDateTimeInput, parseMeetingRangeInput, formatTimeHHMM } = require('./bot');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'chat_database.json');

// ==========================================
// AVTOMATIK XOTIRA BAZASI (chat_database.json)
// ==========================================
let db = {
    events: [],
    deletedIds: [],
    statusOverrides: {},
    activityLog: []
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            db.events = Array.isArray(parsed.events) ? parsed.events : [];
            db.deletedIds = Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [];
            db.statusOverrides = parsed.statusOverrides || {};
            db.activityLog = Array.isArray(parsed.activityLog) ? parsed.activityLog : [];
        } else {
            saveDatabase();
        }
    } catch (err) {
        console.error('Xotira bazasini o\'qishda xatolik:', err.message);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    } catch (err) {
        console.error('Xotira bazasini saqlashda xatolik:', err.message);
    }
}

function logProcess(action, details) {
    db.activityLog.push({
        time: new Date().toISOString(),
        action,
        details
    });
    if (db.activityLog.length > 500) {
        db.activityLog = db.activityLog.slice(-500);
    }
    saveDatabase();
}

loadDatabase();

// manifest.json va sw.js fayllari yo'q bo'lsa avtomatik yaratish
const MANIFEST_FILE = path.join(__dirname, 'manifest.json');
if (!fs.existsSync(MANIFEST_FILE)) {
    fs.writeFileSync(MANIFEST_FILE, JSON.stringify({
        name: 'Zoom Workplace',
        short_name: 'Zoom',
        description: 'Zoom Workplace Team Chat & Meetings',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
            { src: 'src/favicon.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: 'src/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
            { src: 'src/favicon.png', sizes: '180x180', type: 'image/png' }
        ]
    }, null, 2), 'utf8');
}

const SW_FILE = path.join(__dirname, 'sw.js');
if (!fs.existsSync(SW_FILE)) {
    fs.writeFileSync(SW_FILE, `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        for (const c of list) { if ('focus' in c) return c.focus(); }
        if (self.clients.openWindow) return self.clients.openWindow('/');
    }));
});
`, 'utf8');
}

// ==========================================
// BAZA AMALLARI (BOT VA API UCHUN)
// ==========================================
function addChatMessageEvent({ chat, type, text, timestamp, timeStr, replyToLast = false }) {
    const meta = CONTACTS[chat] || CONTACTS.james;
    const ev = {
        id: 'bot-msg-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
        kind: 'message',
        chat,
        senderName: meta.name,
        type: type || 'received',
        text,
        replyToLast: !!replyToLast,
        timestamp,
        timeStr: timeStr || formatTimeHHMM(new Date(timestamp))
    };
    db.events.push(ev);
    logProcess('add_message', { id: ev.id, chat, type: ev.type, timeStr: ev.timeStr });
    return ev;
}

function addMeetingEvents({ chat, startTimestamp, endTimestamp, startStr, endStr, dateStr, durationMins, isMissed = false }) {
    const meta = CONTACTS[chat] || CONTACTS.james;
    const baseId = Date.now() + '-' + Math.floor(Math.random() * 1000);

    if (isMissed) {
        const missedSys = {
            id: `bot-missed-${baseId}`,
            kind: 'message',
            chat,
            type: 'system',
            systemStyle: 'danger',
            text: `Missed video call - ${startStr}`,
            timestamp: startTimestamp,
            timeStr: startStr
        };
        const missedRecord = {
            id: `bot-mrec-${baseId}`,
            kind: 'meeting_record',
            person: chat,
            name: meta.name,
            role: meta.role,
            avatarType: meta.avatarType,
            avatarSrc: meta.avatarSrc || '',
            avatarText: meta.avatarText,
            timestamp: startTimestamp,
            dateStr,
            timeRange: startStr,
            durationMins: 0,
            status: 'missed'
        };
        db.events.push(missedSys, missedRecord);
        logProcess('add_missed_call', { chat, dateStr, startStr });
        return [missedSys, missedRecord];
    }

    const startSys = {
        id: `bot-mstart-${baseId}`,
        kind: 'message',
        chat,
        type: 'system',
        systemStyle: 'normal',
        text: `Video meeting started - ${startStr}`,
        timestamp: startTimestamp,
        timeStr: startStr
    };

    const endSys = {
        id: `bot-mend-${baseId}`,
        kind: 'message',
        chat,
        type: 'system',
        systemStyle: 'danger',
        text: `Video meeting ended (${durationMins} min${durationMins > 1 ? 's' : ''}) - ${endStr}`,
        timestamp: endTimestamp,
        timeStr: endStr
    };

    const meetingRec = {
        id: `bot-mrec-${baseId}`,
        kind: 'meeting_record',
        person: chat,
        name: meta.name,
        role: meta.role,
        avatarType: meta.avatarType,
        avatarSrc: meta.avatarSrc || '',
        avatarText: meta.avatarText,
        timestamp: startTimestamp,
        dateStr,
        timeRange: `${startStr} – ${endStr}`,
        durationMins,
        status: 'completed'
    };

    db.events.push(startSys, endSys, meetingRec);
    logProcess('add_meeting', { chat, dateStr, timeRange: `${startStr} – ${endStr}`, durationMins });
    return [startSys, endSys, meetingRec];
}

const dbController = {
    getDb: () => db,
    saveDatabase,
    logProcess,
    addChatMessageEvent,
    addMeetingEvents
};

// ==========================================
// HTTP SERVER & REST API
// ==========================================
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // Render Health Check
    if (pathname === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', uptime: process.uptime(), eventsCount: db.events.length }));
        return;
    }

    // 1. GET /api/sync
    if (pathname === '/api/sync' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            events: db.events,
            deletedIds: db.deletedIds,
            statusOverrides: db.statusOverrides
        }));
        return;
    }

    // 2. POST /api/client-message
    if (pathname === '/api/client-message' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { chat, msgObj } = JSON.parse(body);
                if (chat && msgObj && msgObj.id) {
                    const existingIdx = db.events.findIndex(e => e.id === msgObj.id);
                    const storedEv = {
                        id: msgObj.id,
                        kind: 'message',
                        chat,
                        type: msgObj.type || 'sent',
                        timestamp: msgObj.timestamp || Date.now(),
                        html: msgObj.html
                    };
                    if (existingIdx >= 0) db.events[existingIdx] = storedEv;
                    else db.events.push(storedEv);
                    logProcess('client_message', { id: msgObj.id, chat, type: storedEv.type });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // 3. POST /api/client-delete
    if (pathname === '/api/client-delete' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { chat, ids } = JSON.parse(body);
                if (Array.isArray(ids)) {
                    ids.forEach(id => {
                        if (!db.deletedIds.includes(id)) db.deletedIds.push(id);
                    });
                    db.events = db.events.filter(e => !ids.includes(e.id));
                    logProcess('client_delete', { chat, ids });
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // 4. POST /api/bot-event
    if (pathname === '/api/bot-event' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (payload.action === 'message') {
                    const dt = parseDateTimeInput(payload.time || 'now');
                    const ev = addChatMessageEvent({
                        chat: payload.chat || 'james',
                        type: payload.type || 'received',
                        text: payload.text || '',
                        timestamp: dt ? dt.timestamp : Date.now(),
                        timeStr: dt ? dt.timeStr : formatTimeHHMM(new Date()),
                        replyToLast: !!payload.replyToLast
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, event: ev }));
                    return;
                }
                if (payload.action === 'meeting') {
                    const range = parseMeetingRangeInput(payload.range);
                    if (!range) throw new Error('Invalid meeting range format');
                    const evs = addMeetingEvents({
                        chat: payload.chat || 'james',
                        ...range,
                        isMissed: !!payload.isMissed
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true, events: evs }));
                    return;
                }
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Unknown action' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: e.message }));
            }
        });
        return;
    }

    // 5. Statik fayllarni ulashish (index.html, style.css, app.js, api.js va src/ ichidagi rasmlar)
    let requestedPath = (pathname === '/' || pathname === '/nets.html' || pathname === '/rest.html')
        ? '/index.html'
        : decodeURIComponent(pathname);

    let filePath = path.join(__dirname, requestedPath);

    if (!fs.existsSync(filePath)) {
        const baseName = path.basename(requestedPath);
        const inSrc = path.join(__dirname, 'src', baseName);
        const inRoot = path.join(__dirname, baseName);
        if (fs.existsSync(inSrc)) filePath = inSrc;
        else if (fs.existsSync(inRoot)) filePath = inRoot;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mime = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================================');
    console.log(`🚀 Zoom Workplace Server (Render Ready) ishga tushdi: Port ${PORT}`);
    console.log(`🌐 Web App:  http://localhost:${PORT}`);
    console.log(`📡 Sync API: http://localhost:${PORT}/api/sync`);
    console.log('==========================================================');

    startTelegramBot(dbController);

    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        setInterval(() => {
            const client = renderUrl.startsWith('https') ? https : http;
            client.get(`${renderUrl.replace(/\/$/, '')}/health`, () => {}).on('error', () => {});
        }, 10 * 60 * 1000);
    }
});

module.exports = { server, dbController };
