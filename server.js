process.env.TZ = "Asia/Tashkent";
/**
 * ============================================================================
 * ZOOM WORKPLACE — RENDER.COM PRODUCTION WEB & API SERVER (server.js)
 * ============================================================================
 * Render.com (HTTPS) va lokal muhit uchun asosiy server:
 * - index.html, style.css, app.js, api.js va src/ papkasidagi rasmlarni ulashadi
 * - Avtomatik ravishda chat_database.json xotira faylini yaratadi va har bir
 *   yozilgan xabar, fayl, rasm, video, ovozli xabar, tahrir, o'chirish,
 *   meeting hamda statusni doimiy saqlaydi
 * - Telegram Botdan yuborilgan rasm, video, audio va fayllarni (/api/tg-file/...)
 *   avtomatik keshlab va Telegram serveridan oqimli (stream) uzatib beradi
 * - Telegram Bot (bot.js) modulini avtomatik ishga tushiradi va 24/7 ushlab turadi
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const {
    startTelegramBot,
    CONTACTS,
    parseDateTimeInput,
    parseMeetingRangeInput,
    formatTimeHHMM,
    fetchTelegramFileBuffer,
    DEFAULT_BOT_TOKEN,
    UPLOADS_DIR
} = require('./bot');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'chat_database.json');

// ==========================================
// AVTOMATIK XOTIRA BAZASI (chat_database.json)
// ==========================================
const INITIAL_SEED_DB = {
    "events": [
        {
            "id": "msg-1791942173201",
            "kind": "message",
            "chat": "james",
            "type": "sent",
            "timestamp": 1791942181347,
            "html": "<div class=\"message-wrapper\" style=\"transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1); transform: translateX(0px);\"><div class=\"msg-bubble\"><div class=\"msg-text\" style=\"white-space: pre-wrap;\">Hi James you mentioned you would check on the GPI details for me. Have you heard back from the bank yet? I stayed up waiting for updates</div><div class=\"msg-time-container\"><span class=\"msg-edited-tag\">edited 06:43</span>06:43 <div class=\"msg-read-ticks\"><svg viewBox=\"0 0 24 24\"><path d=\"M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z\"></path></svg></div></div></div></div>"
        },
        {
            "id": "bot-msg-1791942420684-8387",
            "kind": "message",
            "chat": "james",
            "senderName": "James (Attorney)",
            "type": "received",
            "text": "Muzaffar I'll forward the update as soon as I hear from the bank. No worries BMO promised to speed things up and send the required GPI tracking code",
            "replyToLast": false,
            "timestamp": 1791942840000,
            "timeStr": "06:54"
        },
        {
            "id": "bot-msg-1791971196908-8550",
            "kind": "message",
            "chat": "levin",
            "senderName": "Levin Hart",
            "type": "received",
            "text": "Hi Muzaffar hope everything went well at the embassy. We sent all the required documents and records to the embassy via fax and email by 5:00 PM on October 13.\n\nOnce the workday starts today I'll send over the address of your rental place and the photos from the landlord",
            "replyToLast": false,
            "timestamp": 1791971880000,
            "timeStr": "14:58"
        },
        {
            "id": "msg-1791971219465",
            "kind": "message",
            "chat": "levin",
            "type": "sent",
            "timestamp": 1791972811762,
            "html": "<div class=\"message-wrapper\"><div class=\"msg-bubble\"><div class=\"msg-text\" style=\"white-space: pre-wrap;\">Yes Mr. Hart everything went great. All the documents were in order and they took my passport with no issues at all</div><div class=\"msg-time-container\">15:13 <div class=\"msg-read-ticks\"><svg viewBox=\"0 0 24 24\"><path d=\"M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z\"/></svg></div></div></div></div>"
        }
    ],
    "deletedIds": [
        "msg-1791942753845",
        "msg-1791942753846",
        "msg-1791942753847",
        "msg-1791942753848",
        "msg-1791942753849",
        "msg-1791942753850"
    ],
    "statusOverrides": {
        "levin": {
            "mode": "offline",
            "timestamp": 1791977700000
        },
        "james": {
            "mode": "offline",
            "timestamp": 1791967380000
        },
        "rowan": {
            "mode": "offline",
            "timestamp": 1791943980000
        }
    },
    "activityLog": [
        {
            "time": "2026-10-14T00:35:00.000Z",
            "action": "database_initialized",
            "details": {
                "note": "Persistent memory store for Zoom Workplace messages, meetings, and Telegram Bot actions"
            }
        },
        {
            "time": "2026-10-14T12:33:00.000Z",
            "action": "synced_from_render",
            "details": {
                "source": "https://zmm-s8ho.onrender.com/api/sync",
                "eventsCount": 4
            }
        }
    ]
};

let db = {
    events: [...INITIAL_SEED_DB.events],
    deletedIds: [...INITIAL_SEED_DB.deletedIds],
    statusOverrides: { ...INITIAL_SEED_DB.statusOverrides },
    activityLog: [...INITIAL_SEED_DB.activityLog]
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            const loadedEvents = Array.isArray(parsed.events) ? parsed.events : [];
            const loadedDeleted = Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [];
            const loadedStatus = parsed.statusOverrides || {};

            // Merge seed events if not deleted and not already present
            const mergedDeleted = Array.from(new Set([...INITIAL_SEED_DB.deletedIds, ...loadedDeleted]));
            const eventMap = new Map();
            INITIAL_SEED_DB.events.forEach(ev => {
                if (ev && ev.id && !mergedDeleted.includes(ev.id)) eventMap.set(ev.id, ev);
            });
            loadedEvents.forEach(ev => {
                if (ev && ev.id && !mergedDeleted.includes(ev.id)) eventMap.set(ev.id, ev);
            });

            db.events = Array.from(eventMap.values());
            db.deletedIds = mergedDeleted;
            db.statusOverrides = { ...INITIAL_SEED_DB.statusOverrides, ...loadedStatus };
            db.activityLog = Array.isArray(parsed.activityLog) && parsed.activityLog.length > 0
                ? parsed.activityLog
                : [...INITIAL_SEED_DB.activityLog];
            saveDatabase();
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
function addChatMessageEvent({
    chat,
    type,
    text,
    timestamp,
    timeStr,
    replyToLast = false,
    mediaType = null,
    mediaUrl = null,
    fileId = null,
    fileName = null,
    fileSize = null,
    fileSizeStr = null,
    mimeType = null,
    durationSec = null
}) {
    const meta = CONTACTS[chat] || CONTACTS.james;
    const ev = {
        id: 'bot-msg-' + Date.now() + '-' + Math.floor(Math.random() * 10000),
        kind: 'message',
        chat,
        senderName: meta.name,
        type: type || 'received',
        text: text || '',
        replyToLast: !!replyToLast,
        timestamp,
        timeStr: timeStr || formatTimeHHMM(new Date(timestamp))
    };
    if (mediaType) {
        ev.mediaType = mediaType;
        ev.mediaUrl = mediaUrl;
        ev.fileId = fileId;
        ev.fileName = fileName;
        ev.fileSize = fileSize;
        ev.fileSizeStr = fileSizeStr;
        ev.mimeType = mimeType;
        ev.durationSec = durationSec;
    }
    db.events.push(ev);
    logProcess('add_message', {
        id: ev.id,
        chat,
        type: ev.type,
        mediaType: ev.mediaType || 'text',
        fileName: ev.fileName || null,
        timeStr: ev.timeStr
    });
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
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
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

    // 0. GET /api/tg-file/:fileId/:fileName — Telegram media/fayl proksi va kesh
    if (pathname.startsWith('/api/tg-file/') && req.method === 'GET') {
        try {
            const parts = pathname.replace('/api/tg-file/', '').split('/');
            const fileId = decodeURIComponent(parts[0] || '');
            const rawFileName = decodeURIComponent(parts.slice(1).join('/') || 'attachment');
            if (!fileId) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Missing fileId');
                return;
            }

            const safeDiskName = `${fileId.slice(-24)}_${rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const localCachePath = path.join(UPLOADS_DIR, safeDiskName);
            const ext = path.extname(rawFileName).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';
            const isDownload = parsedUrl.query && parsedUrl.query.download === '1';
            const disposition = isDownload
                ? `attachment; filename="${encodeURIComponent(rawFileName)}"`
                : `inline; filename="${encodeURIComponent(rawFileName)}"`;

            if (fs.existsSync(localCachePath) && fs.statSync(localCachePath).isFile()) {
                const stat = fs.statSync(localCachePath);
                res.writeHead(200, {
                    'Content-Type': contentType,
                    'Content-Length': stat.size,
                    'Content-Disposition': disposition,
                    'Cache-Control': 'public, max-age=31536000'
                });
                fs.createReadStream(localCachePath).pipe(res);
                return;
            }

            const token = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
            const fetched = await fetchTelegramFileBuffer(token, fileId);
            if (!fetched || !fetched.buffer) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found on Telegram');
                return;
            }

            try {
                if (fetched.buffer.length <= 20 * 1024 * 1024) {
                    fs.writeFileSync(localCachePath, fetched.buffer);
                }
            } catch (e) {}

            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': fetched.buffer.length,
                'Content-Disposition': disposition,
                'Cache-Control': 'public, max-age=31536000'
            });
            res.end(fetched.buffer);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error fetching file: ' + err.message);
        }
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
                        replyToLast: !!payload.replyToLast,
                        mediaType: payload.mediaType || null,
                        mediaUrl: payload.mediaUrl || null,
                        fileId: payload.fileId || null,
                        fileName: payload.fileName || null,
                        fileSize: payload.fileSize || null,
                        fileSizeStr: payload.fileSizeStr || null,
                        mimeType: payload.mimeType || null,
                        durationSec: payload.durationSec || null
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

    const renderUrl = process.env.RENDER_EXTERNAL_URL || 'https://zmm-s8ho.onrender.com';
    if (renderUrl) {
        setInterval(() => {
            const client = renderUrl.startsWith('https') ? https : http;
            client.get(`${renderUrl.replace(/\/$/, '')}/health`, () => {}).on('error', () => {});
        }, 10 * 60 * 1000);
    }
});

module.exports = { server, dbController };
