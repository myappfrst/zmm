process.env.TZ = "Asia/Tashkent";
/**
 * ============================================================================
 * ZOOM WORKPLACE — TELEGRAM BOT CONTROLLER (bot.js)
 * ============================================================================
 * Bot username: @myzoommsg_bot
 * Admin ID:     8911011200
 *
 * Imkoniyatlari:
 * 1. Tugmali interaktiv menyu (/start) VA tezkor buyruqlar (/msg, /sent, /meeting, /missed, /status_set)
 * 2. Kontakt nomidan yoki Sizning nomingizdan:
 *    - Oddiy matnli xabar
 *    - 1 ta rasm yoki BIR NECHTA RASM (Album — 2, 3, 4 va 4 tadan ko'p rasmlar bitta guruh bo'lib tushadi!)
 *    - Video (MP4 / MOV)
 *    - Fayl / Hujjat (PDF, DOCX, XLSX, ZIP va h.k. — izohi bilan yoki izohsiz)
 *    - Ovozli xabar (Voice / Audio)
 * 3. Video Meeting (boshlanish va tugash vaqti bilan) yoki Missed Call qo'shish
 * 4. Kontakt statusini (Online / Offline / Auto) boshqarish
 * ============================================================================
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BOT_USERNAME = '@myzoommsg_bot';
const DEFAULT_BOT_TOKEN = '8805330579:AAGCm6sNKME1Qj55SIDraMLDm83U6jfVN-8';
const ADMIN_TELEGRAM_ID = 8911011200;

const UPLOADS_DIR = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(UPLOADS_DIR)) {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
} catch (e) {}

const CONTACTS = {
    james: { name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA' },
    levin: { name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH' },
    rowan: { name: 'Rowan', role: 'HR Manager • Human Resources', avatarType: 'img', avatarSrc: 'src/rwn.jpg', avatarText: 'RW' },
    andreas: { name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW' },
    owen: { name: 'Judge Owen', role: 'Federal Judge • Judiciary', avatarType: 'ob', avatarText: 'OB' }
};

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTimeHHMM(dateObj) {
    return dateObj.getHours().toString().padStart(2, '0') + ':' + dateObj.getMinutes().toString().padStart(2, '0');
}

function formatBytesSize(bytes) {
    const b = Number(bytes) || 0;
    if (b <= 0) return '';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function parseDateTimeInput(rawStr) {
    const s = (rawStr || '').trim();
    const now = new Date();
    if (!s || s.toLowerCase() === 'now' || s.toLowerCase() === 'hozir') {
        return {
            dateObj: now,
            timestamp: now.getTime(),
            timeStr: formatTimeHHMM(now),
            dateStr: `${MONTHS_SHORT[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`
        };
    }

    let m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(m[1], 10), parseInt(m[2], 10), 0, 0);
        return {
            dateObj: d,
            timestamp: d.getTime(),
            timeStr: formatTimeHHMM(d),
            dateStr: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
        };
    }

    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (m) {
        const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), parseInt(m[4], 10), parseInt(m[5], 10), 0, 0);
        return {
            dateObj: d,
            timestamp: d.getTime(),
            timeStr: formatTimeHHMM(d),
            dateStr: `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
        };
    }

    return null;
}

function parseMeetingRangeInput(rawRange) {
    const s = (rawRange || '').trim();
    const now = new Date();

    let m = s.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})\s+)?(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) return null;

    const year = m[1] ? parseInt(m[1], 10) : now.getFullYear();
    const monthIdx = m[2] ? parseInt(m[2], 10) - 1 : now.getMonth();
    const day = m[3] ? parseInt(m[3], 10) : now.getDate();

    const sh = parseInt(m[4], 10);
    const sm = parseInt(m[5], 10);
    const eh = parseInt(m[6], 10);
    const em = parseInt(m[7], 10);

    const startDate = new Date(year, monthIdx, day, sh, sm, 0, 0);
    let endDate = new Date(year, monthIdx, day, eh, em, 0, 0);
    if (endDate <= startDate) {
        endDate = new Date(endDate.getTime() + 24 * 3600 * 1000);
    }

    const durationMins = Math.max(1, Math.round((endDate - startDate) / 60000));
    const dateStr = `${MONTHS_SHORT[startDate.getMonth()]} ${startDate.getDate()}, ${startDate.getFullYear()}`;

    return {
        startTimestamp: startDate.getTime(),
        endTimestamp: endDate.getTime(),
        startStr: formatTimeHHMM(startDate),
        endStr: formatTimeHHMM(endDate),
        dateStr,
        durationMins
    };
}

function tgRequest(token, method, payload = {}) {
    return new Promise((resolve) => {
        const data = JSON.stringify(payload);
        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${token}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            },
            timeout: 35000
        }, (res) => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false }); }
            });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
        req.write(data);
        req.end();
    });
}

function downloadUrlToBuffer(fileUrl) {
    return new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({
                buffer: Buffer.concat(chunks),
                contentType: res.headers['content-type'] || 'application/octet-stream'
            }));
        }).on('error', reject);
    });
}

async function fetchTelegramFileBuffer(token, fileId) {
    const info = await tgRequest(token, 'getFile', { file_id: fileId });
    if (!info || !info.ok || !info.result || !info.result.file_path) {
        throw new Error('Telegram getFile failed');
    }
    const tgFilePath = info.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${token}/${tgFilePath}`;
    const downloaded = await downloadUrlToBuffer(fileUrl);
    return {
        buffer: downloaded.buffer,
        filePath: tgFilePath,
        fileSize: info.result.file_size || downloaded.buffer.length
    };
}

async function extractMediaFromMessage(msg, token) {
    if (!msg) return null;

    let mediaType = null;
    let fileId = null;
    let fileName = null;
    let fileSize = 0;
    let mimeType = '';
    let durationSec = 0;

    if (Array.isArray(msg.photo) && msg.photo.length > 0) {
        const bestPhoto = msg.photo[msg.photo.length - 1];
        mediaType = 'photo';
        fileId = bestPhoto.file_id;
        fileSize = bestPhoto.file_size || 0;
        fileName = `Photo_${msg.message_id || Date.now()}.jpg`;
        mimeType = 'image/jpeg';
    } else if (msg.video) {
        mediaType = 'video';
        fileId = msg.video.file_id;
        fileSize = msg.video.file_size || 0;
        fileName = msg.video.file_name || `Video_${msg.message_id || Date.now()}.mp4`;
        mimeType = msg.video.mime_type || 'video/mp4';
        durationSec = msg.video.duration || 0;
    } else if (msg.video_note) {
        mediaType = 'video';
        fileId = msg.video_note.file_id;
        fileSize = msg.video_note.file_size || 0;
        fileName = `VideoNote_${msg.message_id || Date.now()}.mp4`;
        mimeType = 'video/mp4';
        durationSec = msg.video_note.duration || 0;
    } else if (msg.animation) {
        mediaType = 'video';
        fileId = msg.animation.file_id;
        fileSize = msg.animation.file_size || 0;
        fileName = msg.animation.file_name || `Animation_${msg.message_id || Date.now()}.mp4`;
        mimeType = msg.animation.mime_type || 'video/mp4';
    } else if (msg.voice) {
        mediaType = 'voice';
        fileId = msg.voice.file_id;
        fileSize = msg.voice.file_size || 0;
        fileName = `Voice_${msg.message_id || Date.now()}.ogg`;
        mimeType = msg.voice.mime_type || 'audio/ogg';
        durationSec = msg.voice.duration || 10;
    } else if (msg.audio) {
        mediaType = 'voice';
        fileId = msg.audio.file_id;
        fileSize = msg.audio.file_size || 0;
        fileName = msg.audio.file_name || `Audio_${msg.message_id || Date.now()}.mp3`;
        mimeType = msg.audio.mime_type || 'audio/mpeg';
        durationSec = msg.audio.duration || 15;
    } else if (msg.document) {
        const doc = msg.document;
        fileId = doc.file_id;
        fileSize = doc.file_size || 0;
        fileName = doc.file_name || `Document_${Date.now()}`;
        mimeType = doc.mime_type || 'application/octet-stream';
        if (mimeType.startsWith('image/') && /\.(jpg|jpeg|png|webp|gif)$/i.test(fileName)) {
            mediaType = 'photo';
        } else if (mimeType.startsWith('video/') && /\.(mp4|mov|webm)$/i.test(fileName)) {
            mediaType = 'video';
        } else {
            mediaType = 'document';
        }
    }

    if (!mediaType || !fileId) return null;

    const safeBaseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileHash = crypto.createHash('md5').update(String(fileId)).digest('hex').slice(0, 20);
    const localFileName = `${fileHash}_${safeBaseName}`;
    const localFullPath = path.join(UPLOADS_DIR, localFileName);

    try {
        if (!fs.existsSync(localFullPath) && (!fileSize || fileSize < 15 * 1024 * 1024)) {
            const downloaded = await fetchTelegramFileBuffer(token, fileId);
            fs.writeFileSync(localFullPath, downloaded.buffer);
            if (!fileSize) fileSize = downloaded.fileSize;
        }
    } catch (e) {}

    const mediaUrl = `/api/tg-file/${encodeURIComponent(fileId)}/${encodeURIComponent(fileName)}`;

    return {
        mediaType,
        fileId,
        fileName,
        fileSize,
        fileSizeStr: formatBytesSize(fileSize),
        mimeType,
        durationSec,
        mediaUrl
    };
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function mainMenuKeyboard() {
    return {
        keyboard: [
            [{ text: '📩 Xabar qo\'shish (Kontakt nomidan)' }],
            [{ text: '📤 Xabar qo\'shish (Sizning nomingizdan)' }],
            [{ text: '📹 Video Meeting qo\'shish' }, { text: '📞 Missed Call qo\'shish' }],
            [{ text: '🟢 Kontakt statusini o\'zgartirish' }],
            [{ text: '📊 Holat va Xotira' }, { text: '💾 Baza (Backup)' }],
            [{ text: '📖 Yo\'riqnoma' }]
        ],
        resize_keyboard: true
    };
}

function contactPickerKeyboard() {
    return {
        keyboard: [
            [{ text: '👤 james — James (Attorney)' }, { text: '👤 levin — Levin Hart' }],
            [{ text: '👤 rowan — Rowan (HR)' }, { text: '👤 andreas — Andreas Waibel' }],
            [{ text: '👤 owen — Judge Owen' }],
            [{ text: '❌ Bekor qilish' }]
        ],
        resize_keyboard: true
    };
}

function timeQuickKeyboard() {
    return {
        keyboard: [
            [{ text: '⚡ Hozir (darhol)' }],
            [{ text: '❌ Bekor qilish' }]
        ],
        resize_keyboard: true
    };
}

function statusModeKeyboard() {
    return {
        keyboard: [
            [{ text: '🟢 online' }, { text: '⚪ offline' }, { text: '🔄 auto' }],
            [{ text: '❌ Bekor qilish' }]
        ],
        resize_keyboard: true
    };
}

function startTelegramBot(dbController) {
    const token = process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
    if (!token) return;

    let offset = 0;
    const adminSessions = new Map();
    const mediaBatches = new Map();

    console.log(`🤖 Telegram Bot (${BOT_USERNAME}) ulandi! Admin ID: ${ADMIN_TELEGRAM_ID}`);

    function extractChatKey(input) {
        const clean = (input || '').trim().toLowerCase();
        if (clean.startsWith('👤 ')) {
            const parts = clean.replace('👤 ', '').split(/\s+/);
            if (CONTACTS[parts[0]]) return parts[0];
        }
        if (CONTACTS[clean]) return clean;
        return null;
    }

    async function finalizeMediaBatch(batchKey) {
        const batch = mediaBatches.get(batchKey);
        if (!batch) return;
        mediaBatches.delete(batchKey);

        const { chatId, targetChat, msgType, dt, items, captions } = batch;
        const combinedCaption = captions.filter(Boolean).join('\n').trim();
        const isImmediate = dt.timestamp <= Date.now() + 2000;

        // Agar 2 ta yoki undan ko'p rasm bo'lsa (2, 3, 4 yoki 4+ rasm) -> bitta ALBUM qilib guruhlaymiz!
        const photoItems = items.filter(it => it.mediaType === 'photo');
        if (photoItems.length >= 2) {
            const ev = dbController.addChatMessageEvent({
                chat: targetChat,
                type: msgType,
                text: combinedCaption,
                timestamp: dt.timestamp,
                timeStr: dt.timeStr,
                mediaType: 'album',
                mediaUrl: photoItems[0].mediaUrl,
                fileName: `${photoItems.length} photos`,
                mediaItems: photoItems.map(p => ({
                    mediaType: 'photo',
                    mediaUrl: p.mediaUrl,
                    fileId: p.fileId,
                    fileName: p.fileName,
                    fileSize: p.fileSize,
                    fileSizeStr: p.fileSizeStr
                }))
            });

            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                parse_mode: 'HTML',
                text: `✅ <b>Guruhlangan rasmlar (${photoItems.length} ta) bitta xabar sifatida qo'shildi!</b>\n\n` +
                      `👤 <b>Chat:</b> ${CONTACTS[targetChat].name}\n` +
                      `🔄 <b>Turi:</b> ${msgType === 'received' ? 'Kontakt nomidan' : 'Sizning nomingizdan'}\n` +
                      `🖼 <b>Rasmlar soni:</b> ${photoItems.length} ta (Album)\n` +
                      `🕒 <b>Vaqt:</b> ${dt.dateStr} • ${dt.timeStr} ${isImmediate ? '(Darhol chiqdi)' : '(Belgilangan vaqtda chiqadi)'}` +
                      (combinedCaption ? `\n💬 <b>Izoh:</b> ${escapeHtml(combinedCaption)}` : ''),
                reply_markup: mainMenuKeyboard()
            });
            return;
        }

        // Aks holda 1 ta media (yoki alohida fayllar)
        for (let i = 0; i < items.length; i++) {
            const mediaInfo = items[i];
            const cap = (i === 0) ? combinedCaption : '';
            dbController.addChatMessageEvent({
                chat: targetChat,
                type: msgType,
                text: cap,
                timestamp: dt.timestamp + i,
                timeStr: dt.timeStr,
                mediaType: mediaInfo.mediaType,
                mediaUrl: mediaInfo.mediaUrl,
                fileId: mediaInfo.fileId,
                fileName: mediaInfo.fileName,
                fileSize: mediaInfo.fileSize,
                fileSizeStr: mediaInfo.fileSizeStr,
                mimeType: mediaInfo.mimeType,
                durationSec: mediaInfo.durationSec
            });
        }

        const first = items[0];
        const mediaBadge = first.mediaType === 'photo'
            ? `📷 Rasm (${escapeHtml(first.fileName)})`
            : first.mediaType === 'video'
            ? `🎥 Video (${escapeHtml(first.fileName)})`
            : first.mediaType === 'voice'
            ? `🎤 Ovozli xabar (${first.durationSec || 0}s)`
            : `📄 Fayl: <b>${escapeHtml(first.fileName)}</b> (${first.fileSizeStr || ''})`;

        await tgRequest(token, 'sendMessage', {
            chat_id: chatId,
            parse_mode: 'HTML',
            text: `✅ <b>Media/Fayl muvaffaqiyatli qo'shildi!</b>\n\n` +
                  `👤 <b>Chat:</b> ${CONTACTS[targetChat].name}\n` +
                  `🔄 <b>Turi:</b> ${msgType === 'received' ? 'Kontakt nomidan' : 'Sizning nomingizdan'}\n` +
                  `📎 <b>Format:</b> ${mediaBadge}\n` +
                  `🕒 <b>Vaqt:</b> ${dt.dateStr} • ${dt.timeStr} ${isImmediate ? '(Darhol chiqdi)' : '(Belgilangan vaqtda chiqadi)'}` +
                  (combinedCaption ? `\n💬 <b>Izoh:</b> ${escapeHtml(combinedCaption)}` : ''),
            reply_markup: mainMenuKeyboard()
        });
    }

    function queueMediaIntoBatch(batchKey, { chatId, targetChat, msgType, dt, mediaInfo, caption }) {
        let batch = mediaBatches.get(batchKey);
        if (!batch) {
            batch = {
                chatId,
                targetChat,
                msgType,
                dt,
                items: [],
                captions: [],
                timer: null
            };
            mediaBatches.set(batchKey, batch);
        }
        batch.items.push(mediaInfo);
        if (caption && caption.trim()) {
            batch.captions.push(caption.trim());
        }
        if (batch.timer) clearTimeout(batch.timer);
        batch.timer = setTimeout(() => {
            finalizeMediaBatch(batchKey).catch(console.error);
        }, 1100);
    }

    async function handleIncomingMessage(msg) {
        const chatId = msg.chat.id;
        const fromId = msg.from ? msg.from.id : 0;
        const rawText = (msg.text || msg.caption || '').trim();
        const text = rawText;

        if (fromId !== ADMIN_TELEGRAM_ID && chatId !== ADMIN_TELEGRAM_ID) {
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                parse_mode: 'HTML',
                text: `⛔ <b>Ruxsat yo'q!</b>\nUshbu bot faqat tizim administratori uchun ishlaydi.`
            });
            return;
        }

        // Agar media_group_id bo'lsa va allaqachon aktiv batch bo'lsa, to'g'ridan-to'g'ri o'sha batchga qo'shamiz
        if (msg.media_group_id) {
            const groupKey = `mg_${chatId}_${msg.media_group_id}`;
            if (mediaBatches.has(groupKey)) {
                const mediaInfo = await extractMediaFromMessage(msg, token);
                if (mediaInfo) {
                    const existing = mediaBatches.get(groupKey);
                    queueMediaIntoBatch(groupKey, {
                        chatId,
                        targetChat: existing.targetChat,
                        msgType: existing.msgType,
                        dt: existing.dt,
                        mediaInfo,
                        caption: rawText
                    });
                    return;
                }
            }
        }

        if (text === '❌ Bekor qilish' || text === '/cancel') {
            adminSessions.delete(chatId);
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '✅ Amal bekor qilindi. Asosiy menyudasiz:',
                reply_markup: mainMenuKeyboard()
            });
            return;
        }

        if (text === '/start' || text === '/help' || text === '📖 Yo\'riqnoma') {
            adminSessions.delete(chatId);
            const helpMsg =
                `🎯 <b>Zoom Workplace — Boshqaruv Boti (${BOT_USERNAME})</b>\n\n` +
                `Pastdagi <b>tugmalar</b> orqali yoki to'g'ridan-to'g'ri buyruqlar yordamida chatga matn, <b>bir nechta rasm (Album)</b>, <b>video</b>, <b>fayl (PDF, Word, ZIP)</b> va <b>ovozli xabar</b> yuborishingiz mumkin:\n\n` +
                `📎 <b>Ko'p rasm / Fayl / Video yuborish:</b>\n` +
                `• Menyudan <b>«📩 Xabar qo'shish»</b> tugmasini bosing $\\rightarrow$ kontaktni va vaqtni tanlang $\\rightarrow$ botga <b>1 ta yoki bir nechta rasm (2, 3, 4 yoki 10 ta!)</b>, <b>Video</b>, <b>Fayl (PDF/DOCX)</b> yoki <b>Ovozli xabar</b> yuboring!\n` +
                `• Bir nechta rasm tanlab yuborsangiz, chatda hammasi <b>bitta guruh (Album)</b> bo'lib tushadi.\n\n` +
                `🔹 <b>Tezkor buyruqlar:</b>\n` +
                `<code>/msg levin now Salom</code>\n` +
                `<code>/sent james 14:20 Hujjatlarni ko'rdim</code>\n` +
                `<code>/meeting levin 16:00-16:25</code>\n` +
                `<code>/missed rowan 11:40</code>`;

            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: helpMsg,
                parse_mode: 'HTML',
                reply_markup: mainMenuKeyboard()
            });
            return;
        }

        if (text === '/backup' || text === '💾 Baza (Backup)') {
            const db = dbController.getDb();
            const jsonStr = JSON.stringify(db, null, 2);
            const preview = jsonStr.length <= 3500
                ? `<pre>${escapeHtml(jsonStr)}</pre>`
                : `<pre>${escapeHtml(jsonStr.slice(0, 3500))}\n... (to'liq nusxani /api/sync orqali oling)</pre>`;
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                parse_mode: 'HTML',
                text: `💾 <b>Joriy Xotira Bazasi (chat_database.json)</b>\n\n` +
                      `Jami eventlar: <b>${db.events.length} ta</b>\n` +
                      `Push obunachilar: <b>${(db.pushSubscriptions || []).length} ta</b>\n\n` +
                      preview,
                reply_markup: mainMenuKeyboard()
            });
            return;
        }

        if (text === '/status' || text === '📊 Holat va Xotira') {
            const db = dbController.getDb();
            const totalEvents = db.events.length;
            const pendingEvents = db.events.filter(e => e.timestamp > Date.now()).length;
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                parse_mode: 'HTML',
                text: `📊 <b>Xotira bazasi holati:</b>\n\n` +
                      `• Jami saqlangan xabar va meetinglar: <b>${totalEvents} ta</b>\n` +
                      `• Navbatda kutayotgan (rejalashtirilgan): <b>${pendingEvents} ta</b>\n` +
                      `• Web Push obunalar: <b>${(db.pushSubscriptions || []).length} ta qurilma</b>`,
                reply_markup: mainMenuKeyboard()
            });
            return;
        }

        if (text === '📩 Xabar qo\'shish (Kontakt nomidan)') {
            adminSessions.set(chatId, { mode: 'msg_received', step: 'pick_contact' });
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '👤 Qaysi kontaktdan xabar, guruhlangan rasm, video yoki fayl kelishi kerak? Tanlang:',
                reply_markup: contactPickerKeyboard()
            });
            return;
        }

        if (text === '📤 Xabar qo\'shish (Sizning nomingizdan)') {
            adminSessions.set(chatId, { mode: 'msg_sent', step: 'pick_contact' });
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '👤 Qaysi chatga o\'z nomingizdan xabar, rasm, video yoki fayl qo\'shmoqchisiz? Tanlang:',
                reply_markup: contactPickerKeyboard()
            });
            return;
        }

        if (text === '📹 Video Meeting qo\'shish') {
            adminSessions.set(chatId, { mode: 'meeting', step: 'pick_contact' });
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '👤 Kim bilan Video Meeting bo\'lib o\'tdi? Kontaktni tanlang:',
                reply_markup: contactPickerKeyboard()
            });
            return;
        }

        if (text === '📞 Missed Call qo\'shish') {
            adminSessions.set(chatId, { mode: 'missed', step: 'pick_contact' });
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '👤 Kimdan Missed Video Call bo\'ldi? Kontaktni tanlang:',
                reply_markup: contactPickerKeyboard()
            });
            return;
        }

        if (text === '🟢 Kontakt statusini o\'zgartirish') {
            adminSessions.set(chatId, { mode: 'status_set', step: 'pick_contact' });
            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                text: '👤 Qaysi kontaktning Online/Offline statusini o\'zgartiramiz?',
                reply_markup: contactPickerKeyboard()
            });
            return;
        }

        // INTERAKTIV QADAMLAR
        if (adminSessions.has(chatId) && !text.startsWith('/')) {
            const session = adminSessions.get(chatId);

            if (session.step === 'pick_contact') {
                const cKey = extractChatKey(text);
                if (!cKey) {
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        text: '⚠️ Iltimos, pastdagi tugmalardan birini tanlang:',
                        reply_markup: contactPickerKeyboard()
                    });
                    return;
                }
                session.chat = cKey;

                if (session.mode === 'msg_received' || session.mode === 'msg_sent' || session.mode === 'missed') {
                    session.step = 'pick_time';
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        parse_mode: 'HTML',
                        text: `🕒 <b>Vaqtini kiriting:</b>\n\n` +
                              `• Darhol chiqishi uchun <b>«⚡ Hozir (darhol)»</b> tugmasini bosing;\n` +
                              `• Bugungi soat uchun: <code>18:30</code>\n` +
                              `• Aniq sana va soat uchun: <code>2026-10-14 18:30</code>`,
                        reply_markup: timeQuickKeyboard()
                    });
                    return;
                }

                if (session.mode === 'meeting') {
                    session.step = 'pick_range';
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        parse_mode: 'HTML',
                        text: `📹 <b>Meeting boshlanish va tugash vaqtini kiriting:</b>\n\n` +
                              `• Bugun uchun: <code>16:00-16:25</code>\n` +
                              `• Aniq sana bilan: <code>2026-10-14 16:00-16:25</code>`
                    });
                    return;
                }

                if (session.mode === 'status_set') {
                    session.step = 'pick_status_mode';
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        text: `🟢 ${CONTACTS[cKey].name} uchun holatni tanlang:`,
                        reply_markup: statusModeKeyboard()
                    });
                    return;
                }
            }

            if (session.step === 'pick_time') {
                const rawT = (text === '⚡ Hozir (darhol)') ? 'now' : text;
                const dt = parseDateTimeInput(rawT);
                if (!dt) {
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        parse_mode: 'HTML',
                        text: `⚠️ Vaqt noto'g'ri! Misol: <code>18:30</code> yoki <code>2026-10-14 18:30</code> yoki <b>«⚡ Hozir (darhol)»</b> tugmasini bosing.`,
                        reply_markup: timeQuickKeyboard()
                    });
                    return;
                }
                session.dt = dt;

                if (session.mode === 'missed') {
                    dbController.addMeetingEvents({
                        chat: session.chat,
                        startTimestamp: dt.timestamp,
                        endTimestamp: dt.timestamp,
                        startStr: dt.timeStr,
                        endStr: dt.timeStr,
                        dateStr: dt.dateStr,
                        durationMins: 0,
                        isMissed: true
                    });
                    adminSessions.delete(chatId);
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        parse_mode: 'HTML',
                        text: `✅ <b>Missed Video Call qo'shildi!</b>\n👤 <b>Kontakt:</b> ${CONTACTS[session.chat].name}\n🕒 <b>Vaqt:</b> ${dt.dateStr} • ${dt.timeStr}`,
                        reply_markup: mainMenuKeyboard()
                    });
                    return;
                }

                session.step = 'await_text';
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `✍️ <b>Endi xabar matnini yozing yoki to'g'ridan-to'g'ri Rasm (1 ta yoki bir nechta!), Video, Fayl (PDF/DOCX/ZIP) yoki Ovozli xabar yuboring:</b>\n\n` +
                          `<i>💡 Bir nechta rasm (2, 3, 4 yoki 4+ ta) belgilab yuborsangiz, hammasi bitta guruh (Album) bo'lib chatga tushadi!</i>`
                });
                return;
            }

            if (session.step === 'await_text') {
                const mediaInfo = await extractMediaFromMessage(msg, token);
                if (!mediaInfo && !text) {
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        text: '⚠️ Iltimos, xabar matnini yozing yoki rasm / video / fayl / ovozli xabar yuboring!'
                    });
                    return;
                }

                const msgType = session.mode === 'msg_sent' ? 'sent' : 'received';
                const targetChat = session.chat;
                const dt = session.dt;
                adminSessions.delete(chatId);

                // Agar rasm/media yuborilgan bo'lsa, bir nechta rasm (album) kelishini 1.1 soniya kutib guruhlaymiz
                if (mediaInfo) {
                    const batchKey = msg.media_group_id ? `mg_${chatId}_${msg.media_group_id}` : `wiz_${chatId}_${targetChat}`;
                    queueMediaIntoBatch(batchKey, {
                        chatId,
                        targetChat,
                        msgType,
                        dt,
                        mediaInfo,
                        caption: text
                    });
                    return;
                }

                // Oddiy matnli xabar
                dbController.addChatMessageEvent({
                    chat: targetChat,
                    type: msgType,
                    text,
                    timestamp: dt.timestamp,
                    timeStr: dt.timeStr
                });

                const isImmediate = dt.timestamp <= Date.now() + 2000;
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `✅ <b>Xabar muvaffaqiyatli qo'shildi!</b>\n\n` +
                          `👤 <b>Chat:</b> ${CONTACTS[targetChat].name}\n` +
                          `🔄 <b>Turi:</b> ${msgType === 'received' ? 'Kontakt nomidan' : 'Sizning nomingizdan'}\n` +
                          `🕒 <b>Vaqt:</b> ${dt.dateStr} • ${dt.timeStr} ${isImmediate ? '(Darhol chiqdi)' : '(Belgilangan vaqtda chiqadi)'}\n` +
                          `💬 <b>Matn:</b> ${escapeHtml(text)}`,
                    reply_markup: mainMenuKeyboard()
                });
                return;
            }

            if (session.step === 'pick_range') {
                const range = parseMeetingRangeInput(text);
                if (!range) {
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        parse_mode: 'HTML',
                        text: `⚠️ Format noto'g'ri! Misol: <code>16:00-16:25</code> yoki <code>2026-10-14 16:00-16:25</code>`
                    });
                    return;
                }
                dbController.addMeetingEvents({
                    chat: session.chat,
                    ...range,
                    isMissed: false
                });
                adminSessions.delete(chatId);
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `✅ <b>Video Meeting qo'shildi!</b>\n\n` +
                          `👤 <b>Chat:</b> ${CONTACTS[session.chat].name}\n` +
                          `📅 <b>Sana:</b> ${range.dateStr}\n` +
                          `🕒 <b>Vaqt:</b> ${range.startStr} – ${range.endStr} (${range.durationMins} min)`,
                    reply_markup: mainMenuKeyboard()
                });
                return;
            }

            if (session.step === 'pick_status_mode') {
                const cleanMode = text.replace(/🟢|⚪|🔄/g, '').trim().toLowerCase();
                if (!['online', 'offline', 'auto'].includes(cleanMode)) {
                    await tgRequest(token, 'sendMessage', {
                        chat_id: chatId,
                        text: '⚠️ Iltimos, online, offline yoki auto tugmasini bosing:',
                        reply_markup: statusModeKeyboard()
                    });
                    return;
                }
                const db = dbController.getDb();
                if (cleanMode === 'auto') {
                    delete db.statusOverrides[session.chat];
                } else {
                    db.statusOverrides[session.chat] = { mode: cleanMode, timestamp: Date.now() };
                }
                dbController.logProcess('status_override', { chat: session.chat, mode: cleanMode });
                adminSessions.delete(chatId);
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `✅ <b>${CONTACTS[session.chat].name}</b> statusi <b>${cleanMode.toUpperCase()}</b> holatiga o'zgartirildi!`,
                    reply_markup: mainMenuKeyboard()
                });
                return;
            }
        }

        // 1. /msg va /sent buyruqlari
        let cmdMatch = text.match(/^\/(msg|sent)\s+(james|levin|rowan|andreas|owen)\s+(\S+)(?:\s+([\s\S]+))?$/i);
        if (cmdMatch) {
            const cmd = cmdMatch[1].toLowerCase();
            const chat = cmdMatch[2].toLowerCase();
            let timeToken = cmdMatch[3];
            let msgBody = cmdMatch[4] || '';

            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(timeToken)) {
                const subMatch = msgBody.match(/^(\d{1,2}:\d{2})(?:\s+([\s\S]+))?$/);
                if (subMatch) {
                    timeToken = `${timeToken} ${subMatch[1]}`;
                    msgBody = subMatch[2] || '';
                }
            }

            const dt = parseDateTimeInput(timeToken);
            if (!dt) {
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `⚠️ Vaqt formati noto'g'ri! Misol:\n<code>/${cmd} ${chat} now Xabar matni</code>`
                });
                return;
            }

            const mediaInfo = await extractMediaFromMessage(msg, token);
            if (!mediaInfo && !msgBody.trim()) {
                await tgRequest(token, 'sendMessage', {
                    chat_id: chatId,
                    parse_mode: 'HTML',
                    text: `⚠️ Xabar matnini yozing yoki rasm/video/fayl ilova qiling!`
                });
                return;
            }

            const msgType = cmd === 'sent' ? 'sent' : 'received';
            if (mediaInfo) {
                const batchKey = msg.media_group_id ? `mg_${chatId}_${msg.media_group_id}` : `cmd_${chatId}_${chat}`;
                queueMediaIntoBatch(batchKey, {
                    chatId,
                    targetChat: chat,
                    msgType,
                    dt,
                    mediaInfo,
                    caption: msgBody.trim()
                });
                return;
            }

            dbController.addChatMessageEvent({
                chat,
                type: msgType,
                text: msgBody.trim(),
                timestamp: dt.timestamp,
                timeStr: dt.timeStr
            });

            await tgRequest(token, 'sendMessage', {
                chat_id: chatId,
                parse_mode: 'HTML',
                text: `✅ <b>Qo'shildi!</b>\n👤 <b>Chat:</b> ${CONTACTS[chat].name}\n🕒 <b>Vaqt:</b> ${dt.dateStr} • ${dt.timeStr}`,
                reply_markup: mainMenuKeyboard()
            });
            return;
        }
    }

    async function pollUpdates() {
        try {
            const res = await tgRequest(token, 'getUpdates', {
                offset: offset,
                timeout: 20,
                allowed_updates: ['message']
            });
            if (res && res.ok && Array.isArray(res.result)) {
                for (const upd of res.result) {
                    offset = upd.update_id + 1;
                    if (upd.message) {
                        await handleIncomingMessage(upd.message);
                    }
                }
            }
        } catch (err) {}
        setTimeout(pollUpdates, 1200);
    }

    pollUpdates();
}

module.exports = {
    startTelegramBot,
    CONTACTS,
    parseDateTimeInput,
    parseMeetingRangeInput,
    formatTimeHHMM,
    fetchTelegramFileBuffer,
    DEFAULT_BOT_TOKEN,
    UPLOADS_DIR
};
