/**
 * ============================================================================
 * ZOOM WORKPLACE — REAL-TIME API & RENDER.COM SYNC CLIENT (api.js)
 * ============================================================================
 * Ushbu modul index.html va app.js ni server (server.js) hamda Telegram Bot
 * (bot.js) bilan real vaqtda (HTTPS / Render.com yoki localhost orqali) bog'laydi.
 * - Har bir yozilgan, tahrirlangan yoki o'chirilgan xabarni server xotirasiga saqlaydi.
 * - Telegram Bot orqali yuborilgan oddiy xabarlar, FAYLLAR (PDF, DOCX, XLSX, ZIP),
 *   RASMLAR (Photo), VIDEOLAR (Video), OVOZLI XABARLAR (Voice), video-meetinglar
 *   va statuslarni avtomatik qabul qilib, belgilangan vaqtda Push + Ovoz bilan chiqaradi.
 * ============================================================================
 */

const CONTACT_META = {
    james: { name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA' },
    levin: { name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH' },
    rowan: { name: 'Rowan', role: 'HR Manager • Human Resources', avatarType: 'img', avatarSrc: 'src/rwn.jpg', avatarText: 'RW' },
    andreas: { name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW' },
    owen: { name: 'Judge Owen', role: 'Federal Judge • Judiciary', avatarType: 'ob', avatarText: 'OB' }
};

function getCandidateApiBases() {
    const bases = [];
    const customBase = safeGetItem('zwApiBaseUrl');
    if (customBase) bases.push(customBase.replace(/\/$/, ''));
    if (window.location.protocol.startsWith('http')) {
        bases.push(window.location.origin);
        const host = window.location.hostname || '127.0.0.1';
        if (window.location.port !== '3000') {
            bases.push(`${window.location.protocol}//${host}:3000`);
        }
        if (window.location.port !== '3001') {
            bases.push(`${window.location.protocol}//${host}:3001`);
        }
    } else {
        bases.push('http://127.0.0.1:3000');
        bases.push('http://127.0.0.1:3001');
    }
    return Array.from(new Set(bases));
}

let activeApiBase = null;

function resolveMediaUrl(rawUrl) {
    if (!rawUrl) return '';
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
        return rawUrl;
    }
    if (rawUrl.startsWith('/')) {
        if (activeApiBase) return activeApiBase.replace(/\/$/, '') + rawUrl;
        if (window.location.protocol.startsWith('http')) return window.location.origin + rawUrl;
        return 'http://127.0.0.1:3000' + rawUrl;
    }
    return rawUrl;
}

async function fetchFromApi(path, options = {}) {
    const candidates = activeApiBase ? [activeApiBase, ...getCandidateApiBases()] : getCandidateApiBases();
    for (const base of candidates) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(base + path, {
                ...options,
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                activeApiBase = base;
                return await res.json();
            }
        } catch (e) {}
    }
    return null;
}

function pushUserMessageToApi(msgObj, chat) {
    fetchFromApi('/api/client-message', {
        method: 'POST',
        body: JSON.stringify({ chat, msgObj })
    });
}

function pushDeleteToApi(chat, ids) {
    fetchFromApi('/api/client-delete', {
        method: 'POST',
        body: JSON.stringify({ chat, ids })
    });
}

function getFileExtensionBadge(fileName) {
    const clean = String(fileName || '').trim();
    const parts = clean.split('.');
    if (parts.length > 1) {
        const ext = parts.pop().toUpperCase();
        return ext.slice(0, 4);
    }
    return 'FILE';
}

function buildBotAttachmentHtml(ev) {
    if (!ev || !ev.mediaType) return '';
    const mediaUrl = resolveMediaUrl(ev.mediaUrl || '');
    const downloadUrl = mediaUrl + (mediaUrl.includes('?') ? '&download=1' : '?download=1');
    const safeFileName = String(ev.fileName || 'Attachment')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const sizeLabel = ev.fileSizeStr || (ev.fileSize ? formatBytesSize(ev.fileSize) : '');

    if (ev.mediaType === 'photo') {
        return `<div class="chat-img-attachment"><img src="${mediaUrl}" alt="${safeFileName}" loading="lazy" onclick="if(!isSelectionMode) { event.stopPropagation(); openImageModal(this.src); }"></div>`;
    }

    if (ev.mediaType === 'video') {
        return `<div class="chat-video-attachment" onclick="event.stopPropagation()"><video src="${mediaUrl}" controls playsinline preload="metadata"></video></div>`;
    }

    if (ev.mediaType === 'voice') {
        const dur = Number(ev.durationSec) > 0 ? Number(ev.durationSec) : 12;
        if (typeof buildVoicePlayerHtml === 'function') {
            return buildVoicePlayerHtml(mediaUrl, dur);
        }
        return `<audio src="${mediaUrl}" controls></audio>`;
    }

    // Default: 'document' (PDF, DOCX, XLSX, ZIP, etc.)
    const extBadge = getFileExtensionBadge(ev.fileName);
    const metaSubtitle = [extBadge, sizeLabel].filter(Boolean).join(' • ');
    const isPreviewableImageOrPdf = /\.(pdf|png|jpe?g|gif|webp)$/i.test(String(ev.fileName || ''));
    const cardClickAction = isPreviewableImageOrPdf
        ? `if(!isSelectionMode && !event.ctrlKey) { event.stopPropagation(); window.open('${mediaUrl}', '_blank'); }`
        : `if(!isSelectionMode && !event.ctrlKey) { event.stopPropagation(); window.open('${downloadUrl}', '_blank'); }`;

    return `
        <div class="file-attachment" onclick="${cardClickAction}">
            <div class="file-icon-box" data-ext="${extBadge}">
                <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                <span class="file-ext-tag">${extBadge}</span>
            </div>
            <div class="file-info">
                <div class="file-name" title="${safeFileName}">${safeFileName}</div>
                <div class="file-size">${metaSubtitle || 'Document'}</div>
            </div>
            <a href="${downloadUrl}" download="${safeFileName}" target="_blank" rel="noopener" class="file-download-btn" onclick="if(isSelectionMode) event.preventDefault(); event.stopPropagation()">
                <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                <span>Download</span>
            </a>
        </div>
    `;
}

function buildBotMessageHtml(ev) {
    if (ev.html) return ev.html;
    const timeStr = ev.timeStr || getCurrentTime(ev.timestamp);
    const meta = CONTACT_META[ev.chat] || { name: 'User' };
    const senderName = ev.senderName || meta.name;

    if (ev.type === 'system') {
        const isEndedOrMissed = ev.systemStyle === 'danger' || (ev.text && (ev.text.includes('ended') || ev.text.includes('Missed')));
        const styleAttr = isEndedOrMissed ? ' style="background: rgba(234,67,53,0.1); color: #ea4335;"' : '';
        const iconSvg = isEndedOrMissed
            ? `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`
            : `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg>`;
        return `<div class="system-msg-container"><div class="system-msg"${styleAttr}>${iconSvg} ${ev.text}</div></div>`;
    }

    let replyHTML = '';
    if (ev.replyToText) {
        const rAuthor = ev.replyToSender || (ev.type === 'received' ? 'Muzaffar Rasulov' : senderName);
        const rSnippet = ev.replyToText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (ev.type === 'received') {
            replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">${rAuthor}</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${rSnippet}</div></div>`;
        } else {
            replyHTML = `<div class="reply-box" style="border-left: 3px solid #fff; background: rgba(255, 255, 255, 0.2); padding: 6px 10px; margin-bottom: 8px; border-radius: 6px; font-size: 12px; color: #fff; cursor: pointer;"><div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${rAuthor}</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9;">${rSnippet}</div></div>`;
        }
    } else if (ev.replyToLast && chatHistories[ev.chat] && chatHistories[ev.chat].length > 0) {
        const prevMsgs = chatHistories[ev.chat].filter(m => m.type !== 'system' && m.timestamp < ev.timestamp);
        const lastM = prevMsgs[prevMsgs.length - 1];
        if (lastM) {
            const tmp = document.createElement('div');
            tmp.innerHTML = lastM.html;
            const tEl = tmp.querySelector('.msg-text');
            const fEl = tmp.querySelector('.file-name');
            let snip = 'Message';
            if (tEl && tEl.innerText.trim()) snip = tEl.innerText.trim().substring(0, 80);
            else if (fEl && fEl.innerText.trim()) snip = '📄 ' + fEl.innerText.trim().substring(0, 70);
            else if (tmp.querySelector('.chat-img-attachment')) snip = '📷 Photo';
            else if (tmp.querySelector('.chat-video-attachment')) snip = '🎥 Video';
            else if (tmp.querySelector('.voice-msg-player')) snip = '🎤 Voice message';

            const rAuthor = lastM.type === 'sent' ? 'Muzaffar Rasulov' : senderName;
            if (ev.type === 'received') {
                replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">${rAuthor}</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${snip}</div></div>`;
            } else {
                replyHTML = `<div class="reply-box" style="border-left: 3px solid #fff; background: rgba(255, 255, 255, 0.2); padding: 6px 10px; margin-bottom: 8px; border-radius: 6px; font-size: 12px; color: #fff; cursor: pointer;"><div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${rAuthor}</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9;">${snip}</div></div>`;
            }
        }
    }

    const attachmentHTML = buildBotAttachmentHtml(ev);
    const rawText = (ev.text || '').trim();
    const safeText = rawText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const textMarginStyle = attachmentHTML && safeText ? 'margin-top: 6px;' : '';
    const textBlockHTML = safeText
        ? `<div class="msg-text" style="white-space: pre-wrap; ${textMarginStyle}">${safeText}</div>`
        : (!attachmentHTML ? `<div class="msg-text" style="white-space: pre-wrap;"></div>` : '');

    if (ev.type === 'sent') {
        return `<div class="message-wrapper"><div class="msg-bubble">${replyHTML}${attachmentHTML}${textBlockHTML}<div class="msg-time-container">${timeStr} ${readTicksHTML}</div></div></div>`;
    } else {
        return `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">${senderName}</div>${replyHTML}${attachmentHTML}${textBlockHTML}<div class="msg-time-container">${timeStr}</div></div></div>`;
    }
}

function getNotificationPreviewForEvent(ev) {
    if (ev.text && ev.text.trim()) {
        if (ev.mediaType === 'photo') return `📷 ${ev.text.trim()}`;
        if (ev.mediaType === 'video') return `🎥 ${ev.text.trim()}`;
        if (ev.mediaType === 'document') return `📄 ${ev.text.trim()}`;
        return ev.text.trim();
    }
    if (ev.mediaType === 'photo') return '📷 Sent a photo';
    if (ev.mediaType === 'video') return '🎥 Sent a video';
    if (ev.mediaType === 'voice') return '🎤 Sent a voice message';
    if (ev.mediaType === 'document') return `📄 File: ${ev.fileName || 'Document'}`;
    return 'New message received';
}

function deliverBotEventNow(ev, isLiveTrigger = false) {
    if (!ev || !ev.id) return;
    if (deletedMessageIds.has(ev.id)) return;

    if (ev.kind === 'meeting_record') {
        const exists = customMeetingsLog.some(m => m.id === ev.id || (m.person === ev.person && m.timestamp === ev.timestamp));
        if (!exists) {
            customMeetingsLog.push(ev);
            safeSetItem('zwCustomMeetings_v1', JSON.stringify(customMeetingsLog));
            renderMeetingsHistory();
        }
        return;
    }

    const targetChat = ev.chat || 'james';
    if (!chatHistories[targetChat]) chatHistories[targetChat] = [];
    if (chatHistories[targetChat].some(m => m.id === ev.id)) return;

    const msgObj = {
        id: ev.id,
        type: ev.type || 'received',
        timestamp: ev.timestamp,
        html: buildBotMessageHtml(ev),
        isDeleted: false,
        fromBotApi: true
    };

    chatHistories[targetChat].push(msgObj);
    chatHistories[targetChat].sort((a, b) => a.timestamp - b.timestamp);
    persistCustomMessage(msgObj, targetChat);
    safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));

    rerenderSingleChatContainer(targetChat);
    updateSidebarPreview();

    const ageMs = Date.now() - ev.timestamp;
    const shouldNotify = (ev.type === 'received') && (isLiveTrigger || ageMs < 30000) && !notifiedEventIds.has(ev.id);
    if (shouldNotify) {
        notifiedEventIds.add(ev.id);
        safeSetItem('zwNotifiedEvents_v1', JSON.stringify(Array.from(notifiedEventIds)));
        const meta = CONTACT_META[targetChat] || { name: 'Zoom Workplace' };
        sendPushNotification(ev.senderName || meta.name, getNotificationPreviewForEvent(ev));
    }
}


