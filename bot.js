/**
 * ============================================================================
 * ZOOM WORKPLACE — TELEGRAM BOT CONTROLLER MODULE (bot.js)
 * ============================================================================
 * Bot username: @myzoommsg_bot
 * Admin ID:     8911011200
 * Hech qanday .env faylsiz to'g'ridan-to'g'ri Render.com va lokalda 24/7 ishlaydi!
 * ============================================================================
 */

process.env.TZ = 'Asia/Tashkent';

const https = require('https');

// ==========================================
// BOT VA ADMIN SOZLAMALARI (ENV TALAB QILMAYDI)
// ==========================================
const BOT_USERNAME = '@myzoommsg_bot';
const DEFAULT_BOT_TOKEN = '8805330579:AAGCm6sNKME1Qj55SIDraMLDm83U6jfVN-8';
const ADMIN_TELEGRAM_ID = 8911011200;

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

function formatDateReadable(dateObj) {
    return `${MONTHS_SHORT[dateObj.getMonth()]} ${dateObj.getDate()}, ${dateObj.getFullYear()}`;
}

function parseDateTimeInput(inputStr) {
    const clean = (inputStr || '').trim();
    if (!clean || clean.toLowerCase() === 'now' || clean.toLowerCase() === 'hozir') {
        const d = new Date();
        return { timestamp: d.getTime(), timeStr: formatTimeHHMM(d), dateStr: formatDateReadable(d), dateObj: d };
    }

    const fullMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{1,2})$/);
    if (fullMatch) {
        const day = parseInt(fullMatch[1], 10);
        const month = parseInt(fullMatch[2], 10) - 1;
        const year = parseInt(fullMatch[3], 10);
        const hour = parseInt(fullMatch[4], 10);
        const min = parseInt(fullMatch[5], 10);
        const d = new Date(year, month, day, hour, min, 0);
        return { timestamp: d.getTime(), timeStr: formatTimeHHMM(d), dateStr: formatDateReadable(d), dateObj: d };
    }

    const timeOnlyMatch = clean.match(/^(\d{1,2}):(\d{1,2})$/);
    if (timeOnlyMatch) {
        const now = new Date();
        const hour = parseInt(timeOnlyMatch[1], 10);
        const min = parseInt(timeOnlyMatch[2], 10);
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0);
        return { timestamp: d.getTime(), timeStr: formatTimeHHMM(d), dateStr: formatDateReadable(d), dateObj: d };
    }

    return null;
}

function parseMeetingRangeInput(inputStr) {
    const clean = (inputStr || '').trim().replace(/\s*-\s*/g, ' ');
    const fullMatch = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s+(\d{1,2}):(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
    if (fullMatch) {
        const day = parseInt(fullMatch[1], 10);
        const month = parseInt(fullMatch[2], 10) - 1;
        const year = parseInt(fullMatch[3], 10);
        const h1 = parseInt(fullMatch[4], 10), m1 = parseInt(fullMatch[5], 10);
        const h2 = parseInt(fullMatch[6], 10), m2 = parseInt(fullMatch[7], 10);
        const startD = new Date(year, month, day, h1, m1, 0);
        let endD = new Date(year, month, day, h2, m2, 0);
        if (endD < startD) endD = new Date(endD.getTime() + 24 * 60 * 60 * 1000);
        const durationMins = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 60000));
        return {
            startTimestamp: startD.getTime(),
            endTimestamp: endD.getTime(),
            startStr: formatTimeHHMM(startD),
            endStr: formatTimeHHMM(endD),
            dateStr: formatDateReadable(startD),
            durationMins
        };
    }

    const shortMatch = clean.match(/^(\d{1,2}):(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
    if (shortMatch) {
        const now = new Date();
        const h1 = parseInt(shortMatch[1], 10), m1 = parseInt(shortMatch[2], 10);
        const h2 = parseInt(shortMatch[3], 10), m2 = parseInt(shortMatch[4], 10);
        const startD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h1, m1, 0);
        let endD = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h2, m2, 0);
        if (endD < startD) endD = new Date(endD.getTime() + 24 * 60 * 60 * 1000);
        const durationMins = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / 60000));
        return {
            startTimestamp: startD.getTime(),
            endTimestamp: endD.getTime(),
            startStr: formatTimeHHMM(startD),
            endStr: formatTimeHHMM(endD),
            dateStr: formatDateReadable(startD),
            durationMins
        };
    }

    return null;
}