let hasRestoredLocalToServer = false;

function restoreLocalEventsToServer(serverEvents) {
    if (hasRestoredLocalToServer) return;
    hasRestoredLocalToServer = true;
    try {
        const serverIds = new Set((serverEvents || []).map(e => e && e.id).filter(Boolean));
        const customMsgs = JSON.parse(safeGetItem('zwUserCustomMsgs_v1') || '{"james":[],"rowan":[],"andreas":[],"levin":[],"owen":[]}');
        ['james', 'rowan', 'andreas', 'levin', 'owen'].forEach(chat => {
            const list = customMsgs[chat] || [];
            list.forEach(msgObj => {
                if (msgObj && msgObj.id && !serverIds.has(msgObj.id) && !deletedMessageIds.has(msgObj.id)) {
                    pushUserMessageToApi(msgObj, chat);
                }
            });
        });
    } catch (e) {}
}

function processServerSyncPayload(payload) {
    if (!payload) return;
    if (Array.isArray(payload.events)) {
        restoreLocalEventsToServer(payload.events);
    }

    if (Array.isArray(payload.deletedIds)) {
        let changed = false;
        payload.deletedIds.forEach(id => {
            if (!deletedMessageIds.has(id)) {
                deletedMessageIds.add(id);
                changed = true;
            }
        });
        if (changed) {
            safeSetItem('zwDeletedIds_v1', JSON.stringify(Array.from(deletedMessageIds)));
            ['james', 'rowan', 'andreas', 'levin', 'owen'].forEach(person => {
                if (chatHistories[person]) {
                    const beforeLen = chatHistories[person].length;
                    chatHistories[person] = chatHistories[person].filter(m => !deletedMessageIds.has(m.id));
                    if (chatHistories[person].length !== beforeLen) {
                        rerenderSingleChatContainer(person);
                    }
                }
            });
            updateSidebarPreview();
        }
    }

    if (payload.statusOverrides) {
        safeSetItem('zwBotStatusOverrides_v1', JSON.stringify(payload.statusOverrides));
        updateLastSeenStatus();
    }

    if (Array.isArray(payload.events)) {
        const now = Date.now();
        payload.events.forEach(ev => {
            if (!ev || !ev.id || deletedMessageIds.has(ev.id)) return;
            if (ev.timestamp <= now) {
                deliverBotEventNow(ev, false);
            } else if (!scheduledTimersMap[ev.id]) {
                const delay = ev.timestamp - now;
                if (delay <= 2147483647) {
                    scheduledTimersMap[ev.id] = setTimeout(() => {
                        delete scheduledTimersMap[ev.id];
                        deliverBotEventNow(ev, true);
                    }, delay);
                }
            }
        });
    }
}

async function pollServerSync() {
    const data = await fetchFromApi('/api/sync');
    if (data) processServerSyncPayload(data);
}

setInterval(pollServerSync, 1500);
setTimeout(pollServerSync, 200);
window.addEventListener('focus', pollServerSync);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pollServerSync();
});