function isAuthorizedAdmin(userId, chatId) {
    return Number(userId) === ADMIN_TELEGRAM_ID || Number(chatId) === ADMIN_TELEGRAM_ID;
}

function startTelegramBot(dbController, customToken) {
    const token = customToken || DEFAULT_BOT_TOKEN;
    const userSessions = {};

    function tgApiRequest(method, payload = {}) {
        return new Promise((resolve) => {
            const data = JSON.stringify(payload);
            const req = https.request({
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${token}/${method}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, (res) => {
                let body = '';
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try { resolve(JSON.parse(body)); } catch (e) { resolve({ ok: false }); }
                });
            });
            req.on('error', () => resolve({ ok: false }));
            req.write(data);
            req.end();
        });
    }

    function sendMainMenu(chatId, text = `🎛 <b>Zoom Workplace Boshqaruv Paneli (${BOT_USERNAME})</b>\n\nQuyidagi amallardan birini tanlang:`) {
        return tgApiRequest('sendMessage', {
            chat_id: chatId,
            text,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💬 Yangi xabar qo\'shish / rejalashtirish', callback_data: 'menu_add_msg' }],
                    [{ text: '📹 Yangi Video Meeting qo\'shish', callback_data: 'menu_add_meet' }],
                    [{ text: '🟢 Suhbatdosh statusi (Online / Last seen)', callback_data: 'menu_status' }],
                    [{ text: '📋 Qo\'shilgan xabar va meetinglar ro\'yxati', callback_data: 'menu_list' }]
                ]
            }
        });
    }

    function contactPickerKeyboard(prefix) {
        return {
            inline_keyboard: [
                [
                    { text: '👔 James (Attorney)', callback_data: `${prefix}_james` },
                    { text: '⚖️ Levin Hart', callback_data: `${prefix}_levin` }
                ],
                [
                    { text: '👩‍💼 Rowan (HR)', callback_data: `${prefix}_rowan` },
                    { text: '🏦 Andreas Waibel', callback_data: `${prefix}_andreas` }
                ],
                [
                    { text: '👨‍⚖️ Judge Owen', callback_data: `${prefix}_owen` }
                ],
                [{ text: '🔙 Orqaga (Bosh menyu)', callback_data: 'back_main' }]
            ]
        };
    }

    async function handleCallbackQuery(cb) {
        const chatId = cb.message.chat.id;
        const fromId = cb.from ? cb.from.id : chatId;

        if (!isAuthorizedAdmin(fromId, chatId)) {
            return tgApiRequest('answerCallbackQuery', {
                callback_query_id: cb.id,
                text: '⛔ Sizda ushbu botdan foydalanish huquqi yo\'q!',
                show_alert: true
            });
        }

        const data = cb.data;
        const db = dbController.getDb();
        await tgApiRequest('answerCallbackQuery', { callback_query_id: cb.id });

        if (data === 'back_main') {
            delete userSessions[chatId];
            return sendMainMenu(chatId);
        }

        if (data === 'menu_add_msg') {
            userSessions[chatId] = { mode: 'msg', step: 'pick_chat' };
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '💬 <b>Qaysi chatga xabar qo\'shmoqchisiz?</b>',
                parse_mode: 'HTML',
                reply_markup: contactPickerKeyboard('msgchat')
            });
        }

        if (data.startsWith('msgchat_')) {
            const targetChat = data.replace('msgchat_', '');
            userSessions[chatId] = { mode: 'msg', step: 'pick_dir', chat: targetChat };
            const meta = CONTACTS[targetChat];
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: `👤 Tanlangan chat: <b>${meta.name}</b>\n\nXabar kimning nomidan ko'rinishi kerak?`,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: `📩 ${meta.name} dan kelgan (Push + Ovoz)`, callback_data: 'msgdir_received_no' }],
                        [{ text: `↩️ ${meta.name} dan (Oxirgi xabarga Reply qilib)`, callback_data: 'msgdir_received_yes' }],
                        [{ text: '📤 Mening nomimdan yuborilgan (Sent)', callback_data: 'msgdir_sent_no' }],
                        [{ text: '🔙 Orqaga', callback_data: 'back_main' }]
                    ]
                }
            });
        }

        if (data.startsWith('msgdir_')) {
            const parts = data.split('_');
            const dir = parts[1];
            const replyToLast = parts[2] === 'yes';
            const sess = userSessions[chatId] || {};
            sess.type = dir;
            sess.replyToLast = replyToLast;
            sess.step = 'pick_time';
            userSessions[chatId] = sess;

            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '🕒 <b>Xabar qachon chiqishi kerak? (Toshkent vaqti bilan)</b>\n\n• Hozir darhol chiqishi uchun pastdagi tugmani bosing.\n• Yoki vaqtni yozib yuboring (masalan: <code>18:30</code> yoki <code>14.10.2026 18:30</code>):',
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '⚡ Hozir darhol (Now)', callback_data: 'msgtime_now' }],
                        [{ text: '🔙 Bekor qilish', callback_data: 'back_main' }]
                    ]
                }
            });
        }

        if (data === 'msgtime_now') {
            const sess = userSessions[chatId];
            if (!sess || !sess.chat) return sendMainMenu(chatId);
            sess.timeInput = 'now';
            sess.step = 'enter_text';
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '✍️ <b>Endi xabar matnini yozib yuboring:</b>',
                parse_mode: 'HTML'
            });
        }

        if (data === 'menu_add_meet') {
            userSessions[chatId] = { mode: 'meet', step: 'pick_chat' };
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '📹 <b>Kim bilan bo\'lgan Video Meetingni qo\'shmoqchisiz?</b>',
                parse_mode: 'HTML',
                reply_markup: contactPickerKeyboard('meetchat')
            });
        }

        if (data.startsWith('meetchat_')) {
            const targetChat = data.replace('meetchat_', '');
            userSessions[chatId] = { mode: 'meet', step: 'pick_type', chat: targetChat };
            const meta = CONTACTS[targetChat];
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: `📹 Suhbatdosh: <b>${meta.name}</b>\n\nMeeting turini tanlang:`,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📹 Boshlangan va tugagan Video Meeting', callback_data: 'meettype_completed' }],
                        [{ text: '📵 O\'tkazib yuborilgan qo\'ng\'iroq (Missed Call)', callback_data: 'meettype_missed' }],
                        [{ text: '🔙 Orqaga', callback_data: 'back_main' }]
                    ]
                }
            });
        }

        if (data === 'meettype_completed') {
            const sess = userSessions[chatId];
            if (!sess) return sendMainMenu(chatId);
            sess.isMissed = false;
            sess.step = 'enter_meet_range';
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '🕒 <b>Meeting boshlanish va tugash vaqtini yuboring:</b>\n\nMisol (bugun uchun):\n<code>04:34 04:43</code>\n\nMisol (aniq sana bilan):\n<code>14.10.2026 04:34 04:43</code>',
                parse_mode: 'HTML'
            });
        }

        if (data === 'meettype_missed') {
            const sess = userSessions[chatId];
            if (!sess) return sendMainMenu(chatId);
            sess.isMissed = true;
            sess.step = 'enter_missed_time';
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '🕒 <b>Missed Call vaqtini yuboring:</b>\n\nMisol: <code>16:40</code> yoki <code>14.10.2026 16:40</code>',
                parse_mode: 'HTML'
            });
        }

        if (data === 'menu_status') {
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '🟢 <b>Qaysi suhbatdoshning Online / Last seen statusini o\'zgartirmoqchisiz?</b>',
                parse_mode: 'HTML',
                reply_markup: contactPickerKeyboard('statuschat')
            });
        }

        if (data.startsWith('statuschat_')) {
            const targetChat = data.replace('statuschat_', '');
            userSessions[chatId] = { mode: 'status', chat: targetChat, step: 'pick_status' };
            const meta = CONTACTS[targetChat];
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: `👤 <b>${meta.name}</b> uchun statusni tanlang yoki oxirgi faollik (last seen) vaqtini yozib yuboring (masalan: <code>14.10.2026 05:15</code>):`,
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🟢 Hozir Online qilish', callback_data: `setonline_${targetChat}` }],
                        [{ text: '🔄 Standart holatga qaytarish', callback_data: `resetstatus_${targetChat}` }],
                        [{ text: '🔙 Orqaga', callback_data: 'back_main' }]
                    ]
                }
            });
        }

        if (data.startsWith('setonline_')) {
            const targetChat = data.replace('setonline_', '');
            db.statusOverrides[targetChat] = { mode: 'online' };
            dbController.logProcess('status_online', { chat: targetChat });
            delete userSessions[chatId];
            return sendMainMenu(chatId, `✅ <b>${CONTACTS[targetChat].name}</b> statusi <b>online</b> qilindi!`);
        }

        if (data.startsWith('resetstatus_')) {
            const targetChat = data.replace('resetstatus_', '');
            delete db.statusOverrides[targetChat];
            dbController.logProcess('status_reset', { chat: targetChat });
            delete userSessions[chatId];
            return sendMainMenu(chatId, `✅ <b>${CONTACTS[targetChat].name}</b> statusi standart holatga qaytarildi.`);
        }

        if (data === 'menu_list') {
            if (db.events.length === 0) {
                return sendMainMenu(chatId, '📭 Hozircha qo\'shimcha xabar yoki meetinglar yo\'q.');
            }
            const recent = db.events.slice(-10);
            const buttons = recent.map(ev => {
                const label = ev.kind === 'meeting_record'
                    ? `🗑 [Meeting] ${ev.name} (${ev.timeRange})`
                    : `🗑 [${ev.chat}] ${(ev.text || 'Xabar').substring(0, 24)}...`;
                return [{ text: label, callback_data: `delev_${ev.id}` }];
            });
            buttons.push([{ text: '🔙 Bosh menyu', callback_data: 'back_main' }]);
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: `📋 <b>Oxirgi qo'shilgan ${recent.length} ta element:</b>\nO'chirish uchun ustiga bosing:`,
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        }

        if (data.startsWith('delev_')) {
            const evId = data.replace('delev_', '');
            db.events = db.events.filter(e => e.id !== evId);
            if (!db.deletedIds.includes(evId)) db.deletedIds.push(evId);
            dbController.logProcess('bot_delete_event', { id: evId });
            return sendMainMenu(chatId, `🗑 Element (<code>${evId}</code>) o'chirildi!`);
        }
    }

    async function handleTextMessage(msg) {
        const chatId = msg.chat.id;
        const fromId = msg.from ? msg.from.id : chatId;

        if (!isAuthorizedAdmin(fromId, chatId)) {
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: '⛔ Sizda ushbu botdan foydalanish huquqi yo\'q.'
            });
        }

        const text = (msg.text || '').trim();
        const db = dbController.getDb();
        if (!text) return;

        if (text === '/start' || text === '/menu') {
            delete userSessions[chatId];
            return sendMainMenu(chatId);
        }

        if (text.startsWith('/msg ') || text.startsWith('/sent ')) {
            const isSent = text.startsWith('/sent ');
            const rest = text.replace(/^\/(msg|sent)\s+/, '');
            const firstSpace = rest.indexOf(' ');
            if (firstSpace < 0) return;
            const chatKey = rest.slice(0, firstSpace).toLowerCase();
            const afterChat = rest.slice(firstSpace + 1).trim();

            let dt = null;
            let msgBody = '';

            const fullMatch = afterChat.match(/^(\d{1,2}[./-]\d{1,2}[./-]\d{4}\s+\d{1,2}:\d{1,2})\s+([\s\S]+)$/);
            const shortMatch = afterChat.match(/^(\d{1,2}:\d{1,2}|now|hozir)\s+([\s\S]+)$/i);

            if (fullMatch) {
                dt = parseDateTimeInput(fullMatch[1]);
                msgBody = fullMatch[2];
            } else if (shortMatch) {
                dt = parseDateTimeInput(shortMatch[1]);
                msgBody = shortMatch[2];
            }

            if (CONTACTS[chatKey] && dt && msgBody) {
                const ev = dbController.addChatMessageEvent({
                    chat: chatKey,
                    type: isSent ? 'sent' : 'received',
                    text: msgBody,
                    timestamp: dt.timestamp,
                    timeStr: dt.timeStr
                });
                return sendMainMenu(chatId, `✅ <b>Xabar saqlandi!</b>\n👤 Chat: <b>${CONTACTS[chatKey].name}</b>\n🕒 Vaqt: <b>${dt.dateStr}, ${dt.timeStr}</b>\n📝 Matn: ${ev.text}`);
            }
        }

        if (text.startsWith('/meet ')) {
            const rest = text.replace(/^\/meet\s+/, '').trim();
            const firstSpace = rest.indexOf(' ');
            if (firstSpace > 0) {
                const chatKey = rest.slice(0, firstSpace).toLowerCase();
                const rangeStr = rest.slice(firstSpace + 1).trim();
                const range = parseMeetingRangeInput(rangeStr);
                if (CONTACTS[chatKey] && range) {
                    dbController.addMeetingEvents({ chat: chatKey, ...range, isMissed: false });
                    return sendMainMenu(chatId, `✅ <b>Video Meeting qo'shildi!</b>\n👤 Chat: <b>${CONTACTS[chatKey].name}</b>\n📅 Sana: <b>${range.dateStr}</b>\n🕒 Vaqt: <b>${range.startStr} – ${range.endStr} (${range.durationMins} mins)</b>`);
                }
            }
        }

        const sess = userSessions[chatId];
        if (!sess) {
            return sendMainMenu(chatId);
        }

        if (sess.mode === 'msg' && sess.step === 'pick_time') {
            const parsed = parseDateTimeInput(text);
            if (!parsed) {
                return tgApiRequest('sendMessage', {
                    chat_id: chatId,
                    text: '⚠️ Vaqt formati noto\'g\'ri. Iltimos, <code>18:30</code> yoki <code>14.10.2026 18:30</code> ko\'rinishida yozing:',
                    parse_mode: 'HTML'
                });
            }
            sess.timeData = parsed;
            sess.step = 'enter_text';
            return tgApiRequest('sendMessage', {
                chat_id: chatId,
                text: `🕒 Belgilangan vaqt: <b>${parsed.dateStr}, ${parsed.timeStr}</b>\n\n✍️ <b>Endi xabar matnini yozib yuboring:</b>`,
                parse_mode: 'HTML'
            });
        }

        if (sess.mode === 'msg' && sess.step === 'enter_text') {
            const dt = sess.timeData || parseDateTimeInput(sess.timeInput || 'now');
            const ev = dbController.addChatMessageEvent({
                chat: sess.chat,
                type: sess.type || 'received',
                text,
                timestamp: dt.timestamp,
                timeStr: dt.timeStr,
                replyToLast: !!sess.replyToLast
            });
            const meta = CONTACTS[sess.chat];
            delete userSessions[chatId];
            const statusNote = dt.timestamp > Date.now()
                ? '⏳ Belgilangan vaqt kelishi bilan chatda Push va ovozli bildirishnoma bilan chiqadi!'
                : '✅ Darhol chatga qo\'shildi!';
            return sendMainMenu(
                chatId,
                `✅ <b>Xabar muvaffaqiyatli qo'shildi!</b>\n\n👤 Chat: <b>${meta.name}</b>\n↔️ Yo'nalish: <b>${ev.type === 'received' ? meta.name + ' dan' : 'Sizning nomingizdan'}</b>\n🕒 Vaqt: <b>${dt.dateStr}, ${dt.timeStr}</b>\n💬 Matn: <i>${text}</i>\n\n${statusNote}`
            );
        }

        if (sess.mode === 'meet' && sess.step === 'enter_meet_range') {
            const range = parseMeetingRangeInput(text);
            if (!range) {
                return tgApiRequest('sendMessage', {
                    chat_id: chatId,
                    text: '⚠️ Format noto\'g\'ri! Misol: <code>04:34 04:43</code> yoki <code>14.10.2026 04:34 04:43</code>',
                    parse_mode: 'HTML'
                });
            }
            dbController.addMeetingEvents({ chat: sess.chat, ...range, isMissed: false });
            const meta = CONTACTS[sess.chat];
            delete userSessions[chatId];
            return sendMainMenu(
                chatId,
                `✅ <b>Video Meeting chatga va Meetings bo'limiga qo'shildi!</b>\n\n👤 Suhbatdosh: <b>${meta.name}</b>\n📅 Sana: <b>${range.dateStr}</b>\n🕒 Boshlandi: <b>${range.startStr}</b>\n🛑 Tugadi: <b>${range.endStr} (${range.durationMins} mins)</b>`
            );
        }

        if (sess.mode === 'meet' && sess.step === 'enter_missed_time') {
            const dt = parseDateTimeInput(text);
            if (!dt) {
                return tgApiRequest('sendMessage', {
                    chat_id: chatId,
                    text: '⚠️ Format noto\'g\'ri! Misol: <code>16:40</code> yoki <code>14.10.2026 16:40</code>',
                    parse_mode: 'HTML'
                });
            }
            dbController.addMeetingEvents({
                chat: sess.chat,
                startTimestamp: dt.timestamp,
                endTimestamp: dt.timestamp,
                startStr: dt.timeStr,
                endStr: dt.timeStr,
                dateStr: dt.dateStr,
                durationMins: 0,
                isMissed: true
            });
            const meta = CONTACTS[sess.chat];
            delete userSessions[chatId];
            return sendMainMenu(
                chatId,
                `✅ <b>Missed Call qo'shildi!</b>\n\n👤 Suhbatdosh: <b>${meta.name}</b>\n📅 Sana va vaqt: <b>${dt.dateStr}, ${dt.timeStr}</b>`
            );
        }

        if (sess.mode === 'status' && sess.step === 'pick_status') {
            const dt = parseDateTimeInput(text);
            if (!dt) {
                return tgApiRequest('sendMessage', {
                    chat_id: chatId,
                    text: '⚠️ Vaqt formati noto\'g\'ri! Misol: <code>14.10.2026 05:15</code> yoki <code>05:15</code>',
                    parse_mode: 'HTML'
                });
            }
            db.statusOverrides[sess.chat] = { mode: 'offline', timestamp: dt.timestamp };
            dbController.logProcess('status_offline', { chat: sess.chat, timestamp: dt.timestamp });
            const meta = CONTACTS[sess.chat];
            delete userSessions[chatId];
            return sendMainMenu(chatId, `✅ <b>${meta.name}</b> oxirgi faollik vaqti <b>${dt.dateStr}, ${dt.timeStr}</b> ga o'rnatildi!`);
        }
    }

    let lastUpdateId = 0;
    (async function pollLoop() {
        console.log(`🤖 [bot.js] ${BOT_USERNAME} (Admin: ${ADMIN_TELEGRAM_ID}) ulandi va 24/7 buyruqlarni kutmoqda...`);
        while (true) {
            try {
                const res = await tgApiRequest('getUpdates', {
                    offset: lastUpdateId + 1,
                    timeout: 25
                });
                if (res && res.ok && Array.isArray(res.result)) {
                    for (const upd of res.result) {
                        lastUpdateId = upd.update_id;
                        if (upd.message) await handleTextMessage(upd.message);
                        else if (upd.callback_query) await handleCallbackQuery(upd.callback_query);
                    }
                } else {
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    })();
}

module.exports = {
    startTelegramBot,
    CONTACTS,
    parseDateTimeInput,
    parseMeetingRangeInput,
    formatTimeHHMM,
    BOT_USERNAME,
    ADMIN_TELEGRAM_ID
};

if (require.main === module) {
    require('./server');
}
