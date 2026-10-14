/**
 * ============================================================================
 * ZOOM WORKPLACE — FRONTEND APPLICATION & HISTORICAL MEMORY (app.js)
 * ============================================================================
 * Barcha tarixiy yozishmalar (James, Levin Hart, Rowan, Andreas Waibel, Judge Owen),
 * 29 ta video-uchrashuvlar tarixi, 3D Touch menyu, Swipe-to-Reply, Edit, Forward,
 * Select, 2 bosqichli Delete, Hold/Swipe-Up Ovozli xabar yozish va Galereya/Fayl
 * yuklash funksiyalari shu faylda joylashgan.
 * ============================================================================
 */

// SAFE STORAGE HELPERS & HOISTED STATE
        const _memStorage = {};
        function safeGetItem(key) {
            try { return window.localStorage.getItem(key); } catch (e) { return _memStorage[key] || null; }
        }
        function safeSetItem(key, val) {
            try { window.localStorage.setItem(key, val); } catch (e) { _memStorage[key] = String(val); }
        }
        var targetMessageRow = null;
        var isSelectionMode = false;
        var selectedMessageIds = new Set();
        var currentReplyMsg = null;
        var currentEditMsgId = null;
        var pendingDeleteMode = null;
        var customMeetingsLog = JSON.parse(safeGetItem('zwCustomMeetings_v1') || '[]');
        var deletedMessageIds = new Set(JSON.parse(safeGetItem('zwDeletedIds_v1') || '[]'));
        var notifiedEventIds = new Set(JSON.parse(safeGetItem('zwNotifiedEvents_v1') || '[]'));
        var scheduledTimersMap = {};

        // ==========================================
        // 1. PUSH NOTIFICATION & PWA LOGIC
        // ==========================================
        let deferredPrompt;

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            document.getElementById('installAppBtn').style.display = 'flex';
        });

        document.getElementById('installAppBtn').addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    document.getElementById('installAppBtn').style.display = 'none';
                }
                deferredPrompt = null;
            }
        });

        window.addEventListener('appinstalled', (e) => {
            document.getElementById('installAppBtn').style.display = 'none';
            deferredPrompt = null;
        });

        document.body.addEventListener('click', () => {
            if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
                Notification.requestPermission();
            }
        }, { once: true });

        function sendPushNotification(title, message) {
            try {
                const audio = new Audio('src/alert.mp3'); 
                audio.play().catch(e => console.log("Ovoz bloklandi. Ekranga bir marta bosing."));
            } catch(e) {}

            if ("Notification" in window && Notification.permission === 'granted') {
                if(navigator.serviceWorker) {
                    navigator.serviceWorker.ready.then(function(registration) {
                        registration.showNotification(title, {
                            body: message,
                            icon: 'src/ava.jpg',
                            vibrate: [200, 100, 200],
                            tag: 'zoom-msg'
                        });
                    });
                } else {
                    new Notification(title, { body: message, icon: 'src/ava.jpg' });
                }
            }
        }

        // ==========================================
        // 2. VIEWPORT FIX FOR MOBILE KEYBOARDS
        // ==========================================
        function updateAppHeight() {
            if (window.visualViewport) {
                const vv = window.visualViewport;
                document.documentElement.style.setProperty('--app-height', vv.height + 'px');
                document.documentElement.style.setProperty('--app-offset-top', vv.offsetTop + 'px');
                const isKbOpen = vv.height < window.screen.height * 0.72;
                if (document.body) document.body.classList.toggle('keyboard-open', isKbOpen);
            } else {
                document.documentElement.style.setProperty('--app-height', window.innerHeight + 'px');
                document.documentElement.style.setProperty('--app-offset-top', '0px');
            }
            window.scrollTo(0, 0);
        }

        (function setupViewportHeight() {
            updateAppHeight();
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', updateAppHeight);
                window.visualViewport.addEventListener('scroll', updateAppHeight);
            } else {
                window.addEventListener('resize', updateAppHeight);
            }
        })();

        // ==========================================
        // 3. MULTI-CHAT STATE & DOM DYNAMICS
        // ==========================================
        let chatHistories = { james: [], rowan: [], andreas: [], levin: [] };
        let currentActiveChat = null;
        let lastDateSeparatorJames = "";
        let lastDateSeparatorRowan = "";
        let lastDateSeparatorAndreas = "";
        let lastDateSeparatorLevin = "";
        
        const sharedChatContainer = document.getElementById('sharedChatContainer');
        let rowanChatContainer = document.getElementById('rowanChatContainer');
        let andreasChatContainer = document.getElementById('andreasChatContainer');
        let levinChatContainer = document.getElementById('levinChatContainer');
        
        if (!rowanChatContainer) {
            rowanChatContainer = document.createElement('div');
            rowanChatContainer.id = 'rowanChatContainer';
            rowanChatContainer.className = sharedChatContainer ? sharedChatContainer.className : '';
            rowanChatContainer.style.cssText = sharedChatContainer ? sharedChatContainer.style.cssText : "flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 15px;";
            rowanChatContainer.style.display = 'none';
            document.body.appendChild(rowanChatContainer);
        }

        if (!andreasChatContainer) {
            andreasChatContainer = document.createElement('div');
            andreasChatContainer.id = 'andreasChatContainer';
            andreasChatContainer.className = sharedChatContainer ? sharedChatContainer.className : '';
            andreasChatContainer.style.cssText = sharedChatContainer ? sharedChatContainer.style.cssText : "flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 15px;";
            andreasChatContainer.style.display = 'none';
            document.body.appendChild(andreasChatContainer);
        }

        if (!levinChatContainer) {
            levinChatContainer = document.createElement('div');
            levinChatContainer.id = 'levinChatContainer';
            levinChatContainer.className = sharedChatContainer ? sharedChatContainer.className : '';
            levinChatContainer.style.cssText = sharedChatContainer ? sharedChatContainer.style.cssText : "flex: 1; overflow-y: auto; display: flex; flex-direction: column; padding: 15px;";
            levinChatContainer.style.display = 'none';
            document.body.appendChild(levinChatContainer);
        }

        function setupSidebarItems() {
            const items = document.querySelectorAll('.tc-item');
            if (items.length > 0) {
                const listParent = items[0].parentNode;
                
                if (items[0] && !items[0].id) {
                    items[0].id = 'tc-item-james';
                    items[0].onclick = () => switchDirectChat('james');
                }
                if (items[1] && !items[1].id) {
                    items[1].id = 'tc-item-owen';
                    items[1].onclick = () => switchDirectChat('owen');
                    items[1].setAttribute('data-timestamp', '0'); 
                }

                if (!document.getElementById('tc-item-rowan')) {
                    const rItem = document.createElement('div');
                    rItem.className = 'tc-item';
                    rItem.id = 'tc-item-rowan';
                    rItem.onclick = () => switchDirectChat('rowan');
                    rItem.innerHTML = `
                        <div class="tc-avatar" style="background:none; overflow:hidden; display:flex; justify-content:center; align-items:center;">
                            <img src="src/rwn.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                        </div>
                        <div class="tc-info">
                            <div class="tc-name-time">
                                <span class="tc-name" style="font-weight:600; font-size:14px; color:#222;">Rowan</span>
                                <span class="tc-time" id="rowanLastMsgTime" style="font-size:11px; color:#888;"></span>
                            </div>
                            <div class="tc-msg-preview" id="rowanLastMsgPreview" style="font-size:12px; color:#888; margin-top:4px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;"></div>
                        </div>
                    `;
                    listParent.appendChild(rItem);
                }

                if (!document.getElementById('tc-item-andreas')) {
                    const aItem = document.createElement('div');
                    aItem.className = 'tc-item';
                    aItem.id = 'tc-item-andreas';
                    aItem.onclick = () => switchDirectChat('andreas');
                    aItem.innerHTML = `
                        <div class="tc-avatar" style="background:none; overflow:hidden; display:flex; justify-content:center; align-items:center;">
                            <img src="src/and.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                        </div>
                        <div class="tc-info">
                            <div class="tc-name-time">
                                <span class="tc-name" style="font-weight:600; font-size:14px; color:#222;">Andreas Waibel</span>
                                <span class="tc-time" id="andreasLastMsgTime" style="font-size:11px; color:#888;"></span>
                            </div>
                            <div class="tc-msg-preview" id="andreasLastMsgPreview" style="font-size:12px; color:#888; margin-top:4px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;"></div>
                        </div>
                    `;
                    listParent.appendChild(aItem);
                }

                if (!document.getElementById('tc-item-levin')) {
                    const lItem = document.createElement('div');
                    lItem.className = 'tc-item';
                    lItem.id = 'tc-item-levin';
                    lItem.onclick = () => switchDirectChat('levin');
                    lItem.innerHTML = `
                        <div class="tc-avatar" style="background:none; overflow:hidden; display:flex; justify-content:center; align-items:center;">
                            <img src="src/lew.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
                        </div>
                        <div class="tc-info">
                            <div class="tc-name-time">
                                <span class="tc-name" style="font-weight:600; font-size:14px; color:#222;">Levin Hart</span>
                                <span class="tc-time" id="levinLastMsgTime" style="font-size:11px; color:#888;"></span>
                            </div>
                            <div class="tc-msg-preview" id="levinLastMsgPreview" style="font-size:12px; color:#888; margin-top:4px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;"></div>
                        </div>
                    `;
                    listParent.appendChild(lItem);
                }
            }
        }

        function sortChatList() {
            const jamesItem = document.getElementById('tc-item-james');
            const rowanItem = document.getElementById('tc-item-rowan');
            const andreasItem = document.getElementById('tc-item-andreas');
            const owenItem = document.getElementById('tc-item-owen');
            const levinItem = document.getElementById('tc-item-levin');
            
            if (!jamesItem || !rowanItem || !andreasItem || !owenItem || !levinItem) return;
            
            const listParent = jamesItem.parentNode;
            const items = [jamesItem, rowanItem, andreasItem, owenItem, levinItem].filter(Boolean);
            
            items.sort((a, b) => {
                const tA = parseInt(a.getAttribute('data-timestamp') || 0);
                const tB = parseInt(b.getAttribute('data-timestamp') || 0);
                return tB - tA; 
            });
            
            items.forEach(item => listParent.appendChild(item));
        }

        // ==========================================
        // PROFILE SIDEBAR DYNAMIC INJECTOR & MODAL CSS
        // ==========================================
        function setupProfileSidebar() {
            // Profile sidebar styles loaded from style.css

            const sidebar = document.createElement('div');
            sidebar.id = 'profileSidebar';
            sidebar.innerHTML = `
                <div class="ps-inner">
                    <div class="ps-header">
                        <span style="font-weight:600; font-size:16px;">User Info</span>
                        <svg class="ps-close" onclick="closeProfileSidebar()" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </div>
                    <div class="ps-body">
                        <div id="psAvatarWrapper" class="ps-avatar-wrap"></div>
                        <div id="psName" class="ps-name"></div>
                        <div id="psStatus" class="ps-status"></div>
                        
                        <div class="ps-extra-info">
                            <div class="ps-extra-item">
                                <div class="ps-extra-label">About</div>
                                <div class="ps-extra-value" id="psAbout"></div>
                            </div>
                            <div class="ps-extra-item">
                                <div class="ps-extra-label">Department</div>
                                <div class="ps-extra-value" id="psDept"></div>
                            </div>
                            <div class="ps-extra-item">
                                <div class="ps-extra-label">Location</div>
                                <div class="ps-extra-value" id="psLocation"></div>
                            </div>
                            <div class="ps-extra-item">
                                <div class="ps-extra-label">Personal Meeting ID</div>
                                <div class="ps-extra-value" id="psMeetingId" style="color: #0b5cff; cursor: pointer;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const chatSection = document.getElementById('teamChatTabContent');
            if (chatSection) {
                chatSection.style.flexDirection = 'row'; 
                chatSection.appendChild(sidebar);
            }
        }

        function openProfileSidebar() {
            if(!currentActiveChat) return;
            const sidebar = document.getElementById('profileSidebar');
            const psAvatarWrapper = document.getElementById('psAvatarWrapper');
            const psName = document.getElementById('psName');
            const psAbout = document.getElementById('psAbout');
            const psDept = document.getElementById('psDept');
            const psLocation = document.getElementById('psLocation');
            const psMeetingId = document.getElementById('psMeetingId');

            let name = "User";
            let avatarContent = "";
            let about = "", dept = "", loc = "", meetingId = "";

            if (currentActiveChat === 'james') {
                name = "James (Attorney)";
                avatarContent = `<div style="width:160px; height:160px; border-radius:18px; background:#4a86e8; color:#fff; display:flex; align-items:center; justify-content:center; font-size:55px; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.06);">LA</div>`;
                about = "Corporate Attorney. Handling transactions and corporate accounts.";
                dept = "Legal & Compliance";
                loc = "Los Angeles";
                meetingId = "812 449 3321";
            } else if (currentActiveChat === 'rowan') {
                name = "Rowan";
                avatarContent = `<img src="src/rwn.jpg" style="width:160px; height:160px; border-radius:18px; object-fit:cover; cursor:pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.06);" onclick="openImageModal('src/rwn.jpg')" />`;
                about = "HR Manager. Focused on onboarding and candidate interviews.";
                dept = "Human Resources";
                loc = "California, US";
                meetingId = "443 892 1105";
            } else if (currentActiveChat === 'andreas') {
                name = "Andreas Waibel";
                avatarContent = `<img src="src/and.jpg" style="width:160px; height:160px; border-radius:18px; object-fit:cover; cursor:pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.06);" onclick="openImageModal('src/and.jpg')" />`;
                about = "Finance Director. Managing transfers and billing operations.";
                dept = "Finance / Billing";
                loc = "Germany, Stuttgart";
                meetingId = "901 223 5588";
            } else if (currentActiveChat === 'levin') {
                name = "Levin Hart";
                avatarContent = `<img src="src/lew.jpg" style="width:160px; height:160px; border-radius:18px; object-fit:cover; cursor:pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.06);" onclick="openImageModal('src/lew.jpg')" />`;
                about = "Immigration Lawyer. Specializing in visas and embassy procedures.";
                dept = "Immigration Law";
                loc = "California, US";
                meetingId = "775 330 9922";
            } else {
                name = "Judge Owen";
                avatarContent = `<div style="width:160px; height:160px; border-radius:18px; background:#e0c3fc; color:#552889; display:flex; align-items:center; justify-content:center; font-size:55px; font-weight:bold; box-shadow: 0 4px 15px rgba(0,0,0,0.06);">OB</div>`;
                about = "Federal Judge overseeing corporate compliance cases.";
                dept = "Judiciary";
                loc = "San Francisco";
                meetingId = "112 004 8833";
            }

            psAvatarWrapper.innerHTML = avatarContent;
            psName.innerText = name;
            psAbout.innerText = about;
            psDept.innerText = dept;
            psLocation.innerText = loc;
            psMeetingId.innerText = meetingId;

            updateLastSeenStatus(); 
            sidebar.classList.add('open');
        }

        function closeProfileSidebar() {
            const sidebar = document.getElementById('profileSidebar');
            if (sidebar) sidebar.classList.remove('open');
        }

        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('profileSidebar');
            const avatarHeader = document.getElementById('tcChatAvatar');
            const nameHeader = document.getElementById('tcChatName');
            
            if (sidebar && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && e.target !== avatarHeader && e.target !== nameHeader && !avatarHeader.contains(e.target) && !nameHeader.contains(e.target)) {
                    closeProfileSidebar();
                }
            }
        });

        function updateLastSeenStatus() {
            if (!currentActiveChat) return; 
            
            let statusText = "last seen recently";
            let detailedStatusText = "last seen recently";
            const now = Date.now();

            function getDetailedTime(ts) {
                const d = new Date(ts);
                const tStr = d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                const today = new Date();
                const yest = new Date(); yest.setDate(yest.getDate() - 1);
                
                if (d.toDateString() === today.toDateString()) return "last seen today at " + tStr;
                if (d.toDateString() === yest.toDateString()) return "last seen yesterday at " + tStr;
                
                const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return "last seen " + m[d.getMonth()] + " " + d.getDate() + " at " + tStr;
            }

            let fallback = 0;
            let fOff = null;
            let fOn = false;

            const botStatusOverrides = JSON.parse(safeGetItem('zwBotStatusOverrides_v1') || '{}');
            const activeOverride = botStatusOverrides[currentActiveChat];

            if (activeOverride && activeOverride.mode === 'online' && (!activeOverride.until || now < activeOverride.until)) {
                fOn = true;
                fallback = 0;
            } else if (activeOverride && activeOverride.mode === 'offline' && activeOverride.timestamp) {
                fallback = parseInt(activeOverride.timestamp);
                fOn = (now < fallback);
            } else if (currentActiveChat === 'james') {
                const jOff = new Date(2026, 9, 14, 4, 45).getTime(); // Oct 14, 04:45
                if (now >= jOff) { fallback = jOff; fOn = false; }
                else { fOn = true; fallback = 0; }
                
                let overrideOff = safeGetItem('zwJamesOffline_93');
                if(overrideOff) { fallback = parseInt(overrideOff); fOn = false; }
            } else if (currentActiveChat === 'rowan') {
                const rOff = new Date(2026, 9, 12, 3, 11).getTime(); // Oct 12, 03:11
                if (now >= rOff) { fallback = rOff; fOn = false; }
                else { fOn = true; fallback = 0; }
                
                let overrideOff = safeGetItem('zwRowanOffline_93');
                if(overrideOff) { fallback = parseInt(overrideOff); fOn = false; }
            } else if (currentActiveChat === 'andreas') {
                fallback = new Date(2026, 8, 19, 18, 7).getTime(); 
            } else if (currentActiveChat === 'levin') {
                const lOff = new Date(2026, 9, 14, 0, 10).getTime(); // Oct 14, 00:10
                if (now >= lOff) { fallback = lOff; fOn = false; }
                else { fOn = true; fallback = 0; }
                
                let overrideOff = safeGetItem('zwLevinOffline_93');
                if(overrideOff) { fallback = parseInt(overrideOff); fOn = false; }
            } else if (currentActiveChat === 'owen') {
                fallback = new Date(2026, 8, 7, 14, 30).getTime();
            }

            if (fOff) {
                const ts = parseInt(fOff);
                const diffMs = now - ts;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);
                if (diffDays > 0) statusText = `last seen ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                else if (diffHours > 0) statusText = `last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                else if (diffMins > 0) statusText = `last seen ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                else statusText = "last seen 1 minute ago";
                
                detailedStatusText = getDetailedTime(ts);
            } else if (fOn) {
                statusText = "online";
                detailedStatusText = "online";
            } else if (now > fallback && fallback !== 0) {
                const diffMs = now - fallback;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);
                if (diffDays > 0) statusText = `last seen ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                else if (diffHours > 0) statusText = `last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                else if (diffMins > 0) statusText = `last seen ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
                else statusText = "last seen 1 minute ago";
                
                detailedStatusText = getDetailedTime(fallback);
            } else {
                statusText = "online";
                detailedStatusText = "online";
            }

            const statusEl = document.getElementById('tcChatStatus');
            if (statusEl) {
                statusEl.innerText = statusText;
                statusEl.style.color = (statusText === "online") ? "#0b5cff" : "#888";
            }

            const psStatus = document.getElementById('psStatus');
            if (psStatus) {
                psStatus.innerText = detailedStatusText;
                psStatus.style.color = (detailedStatusText === "online") ? "#0b5cff" : "#888";
            }
        }

        setInterval(() => {
            const d = new Date();
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            const hours = d.getHours().toString().padStart(2, '0');
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const dateStr = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

            document.getElementById('homeClock').innerText = `${hours}:${minutes}`;
            document.getElementById('homeDate').innerText = dateStr;
            const calEl = document.getElementById('calTodayDate'); if (calEl) calEl.innerText = `Today, ${months[d.getMonth()].slice(0,3)} ${d.getDate()}`;

            updateLastSeenStatus();
        }, 1000);

        function switchTab(tab) {
            document.getElementById('tabHome').classList.toggle('active', tab === 'home');
            document.getElementById('tabMeetings').classList.toggle('active', tab === 'meetings');
            document.getElementById('tabChat').classList.toggle('active', tab === 'chat');

            const homeEl = document.getElementById('homeTabContent');
            const meetingsEl = document.getElementById('meetingsTabContent');
            const chatEl = document.getElementById('teamChatTabContent');

            homeEl.style.display = tab === 'home' ? 'flex' : 'none';
            meetingsEl.style.display = tab === 'meetings' ? 'flex' : 'none';
            chatEl.style.display = tab === 'chat' ? 'flex' : 'none';

            const activeTabEl = tab === 'home' ? homeEl : (tab === 'meetings' ? meetingsEl : chatEl);
            if (activeTabEl) {
                activeTabEl.classList.remove('tab-smooth-enter');
                void activeTabEl.offsetWidth;
                activeTabEl.classList.add('tab-smooth-enter');
            }

            if (tab === 'meetings' && typeof renderMeetingsHistory === 'function') {
                renderMeetingsHistory();
            }

            if (tab !== 'chat') {
                document.body.classList.remove('mobile-chat-open');
            }
            if(tab === 'chat') {
                if (!currentActiveChat) {
                    const tcSection = document.getElementById('teamChatTabContent');
                    if (tcSection) tcSection.classList.remove('show-chat');
                    document.body.classList.remove('mobile-chat-open');
                    const tcChatBody = document.getElementById('tcChatBody');
                    tcChatBody.innerHTML = `
                        <div style="display:flex; height:100%; align-items:center; justify-content:center; color:#999; font-size:14px; flex-direction:column;">
                            <svg viewBox="0 0 24 24" style="width:48px;height:48px;fill:#ccc;margin-bottom:10px;"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"></path></svg>
                            <span>Select a chat to start messaging</span>
                        </div>
                    `;
                    document.getElementById('tcChatAvatar').className = 'tc-avatar';
                    document.getElementById('tcChatAvatar').innerHTML = '';
                    document.getElementById('tcChatName').innerText = '';
                    document.getElementById('tcChatStatus').innerText = '';
                    document.getElementById('tcInputWrapper').style.display = 'none';
                    
                    const tcItems = document.querySelectorAll('.tc-item');
                    tcItems.forEach(i => i.classList.remove('active'));
                } else {
                    switchDirectChat(currentActiveChat);
                }
            }
        }

        function closeMobileChat() {
            currentActiveChat = null;
            const tcSection = document.getElementById('teamChatTabContent');
            if (tcSection) tcSection.classList.remove('show-chat');
            document.body.classList.remove('mobile-chat-open');
            document.querySelectorAll('.tc-item').forEach(i => i.classList.remove('active'));
            if (typeof closeProfileSidebar === 'function') closeProfileSidebar();
            if (typeof clearSelection === 'function' && isSelectionMode) clearSelection();
            if (typeof cancelChatActionBar === 'function') cancelChatActionBar();
        }

        function switchDirectChat(person) {
            currentActiveChat = person;
            const tcSection = document.getElementById('teamChatTabContent');
            if (tcSection) tcSection.classList.add('show-chat');
            document.body.classList.add('mobile-chat-open');

            const tcItems = document.querySelectorAll('.tc-item');
            tcItems.forEach(i => i.classList.remove('active'));
            
            const tcChatBody = document.getElementById('tcChatBody');
            tcChatBody.innerHTML = ''; 

            if(typeof closeProfileSidebar === 'function') closeProfileSidebar();
            if(typeof clearSelection === 'function' && isSelectionMode) clearSelection();
            if(typeof cancelChatActionBar === 'function') cancelChatActionBar();

            if(person === 'james') {
                const jamesItem = document.getElementById('tc-item-james');
                if(jamesItem) jamesItem.classList.add('active');
                
                document.getElementById('tcChatAvatar').className = 'tc-avatar la'; 
                document.getElementById('tcChatAvatar').innerHTML = 'LA';
                document.getElementById('tcChatName').innerText = 'James (Attorney)';
                updateLastSeenStatus();

                tcChatBody.appendChild(sharedChatContainer);
                sharedChatContainer.style.display = 'flex';
                if(rowanChatContainer) rowanChatContainer.style.display = 'none';
                if(andreasChatContainer) andreasChatContainer.style.display = 'none';
                if(levinChatContainer) levinChatContainer.style.display = 'none';
                
                document.getElementById('tcInputWrapper').style.display = 'block';
                sharedChatContainer.scrollTop = sharedChatContainer.scrollHeight;
                
            } else if(person === 'rowan') {
                const rowanItem = document.getElementById('tc-item-rowan');
                if(rowanItem) rowanItem.classList.add('active');
                
                document.getElementById('tcChatAvatar').className = 'tc-avatar'; 
                document.getElementById('tcChatAvatar').innerHTML = '<img src="src/rwn.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">';
                document.getElementById('tcChatName').innerText = 'Rowan';
                updateLastSeenStatus();

                tcChatBody.appendChild(rowanChatContainer);
                rowanChatContainer.style.display = 'flex';
                sharedChatContainer.style.display = 'none';
                if(andreasChatContainer) andreasChatContainer.style.display = 'none';
                if(levinChatContainer) levinChatContainer.style.display = 'none';
                
                document.getElementById('tcInputWrapper').style.display = 'block';
                rowanChatContainer.scrollTop = rowanChatContainer.scrollHeight;
                
            } else if(person === 'andreas') {
                const andreasItem = document.getElementById('tc-item-andreas');
                if(andreasItem) andreasItem.classList.add('active');
                
                document.getElementById('tcChatAvatar').className = 'tc-avatar'; 
                document.getElementById('tcChatAvatar').innerHTML = '<img src="src/and.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">';
                document.getElementById('tcChatName').innerText = 'Andreas Waibel';
                updateLastSeenStatus();

                tcChatBody.appendChild(andreasChatContainer);
                andreasChatContainer.style.display = 'flex';
                sharedChatContainer.style.display = 'none';
                if(rowanChatContainer) rowanChatContainer.style.display = 'none';
                if(levinChatContainer) levinChatContainer.style.display = 'none';
                
                document.getElementById('tcInputWrapper').style.display = 'none';
                const restrictedDiv = document.createElement('div');
                restrictedDiv.style.cssText = "padding: 12px; text-align: center; color: #888; background: #f0f0f0; border-top: 1px solid #e0e0e0; font-size: 13px; flex-shrink: 0;";
                restrictedDiv.innerText = "Messaging is disabled. Please invite the user to an audio or video call instead.";
                tcChatBody.appendChild(restrictedDiv);

                andreasChatContainer.scrollTop = andreasChatContainer.scrollHeight;
                
            } else if(person === 'levin') {
                const levinItem = document.getElementById('tc-item-levin');
                if(levinItem) levinItem.classList.add('active');
                
                document.getElementById('tcChatAvatar').className = 'tc-avatar'; 
                document.getElementById('tcChatAvatar').innerHTML = '<img src="src/lew.jpg" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">';
                document.getElementById('tcChatName').innerText = 'Levin Hart';
                updateLastSeenStatus();

                tcChatBody.appendChild(levinChatContainer);
                levinChatContainer.style.display = 'flex';
                sharedChatContainer.style.display = 'none';
                if(rowanChatContainer) rowanChatContainer.style.display = 'none';
                if(andreasChatContainer) andreasChatContainer.style.display = 'none';
                
                document.getElementById('tcInputWrapper').style.display = 'block';
                levinChatContainer.scrollTop = levinChatContainer.scrollHeight;
                
            } else {
                const owenItem = document.getElementById('tc-item-owen');
                if(owenItem) owenItem.classList.add('active');
                
                document.getElementById('tcChatAvatar').className = 'tc-avatar ob'; 
                document.getElementById('tcChatAvatar').innerHTML = 'OB';
                document.getElementById('tcChatName').innerText = 'Judge Owen';
                
                // Update Owen status
                updateLastSeenStatus();

                const owenContainer = document.getElementById('owenChatContainer');
                if(owenContainer) {
                    tcChatBody.appendChild(owenContainer);
                    owenContainer.style.display = 'flex';
                    owenContainer.scrollTop = owenContainer.scrollHeight;
                }
                
                sharedChatContainer.style.display = 'none';
                if(rowanChatContainer) rowanChatContainer.style.display = 'none';
                if(andreasChatContainer) andreasChatContainer.style.display = 'none';
                if(levinChatContainer) levinChatContainer.style.display = 'none';
                document.getElementById('tcInputWrapper').style.display = 'none';
            }

            const tcMainEl = document.querySelector('.tc-main');
            if (tcMainEl && window.innerWidth > 768) {
                tcMainEl.classList.remove('desktop-chat-fade');
                void tcMainEl.offsetWidth;
                tcMainEl.classList.add('desktop-chat-fade');
            }

            setTimeout(() => {
                const avatarEl = document.getElementById('tcChatAvatar');
                const nameEl = document.getElementById('tcChatName');
                const clickHandler = (e) => { e.stopPropagation(); openProfileSidebar(); };
                if(avatarEl) { avatarEl.style.cursor = 'pointer'; avatarEl.onclick = clickHandler; }
                if(nameEl) { nameEl.style.cursor = 'pointer'; nameEl.onclick = clickHandler; }
            }, 100);
        }

        // ==========================================
        // 5. MEETING CONTROLS & CAMERA
        // ==========================================
        let localStream;
        let isVideoOn = true;
        let isMicOn = true;
        let isMeetingActive = false;
        let ws;
        let jamesJoined = false;

        async function startNewMeeting() {
            document.getElementById('homeView').style.display = 'none';
            const mv = document.getElementById('meetingView');
            mv.style.display = 'flex'; 
            isMeetingActive = true;

            jamesJoined = false;
            mv.className = 'state-solo'; 

            document.getElementById('meetingChatBody').innerHTML = `
                <div style="flex:1; display:flex; justify-content:center; align-items:center; flex-direction:column; color:#888; text-align:center;">
                    <svg viewBox="0 0 24 24" style="width:48px;height:48px;fill:#ccc;margin-bottom:10px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
                    <p style="font-size:14px; font-weight:500;">Waiting for others to join...</p>
                    <p style="font-size:12px;">Chat is currently disabled.</p>
                </div>
            `;
            document.getElementById('meetingChatInput').disabled = true;
            document.getElementById('meetingChatInput').placeholder = "Chat disabled in solo mode...";
            document.getElementById('meetingSendBtn').style.opacity = '0.5';

            try {
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: { ideal: 1280 } }, 
                    audio: true 
                });
                document.getElementById('localVideo').srcObject = localStream;
                setupAudioEqualizer(localStream);
            } catch (error) { 
                alert("Camera/Microphone access required!"); 
            }
        }

        function leaveMeeting() {
            if(localStream) {
                localStream.getTracks().forEach(track => track.stop());
            }
            document.getElementById('meetingView').style.display = 'none';
            document.getElementById('homeView').style.display = 'flex';
            isMeetingActive = false;
            switchTab('home'); 
        }

        function toggleMic() { 
            if (localStream) { 
                isMicOn = !isMicOn; 
                localStream.getAudioTracks()[0].enabled = isMicOn; 
                document.getElementById('micBtn').classList.toggle('off', !isMicOn); 
            } 
        }

        function toggleCam() { 
            if (localStream) { 
                isVideoOn = !isVideoOn; 
                localStream.getVideoTracks()[0].enabled = isVideoOn; 
                document.getElementById('camBtn').classList.toggle('off', !isVideoOn); 
                document.getElementById('myAvatarPlaceholder').style.display = isVideoOn ? 'none' : 'flex'; 
            } 
        }

        function toggleMeetingChat() { 
            const sb = document.getElementById('meetingChatSidebar');
            sb.classList.toggle('active');
            if(sb.classList.contains('active')) { 
                if(currentActiveChat === 'james') sharedChatContainer.scrollTop = sharedChatContainer.scrollHeight;
                if(currentActiveChat === 'rowan') rowanChatContainer.scrollTop = rowanChatContainer.scrollHeight;
                if(currentActiveChat === 'andreas') andreasChatContainer.scrollTop = andreasChatContainer.scrollHeight;
                if(currentActiveChat === 'levin') levinChatContainer.scrollTop = levinChatContainer.scrollHeight;
            }
        }

        function toggleParticipants() { 
            const m = document.getElementById('participantsModal'); 
            m.style.display = m.style.display === 'block' ? 'none' : 'block'; 
        }

        let currentFsMode = null;
        function toggleFullScreen(target) {
            const uBox = document.getElementById('userBox');
            const lBox = document.getElementById('lawyerBox');

            if (currentFsMode === target) { 
                currentFsMode = null; 
                uBox.className = 'video-box split'; 
                lBox.className = 'video-box split'; 
            } else { 
                currentFsMode = target; 
                if (!jamesJoined) {
                    uBox.className = 'video-box fs-main';
                    lBox.className = 'video-box split';
                } else {
                    if (target === 'user') { 
                        uBox.className = 'video-box fs-main'; 
                        lBox.className = 'video-box fs-pip'; 
                    } else { 
                        lBox.className = 'video-box fs-main'; 
                        uBox.className = 'video-box fs-pip'; 
                    } 
                }
            }
        }

        function setZoom(level) {
            const videoElement = document.getElementById('localVideo');
            const btn1x = document.getElementById('btn1x'); 
            const btn2x = document.getElementById('btn2x');

            if(level === 1) { 
                videoElement.style.transform = "scaleX(-1) scale(1)"; 
                btn1x.classList.add('active'); 
                btn2x.classList.remove('active'); 
            } else { 
                videoElement.style.transform = "scaleX(-1) scale(1.6)"; 
                btn2x.classList.add('active'); 
                btn1x.classList.remove('active'); 
            }
        }

        let isLawyerMuted = false;
        function changeLawyerVolume() {
            const slider = document.getElementById('lVolSlider'); 
            const volBtn = document.getElementById('lMuteBtn'); 
            const icon = document.getElementById('lVolIcon');

            const lAudio = document.getElementById('lawyerAudio');
            if (lAudio) lAudio.volume = parseFloat(slider.value);

            if(slider.value == 0) { 
                isLawyerMuted = true; 
                volBtn.classList.add('muted'); 
                icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>'; 
            } else { 
                isLawyerMuted = false; 
                volBtn.classList.remove('muted'); 
                icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>'; 
            }
        }
        
        function toggleLawyerMute() { 
            const slider = document.getElementById('lVolSlider'); 
            if(!isLawyerMuted) { 
                slider.dataset.lastVol = slider.value; 
                slider.value = 0; 
            } else { 
                slider.value = slider.dataset.lastVol || 1; 
            } 
            changeLawyerVolume(); 
        }

        function inviteJames() { 
            const b = document.getElementById('inviteBtn'); 
            b.innerText = "Invited"; 
            b.classList.add('invited'); 
        }

        function closeModal(id) { 
            document.getElementById(id).style.display = 'none'; 
        }

        var currentAlbumUrls = [];
        var currentAlbumIndex = 0;

        function openImageModal(src) {
            openAlbumModal([src], 0);
        }

        function openAlbumModalFromAttr(el, idx) {
            try {
                const raw = el.getAttribute('data-album') || (el.closest('[data-album]') && el.closest('[data-album]').getAttribute('data-album'));
                if (raw) {
                    const list = JSON.parse(decodeURIComponent(raw));
                    openAlbumModal(list, idx || 0);
                    return;
                }
            } catch (e) {}
            const img = el.querySelector('img');
            if (img && img.src) openAlbumModal([img.src], 0);
        }

        function openAlbumModal(urls, startIndex = 0) {
            currentAlbumUrls = Array.isArray(urls) && urls.length > 0 ? urls : [];
            if (currentAlbumUrls.length === 0) return;
            currentAlbumIndex = Math.max(0, Math.min(startIndex, currentAlbumUrls.length - 1));
            updateAlbumModalView();
            const modal = document.getElementById('imgModal');
            if (modal) modal.style.display = 'flex';
        }

        function updateAlbumModalView() {
            const imgEl = document.getElementById('modalImg');
            const counterEl = document.getElementById('albumCounterText');
            const prevBtn = document.getElementById('albumPrevBtn');
            const nextBtn = document.getElementById('albumNextBtn');
            const total = currentAlbumUrls.length;
            if (imgEl && total > 0) {
                imgEl.src = currentAlbumUrls[currentAlbumIndex];
            }
            if (counterEl) {
                counterEl.innerText = `${currentAlbumIndex + 1} / ${total}`;
                counterEl.style.display = total > 1 ? 'inline-block' : 'none';
            }
            if (prevBtn) prevBtn.style.display = total > 1 ? 'flex' : 'none';
            if (nextBtn) nextBtn.style.display = total > 1 ? 'flex' : 'none';
        }

        function stepAlbumPhoto(dir) {
            if (!currentAlbumUrls || currentAlbumUrls.length <= 1) return;
            currentAlbumIndex = (currentAlbumIndex + dir + currentAlbumUrls.length) % currentAlbumUrls.length;
            updateAlbumModalView();
        }

        function downloadCurrentModalImage() {
            const src = currentAlbumUrls[currentAlbumIndex] || (document.getElementById('modalImg') && document.getElementById('modalImg').src);
            if (!src) return;
            const dlUrl = src.startsWith('data:') || src.startsWith('blob:') ? src : (src + (src.includes('?') ? '&download=1' : '?download=1'));
            triggerFileDownload(dlUrl, `Photo_${currentAlbumIndex + 1}.jpg`);
        }

        function shareCurrentModalImage() {
            const src = currentAlbumUrls[currentAlbumIndex] || (document.getElementById('modalImg') && document.getElementById('modalImg').src);
            if (!src) return;
            triggerFileShare(src, `Photo_${currentAlbumIndex + 1}.jpg`);
        }

        // ==========================================
        // 6. AUDIO EQUALIZER (Green Blur)
        // ==========================================
        let audioContext, analyser, microphone, dataArray, mockLawyerAvgVolume = 0;

        function setupAudioEqualizer(stream) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)(); 
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream); 
            microphone.connect(analyser); 
            analyser.fftSize = 256;
            dataArray = new Uint8Array(analyser.frequencyBinCount); 
            renderVisuals();
        }

        function renderVisuals() {
            if(!isMeetingActive) return;
            requestAnimationFrame(renderVisuals); 

            let userAvg = 0;
            if (isMicOn) { 
                analyser.getByteFrequencyData(dataArray); 
                userAvg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length; 
            } 

            let uInt = Math.min(1, Math.max(0, (userAvg - 5) / 40)); 
            const uBox = document.getElementById('userBox'); 
            if (uInt > 0.05 && isMicOn) { 
                uBox.style.setProperty('--glow-op', uInt); 
                uBox.style.setProperty('--glow-size', (uInt * 25) + 'px'); 
            } else { 
                uBox.style.setProperty('--glow-op', 0); 
                uBox.style.setProperty('--glow-size', '0px'); 
            }

            let lInt = Math.min(1, Math.max(0, (mockLawyerAvgVolume - 5) / 40)); 
            const lBox = document.getElementById('lawyerBox'); 
            if (lInt > 0.05) { 
                lBox.style.setProperty('--glow-op', lInt); 
                lBox.style.setProperty('--glow-size', (lInt * 25) + 'px'); 
            } else { 
                lBox.style.setProperty('--glow-op', 0); 
                lBox.style.setProperty('--glow-size', '0px'); 
            }
        }

        // ==========================================
        // 7. CHAT STORAGE & DATE SEPARATOR LOGIC
        // ==========================================
        const readTicksHTML = `<div class="msg-read-ticks"><svg viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg></div>`;
        let messageCounter = Date.now();

        function getNextId() { return 'msg-' + (++messageCounter); }
        function getCurrentTime(timestamp = null) { 
            const d = timestamp ? new Date(timestamp) : new Date(); 
            return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); 
        }

        function getPdfHtml(fileName, fileSize) {
            const safeName = String(fileName || "Document").replace(/'/g, "\\'");
            const safeSize = String(fileSize || "").replace(/'/g, "\\'");
            return `<div class="file-attachment" onclick="if(!isSelectionMode && !event.ctrlKey) { event.stopPropagation(); openFilePreviewModal('${safeName}', '${safeName}', '${safeName}', '${safeSize}'); }">
                        <div class="file-icon-box"><svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div>
                        <div class="file-info"><div class="file-name">${fileName}</div><div class="file-size">${fileSize}</div></div>
                        <div class="file-actions-group" onclick="event.stopPropagation()">
                            <button type="button" class="file-action-pill" title="Qurilmaga yuklab olish (Download)" onclick="if(!isSelectionMode) triggerFileDownload('${safeName}', '${safeName}')">
                                <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            </button>
                            <button type="button" class="file-action-pill" title="Ulashish / Jo'natish (Share)" onclick="if(!isSelectionMode) triggerFileShare('${safeName}', '${safeName}')">
                                <svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                            </button>
                        </div>
                    </div>`;
        }

        function applyAutoDelete(arr) {
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            return arr.map(m => {
                if (now - m.timestamp > SEVEN_DAYS && !m.isDeleted) {
                    return {
                        ...m,
                        isDeleted: true,
                        html: `<div class="system-msg-container" style="margin:8px 0; text-align:center;"><div class="system-msg" style="background:rgba(0,0,0,0.04); color:#888; font-style:italic; font-size:11px; padding:6px 12px; border-radius:12px; display:inline-block;">Auto-deleted after 7 days.</div></div>`
                    };
                }
                return m;
            });
        }

        // TAYYOR XOTIRA BAZALARI: v93
        function getInitialHistoryJames() {
            const y = 2026; 
            const m = 8; // September is 8, October is 9

            const msgText2138 = "Well, Muzaffar, this corporate status is tied to my account, which means interest-free and non-corporate transactions were previously processed from my account to bank cards. In your case, this transaction was rejected by the bank. Because of the deposit account number and SWIFT details you provided, the process has now been changed from a bank card transfer to a bank account transfer. As a result, a 0.21% corporate payment fee of the total amount will be deducted from my account.\n\nDeducting the fee from the total amount in the account will not work. Currently, the full amount is sitting at the bank, ready for the transaction. If we set the commission to be deducted from the total amount, the current transaction approval will be canceled, and we will have to wait for a new approval. For this reason, the commission for this transaction will be deducted from my IOLTA account. My service fee is also included in this total amount. $214,000 will be directed to you, and the remaining $2,350 will be directed to my personal account. Once the funds reach you, my service fee share will be transferred to my personal account.";
            const replyHTML2138 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Could you please clarify exactly what kind of corporate account this involves and the reason for this 0.21% fee? ...</div></div>`;
            const html2138 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML2138}<div class="msg-text" style="white-space: pre-wrap;">${msgText2138}</div><div class="msg-time-container">22:28</div></div></div>`;

            const msgText2142 = "I can't talk right now because I'm at the bank. Once we have made the payments and successfully completed the transactions, we can talk after lunch. I will contact you at that time.";
            const replyHTML2142 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">can you open or enter to the meeting please</div></div>`;
            const html2142 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML2142}<div class="msg-text">${msgText2142}</div><div class="msg-time-container">22:31</div></div></div>`;

            const html2247 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">We didn't have the cash on hand right now to pay this commission; could you possibly cover it for me? Once the funds arrive, I’ll transfer that 0.21% to you. I’d really appreciate it if you could understand the situation and pay it for the time being</div><div class="msg-time-container">22:47 ${readTicksHTML}</div></div></div>`;

            const msgText2258 = "Muzaffar, if it were possible, I would have paid it without asking you. This commission must be covered by you. If it is not possible to pay right now, if I am not mistaken, it is currently night time where you are. When morning comes, try again. I will give you my account number, and if you transfer the commission fee, I will automatically direct the payment to the bank. That way, no matter when the commission fee is paid, the transaction will be switched to an active status. My account number: 14148749267810084892";
            const replyHTML2258 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">We didn't have the cash on hand right now to pay this commission...</div></div>`;
            const html2258 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML2258}<div class="msg-text" style="white-space: pre-wrap;">${msgText2258}</div><div class="msg-time-container">22:58</div></div></div>`;

            const html2144 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. James, the money has just been sorted out. If I send you the $449 right now, would you be able to take care of the commission and have the funds arrive by Monday?</div><div class="msg-time-container">21:44 ${readTicksHTML}</div></div></div>`;

            const msgText0225 = "Muzaffar, I received the $450 into my account. I will contact the bank right away to process the transaction. Once the bank confirms the transfer, I will provide you with the receipt.";
            const replyHTML0225 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. James, the money has just been sorted out...</div></div>`;
            const html0225 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML0225}<div class="msg-text">${msgText0225}</div><div class="msg-time-container">02:25</div></div></div>`;

            const msgText1702 = "Hello Muzaffar, the bank has confirmed everything, and the money will be in your account tomorrow morning. All checks have been completed, and the anti-money laundering systems for international transfers found no issues. The funds will be transferred to your account early tomorrow morning in accordance with the relevant procedures. The reason for some of the delays was that the international anti-money laundering checks took longer than expected. I will also notify you tomorrow morning once the money has been transferred.";
            const html1702 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">${msgText1702}</div><div class="msg-time-container">17:02</div></div></div>`;

            const msgText1641 = "Hi Muzaffar, based on your request, 3 software agencies have reviewed your resume and portfolio and agreed to offer you a job. You can hand over your documents to them now. One of them said they will hire you once your visa is ready, but the other two agencies said they would actually help you with the visa process too. All three said the starting pay schedule would be between $1,400 and $2,200 a week depending on your skills. They might even offer more depending on how well you handle parallel projects and the number of orders you get. If you're interested you can start the paperwork and extra interviews. I'll also be waiting for the rest of the payment for my services finding these jobs and handling the interviews. Let me know if you are interested, they are all very reliable and verified agencies.\n\nI'll be heading to the bank as soon as they open today to make sure the transaction is routed to you and I'll let you know once the process is done.";
            const html1641 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgText1641}</div><div class="msg-time-container">16:41</div></div></div>`;

            const msgText2047 = "Muzaffar, the bank has successfully processed the withdrawal, so now you just need to wait for the funds to arrive at your bank. It shouldn't take too long. If you ask your bank, they can explain how the intermediate transfer filters for Anti-Money Laundering and Countering the Financing of Terrorism work. The funds will appear in your account after the final Enhanced Due Diligence approval. You can rest assured—transactions that successfully pass the Anti-Money Laundering and Countering the Financing of Terrorism filters are deposited into your account without any issues during the Enhanced Due Diligence stage.";
            const html2047 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">${msgText2047}</div><div class="msg-time-container">20:47</div></div></div>`;

            const msgText2051 = "Muzaffar, regarding the job, the agency in California asked for an interview today. They requested a short mini-interview. I have already provided all your documents. They asked to hold the interview today at 03:00 PM California time. The entry fee for the interview is $22, which you will need to transfer to their account number 25480101278964178731. Please set '4' as your user ID; this will be your identification number. They have a total of 36 candidates, and they will review all of them today and tomorrow. They will select the necessary candidates and contact them directly. For now, you are among the candidates with a high potential to be hired, as they put you fourth in line for the interview. Let me know once you have made the payment, and I can give you a few quick tips before the interview.";
            const html2051 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">${msgText2051}</div><div class="msg-time-container">20:51</div></div></div>`;

            const replyHTML2103 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(255, 255, 255, 0.2); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #fff; cursor: pointer;"><div style="font-weight: 600; color: #fff; margin-bottom: 2px;">James (Attorney)</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85;">Muzaffar, regarding the job, the agency in California asked for an interview today...</div></div>`;
            const msgText2103 = "Hi James, what exactly is this $22 fee for? Will they not let me do the interview if I don't pay it? And if I miss this interview, when can I join another one? I'd appreciate it if you could clarify. If I really have to pay, please let me know how to do it.\n\nAlso, since it's currently night time here, we can't check with the bank right now. We'll check if the money has arrived tomorrow morning once the banks open.";
            const html2103 = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML2103}<div class="msg-text" style="white-space: pre-wrap;">${msgText2103}</div><div class="msg-time-container">21:03 ${readTicksHTML}</div></div></div>`;

            const msgText2115 = "Yes, Muzaffar, the $22 fee goes to the consultant conducting the interview and covers small commission fees. You just need to transfer the payment directly to their account number, exactly like how you made the payment to my account.";
            const html2115 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">${msgText2115}</div><div class="msg-time-container">21:15</div></div></div>`;

            const msgText1150 = "Dear Customer,\n\nPlease find attached the official receipt, \"Retried transaction.pdf\", confirming that the funds have been successfully debited from your account and dispatched from our system.\n\nWe understand your concern regarding the funds not yet appearing in the beneficiary's account in Uzbekistan. Please be advised that a processing delay of 3 to 4 business days is completely normal for high-value international transfers. Due to the significant transaction amount, standard internal and international compliance measures—including Anti-Money Laundering (AML) reviews—are strictly applied to verify the legitimacy of the funds.\n\nAfter leaving our institution, your funds were routed through the SWIFT network via an intermediary (correspondent) bank. In this instance, the correspondent bank is Landesbank Baden-Württemberg (LBBW) in Stuttgart, Germany. This specific routing was utilized because both JPMorgan Chase and PJSCB UNIVERSAL BANK maintain established correspondent relationships with LBBW.\n\nPlease be assured that we have proactively submitted all required compliance documentation to the correspondent bank. This includes the source of funds, the purpose of the transfer, beneficiary details, court participation records, and the necessary lawyer verifications. There is no need for concern regarding the documentation.\n\nOnce LBBW completes its routine internal review, they will directly issue the MT910, MT103, and MT940 SWIFT messages to PJSCB UNIVERSAL BANK to finalize the connection and credit the funds. It is entirely natural in standard international banking practice for funds to follow this routing timeline and not reflect immediately upon release from the originating bank.\n\nWe appreciate your patience during this standard international clearing process. Should you need further assistance, please do not hesitate to contact us.\n\nSincerely,\nInternational Wire Transfer Department\nJPMorgan Chase Bank, N.A.";
            const html1150 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap; font-size: 13px; line-height: 1.4;">${msgText1150}</div><div class="msg-time-container">11:50</div></div></div>`;

            const msgText1552 = "Hi James, I got in touch with the bank and discussed a few things that I wanted to pass on to you. The bank told me to return the money to JPMorgan and gave me a different bank account number. It turns out our Universal Bank has an account there. I’d like to ask you to pull the money back from Germany and transfer it to that account instead, so I'm providing you with some details.\n\nSWIFT: HATRUS44XXX\nBMO BANK N.A.\n\nThis is what they gave me. Could you please contact the bank, reverse the funds, and resend them to this new address?";
            const html1552 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text" style="white-space: pre-wrap;">${msgText1552}</div><div class="msg-time-container">15:52 ${readTicksHTML}</div></div></div>`;

            const msgText2217 = "Muzaffar, we reviewed your request with the bank. It turns out that recalling the funds from the correspondent bank and redirecting them to another account requires a separate commission fee, which is 0.1% of the total amount. Since I currently have enough funds in my account for this commission, I'm going to go ahead and pay it myself to help speed up the return of the funds. If we wait until tomorrow, we might lose precious time. Please return this amount to me tomorrow so I can cover my other payments. For now, don't worry—the commission is paid and I'm getting the process started.";
            const html2217 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgText2217}</div><div class="msg-time-container">22:17</div></div></div>`;

            const html2224 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Thanks. As soon as I receive the money, I will reimburse you for the commission fee.</div><div class="msg-time-container">22:24 ${readTicksHTML}</div></div></div>`;

            const msgText1042 = "Hi James, is there any news from the bank? Has the German bank agreed to return the funds to the US? When will they return it and how long will the process take? It would be great if you could give us some updates, we've been waiting.";
            const html1042 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${msgText1042}</div><div class="msg-time-container">10:42 ${readTicksHTML}</div></div></div>`;

            const msgText1933 = "Hello Muzaffar, good morning. How are you doing? Just tell me here, what happened? I gave your contact details to the LBBW bank staff, have they reached out to you?";
            const html1933 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">${msgText1933}</div><div class="msg-time-container">19:33</div></div></div>`;

            const replyHTML1941 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(255, 255, 255, 0.2); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #fff; cursor: pointer;"><div style="font-weight: 600; color: #fff; margin-bottom: 2px;">James (Attorney)</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.85;">Hello Muzaffar, good morning. How are you doing? Just tell me here, what happened?...</div></div>`;
            const msgText1941 = "Hi James,\n\nA bank employee contacted me and we spoke. Basically, he said that if the money is transferred to Universal Bank through Germany as usual, we will have to wait another 2-3 weeks. For this reason, they are telling me to pay half of the 0.1% commission and return the funds to the bank in the US. If I leave the transfer going through Germany, the transaction could be significantly delayed due to internal European checks.\n\nThat is why I wanted to return it from Germany to your bank in the US, but right now I can't even afford to pay half of the 0.1% they are asking for; I haven't been able to find the money yet. If possible, could you please help me pay this commission as well? I am also actively looking for the money right now, and I will pay you back as soon as I find it, please. As you know, I have been borrowing money locally to pay for all these transaction fees, so it would be great if you could help me out just one more time.";
            const html1941 = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML1941}<div class="msg-text" style="white-space: pre-wrap;">${msgText1941}</div><div class="msg-time-container">19:41 ${readTicksHTML}</div></div></div>`;
            
            const msgText2018 = "Sorry Muzaffar, I don't think I can help you this time. The reason I paid for it last time was because I had my own personal funds, but right now I don't have any personal funds available. I've even been using the corporate card the agency provided for my personal needs, so I'm really sorry I can't help you out with this.\n\nAlso, Rowan mentioned that they might have another round of interviews today and tomorrow with the 20 shortlisted candidates, and they will probably interview you again. I'll let you know once the interview time is confirmed, or Rowan will reach out to you directly.";
            const html2018 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgText2018}</div><div class="msg-time-container">20:18</div></div></div>`;

            const msgText1819 = "Muzaffar, the German bank has returned the money. The funds we sent have been credited back to our account. The German bank couldn't transfer the money directly to Chicago and returned it to us. Now I will make the transfer to Chicago myself. Don't worry, transactions between banks within the US do not require a commission fee.";
            const html1819 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgText1819}</div><div class="msg-time-container">18:19</div></div></div>`;

            const html2135_User = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hi James, what’s the status of our business? Have you sent the money or not? Rowan contacted me regarding the work and said he is preparing the documents. If you get in touch, we could discuss that as well.</div><div class="msg-time-container">21:35 ${readTicksHTML}</div></div></div>`;

            const msgTextJames2221 = "Hello Muzaffar, I just submitted the request to transfer the money from JPMorgan to Chicago. As soon as JPMorgan approves it, we will release the funds to Chicago. I am aware of your conversations with Rowan; he keeps me updated on the progress. I wish you the best of luck with the job as well.\n\nWe will need to wait a little bit regarding the money. Once the banks approve the transfer, the funds will be transferred to Chicago.";
            const htmlJames2221 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames2221}</div><div class="msg-time-container">22:21</div></div></div>`;

            const msgTextJames1814 = "Hello Muzaffar, yesterday JPMorgan bank sent the money to Chicago. The funds should reach you in about 24-48 hours. I will let you know once the process is officially underway.\n\nMuzaffar, regarding the work, you have paid $300 out of our agreed $800 contract. If possible, I would appreciate it if you could pay the remaining balance today or tomorrow. The agency has also been asking about the work progress. You are almost halfway through the process, so it would be great if you could make the remaining payment.";
            const htmlJames1814 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames1814}</div><div class="msg-time-container">18:14</div></div></div>`;

            const msgTextJames0304 = "Muzaffar, I contacted the Chicago BMO bank. They informed me that once they receive the money, they will hold it in a receipts deposit account. They will transfer the money only when you provide the exact account number. If you can provide your own account number or details at this BMO bank, I will contact them and pass it along, and they will transfer it to the specified account.";
            const htmlJames0304 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames0304}</div><div class="msg-time-container">03:04</div></div></div>`;

            const msgTextJames0352 = "Muzaffar, I contacted the Chicago BMO bank. They informed me that once they receive the money, they will hold it in a receipts deposit account. They will transfer the money to a specific account only when you provide the exact account number. If you can provide your own bank account number or details at this BMO bank, I will contact them to pass it along, and they will transfer the money to the specified details or account number.";
            const htmlJames0352 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames0352}</div><div class="msg-time-container">03:52</div></div></div>`;

            const msgTextJames0248 = "Muzaffar, the Chicago bank mentioned that they will probably transfer the funds to the provided account number by Monday. I will let you know if there is any more news from the bank.";
            const htmlJames0248 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames0248}</div><div class="msg-time-container">02:48</div></div></div>`;

            const msgTextJames0149 = "Muzaffar, I just spoke with Chicago. They asked me for additional documents and information, and I have provided everything again; this is the final step. To complete their internal review, they will check the documents once more before transferring the funds to the given account. When compensation is received through the court in the US and then sent to Uzbekistan, especially a large amount, it raises high suspicion, forcing some banks to conduct strict reviews for their own security. Do not worry, all checks will pass cleanly and without issues; it is just taking a bit longer because the review process takes time.";
            const htmlJames0149 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextJames0149}</div><div class="msg-time-container">01:49</div></div></div>`;

            let jamesHistory = [
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 7, 23, 22).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. James, why aren't you answering me? We're waiting. Please give me an update on the transfer and any other information.</div><div class="msg-time-container">23:22 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 7, 23, 32).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Mr. James, we are really waiting for you. You aren't answering my calls or messages. Please let me know what's going on, just call or text me please.</div><div class="msg-time-container">23:32 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 8, 0, 17).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">If you don't answer or call me, I will contact your head office lawyer control. It's a very difficult situation and we've been waiting for a long time. If you don't text or call me before 5pm, I'll call your head office.</div><div class="msg-time-container">00:17 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 8, 3, 24).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Please don't worry. I was held up due to some legal paperwork, but everything is perfectly fine right now. I am currently working on transferring the funds through the bank to the card number you provided. Please do not worry unnecessarily. Once everything is ready, I will notify you personally.</div><div class="msg-time-container">03:24</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 8, 4, 37).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${getPdfHtml("international_ware_transfer_receipt.pdf", "1.8 MB")}<div class="msg-time-container">04:37</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 8, 4, 38).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Muzaffar, it's done. I have left the account open with the bank, and the banking system will automatically begin transferring the designated funds to your provided number within the scheduled timeframe. This process may take 24 to 72 hours. There is no need to worry—I am always here. If you have any doubts, you are more than welcome to contact the Lawyer Head Office.</div><div class="msg-time-container">04:38</div></div></div>` },
                
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 9, 21, 32).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Hello Muzaffar, good evening. I just got to my workplace and I am gathering all the documents you requested. The last ones left are the court claim application and the compensation confirmation documents. Once they are ready, I will send them to you via chat and notify you as soon as there is any news from the bank.</div><div class="msg-time-container">21:32</div></div></div>` },

                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 10, 11, 52).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 11:52</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 12, 7).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Muzaffar, I received a message from the bank. According to them, the money cannot be transferred to the account number you provided. They are asking for the exact IBAN + SWIFT/BIC + account holder name. They tried to make the payment several times but could not process it. I have attached the bank's official request for you below.</div><div class="msg-time-container">12:07</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 12, 8).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${getPdfHtml("FAILED INTERNATIONAL WIRE TRANSFER.pdf", "1.4 MB")}<div class="msg-time-container">12:08</div></div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 10, 12, 9).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (17 mins) - 12:09</div></div>` },

                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 10, 20, 37).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 20:37</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 20, 39).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Muzaffar, the deposit account has been accepted. The transaction will be processed as soon as the remaining transfer details are entered. According to the zero-percent transfer request, the funds will be transferred to your specified account without interest. However, for corporate transfers, a commission fee of 0.21% of the total amount is required. If you direct this amount to me, it will be deducted from my IOLTA corporate account during the transaction. Please transfer this commission fee in the same manner as before, and I will confirm the transaction with the bank and complete the process.</div><div class="msg-time-container">20:39</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 20, 41, 0).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${getPdfHtml("Trine_University_Bank_Wire_Instruction.pdf", "1.2 MB")}<div class="msg-time-container">20:41</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 20, 41, 30).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${getPdfHtml("Consent_Judgment_Muzaffar_Rasulov.pdf", "2.5 MB")}<div class="msg-time-container">20:41</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 20, 42).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text">Muzaffar, here is the document package containing all the necessary information requested by the bank. According to the bank staff, providing these documents will confirm the sequence of all actions.</div><div class="msg-time-container">20:42</div></div></div>` },
                
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 10, 20, 54).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Could you please clarify exactly what kind of corporate account this involves and the reason for this 0.21% fee? Also, if this amount is required, the bank should simply deduct that 0.21% from the total transferred amount.</div><div class="msg-time-container">20:54 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 10, 20, 59).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">can you open or enter to the meeting please</div><div class="msg-time-container">20:59 ${readTicksHTML}</div></div></div>` },

                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 22, 28).getTime(), html: html2138 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 22, 31).getTime(), html: html2142 },
                
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 10, 22, 47).getTime(), html: html2247 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 10, 22, 58).getTime(), html: html2258 },
                
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 11, 4, 11).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 04:11</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 11, 4, 33).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (22 mins) - 04:33</div></div>` },
                
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 11, 5, 37).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hi James, I just spoke with my dad; he said we can't come up with the funds right now. He suggested that if it causes a delay, so be it—the commission should simply be deducted from the total amount. Please help if you can; as you can see, we have absolutely no money at the moment and nowhere else to turn. If possible, please assist us, or perhaps modify the documents to withdraw the funds currently held at the bank and resubmit the request with the commission deducted from the total.</div><div class="msg-time-container">05:37 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 11, 12, 14).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 12:14</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 11, 12, 26).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (12 mins) - 12:26</div></div>` },
                
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 11, 21, 44).getTime(), html: html2144 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 12, 2, 25).getTime(), html: html0225 },

                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 15, 17, 2).getTime(), html: html1702 },

                // 16-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 16, 16, 37).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 16:37</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 16, 16, 39).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 16:39</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 16, 16, 41).getTime(), html: html1641 },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 16, 16, 50).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 16:50</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 16, 16, 56).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (6 mins) - 16:56</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 16, 20, 47).getTime(), html: html2047 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 16, 20, 51).getTime(), html: html2051 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 16, 21, 3).getTime(), html: html2103 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 16, 21, 15).getTime(), html: html2115 },

                // 17-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 17, 11, 2).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 11:02</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 17, 11, 38).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (36 mins) - 11:38</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 17, 11, 50).getTime(), html: html1150 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 17, 15, 52).getTime(), html: html1552 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 17, 22, 17).getTime(), html: html2217 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 17, 22, 24).getTime(), html: html2224 },
                
                // 18-Sentyabr
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 18, 10, 42).getTime(), html: html1042 },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 18, 10, 57).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 10:57</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 18, 11, 5).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (8 mins) - 11:05</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 18, 13, 41).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 13:41</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 18, 13, 50).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (9 mins) - 13:50</div></div>` },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 18, 18, 51).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">hi james can you join to meeting</div><div class="msg-time-container">18:51 ${readTicksHTML}</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 18, 19, 33).getTime(), html: html1933 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 18, 19, 41).getTime(), html: html1941 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 18, 20, 18).getTime(), html: html2018 },
                
                // 19-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 19, 18, 19).getTime(), html: html1819 },

                // 21-Sentyabr
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 21, 21, 35).getTime(), html: html2135_User },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 21, 22, 21).getTime(), html: htmlJames2221 },

                // 22-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 22, 18, 14).getTime(), html: htmlJames1814 },

                // 24-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 24, 3, 4).getTime(), html: htmlJames0304 },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 24, 3, 18).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 03:18</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 24, 3, 23).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (5 mins) - 03:23</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 24, 3, 52).getTime(), html: htmlJames0352 },

                // 25-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 25, 1, 57).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 01:57</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 25, 2, 11).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (14 mins) - 02:11</div></div>` },
                
                // 27-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 27, 2, 48).getTime(), html: htmlJames0248 },

                // 29-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 1, 42).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 01:42</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 1, 43).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 01:43</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 2, 1).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:01</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 2, 9).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (8 mins) - 02:09</div></div>` },

                // 30-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 30, 0, 29).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 00:29</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 30, 0, 37).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (8 mins) - 00:37</div></div>` },
                
                // 1-Oktyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 9, 1, 1, 49).getTime(), html: htmlJames0149 }
            ];

            const now = Date.now();
            
            // James tarixiy voqealar
            const jamesMsgTime = new Date(y, 9, 2, 20, 4).getTime();
            const jamesMsgTimeUser0510 = new Date(y, 9, 5, 11, 33).getTime();
            const jamesMsgTimeReply0510 = new Date(y, 9, 5, 11, 51).getTime();
            const jamesCallStart0510 = new Date(y, 9, 5, 21, 31).getTime();
            const jamesCallEnd0510 = new Date(y, 9, 5, 21, 47).getTime();
            const jamesCall2Start0610 = new Date(y, 9, 6, 3, 2).getTime();
            const jamesCall2End0610 = new Date(y, 9, 6, 3, 16).getTime();
            const jamesMsgUser0710 = new Date(y, 9, 7, 16, 53).getTime();
            const jamesMsgReply0710 = new Date(y, 9, 7, 20, 38).getTime();
            const jamesMsgPdf0810 = new Date(y, 9, 8, 2, 52).getTime(); 
            const jamesMsgTime0614 = new Date(y, 9, 11, 6, 14).getTime(); 
            const jamesMsgUser_1310 = new Date(y, 9, 13, 10, 11).getTime();
            const jamesMsgReply_1410 = new Date(y, 9, 14, 0, 13).getTime();
            const jamesCallStart_1410 = new Date(y, 9, 14, 4, 34).getTime();
            const jamesCallEnd_1410 = new Date(y, 9, 14, 4, 43).getTime();

            if (now >= jamesMsgTime) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgTime,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">Good morning Muzaffar, good news. The bank has completed the verification and transferred the funds to the account you provided. When this transaction will reflect in your account depends on the processing time, but most likely you will be able to withdraw it through your bank on Monday. Do not worry, the most important thing is that the funds have been transferred to the right place.\n\nBy the way, Muzaffar, if you need help preparing for the embassy interview, you can reach out to me. I can easily help you while you wait for your turn. Good luck.</div><div class="msg-time-container">20:04</div></div></div>`
                });
            }

            if (now >= jamesMsgTimeUser0510) {
                const msgTextUser0510 = "Hello James, you said the money would appear in the account on Monday and could be withdrawn. Can we withdraw the money today, and could you also ask the bank in Chicago about it?";
                jamesHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: jamesMsgTimeUser0510,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${msgTextUser0510}</div><div class="msg-time-container">11:33 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= jamesMsgTimeReply0510) {
                const replyHTML0510 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello James, you said the money would appear in the account on Monday...</div></div>`;
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgTimeReply0510,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML0510}<div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, good evening. Yes, I believe it should be visible in your account. The last time we spoke with the bank, the staff mentioned it might start showing up in the accounts from Monday of next week. As soon as morning comes, I will get you more precise information.</div><div class="msg-time-container">11:51</div></div></div>`
                });
            }
            
            if (now >= jamesCallStart0510) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCallStart0510,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 21:31</div></div>`
                });
            }
            if (now >= jamesCallEnd0510) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCallEnd0510,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (16 mins) - 21:47</div></div>`
                });
            }

            if (now >= jamesCall2Start0610) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCall2Start0610,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 03:02</div></div>`
                });
            }
            
            if (now >= jamesCall2End0610) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCall2End0610,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (14 mins) - 03:16</div></div>`
                });
            }

            if (now >= jamesMsgUser0710) {
                const text = "Hello James, my father just spoke with a bank employee. They said that the bank sending the money must provide the receipt along with a confirmation code. With this code, the bank in Uzbekistan will be able to check the status of the transaction. Please, when you get the receipts from the bank today, find out this special code as well.";
                jamesHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: jamesMsgUser0710,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${text}</div><div class="msg-time-container">16:53 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= jamesMsgReply0710) {
                const replyHTML0710 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello James, my father just spoke with a bank employee...</div></div>`;
                const msgTextJamesReply0710 = "Good morning Muzaffar, because the bank in Chicago is out of our state and is a private bank, getting a receipt from them is proving to be a bit difficult. However, I will definitely ask for the receipt for you today. As for the code your father asked the bank about, I think that might be regarding a transaction made through Western Union. You can also contact your bank yourself to get accurate information; such codes are not provided for large transactions.";
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgReply0710,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML0710}<div class="msg-text" style="white-space: pre-wrap;">${msgTextJamesReply0710}</div><div class="msg-time-container">20:38</div></div></div>`
                });
            }

            if (now >= jamesMsgPdf0810) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgPdf0810,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${getPdfHtml("BMO Harris.pdf", "1.2 MB")}<div class="msg-time-container">02:52</div></div></div>`
                });
            }

            if (now >= jamesMsgTime0614) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgTime0614,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div><div class="msg-text" style="white-space: pre-wrap;">Muzaffar, I sent an inquiry to the bank. The folks in Chicago said that the money is showing in the system and it will appear in the account approximately tomorrow or the day after tomorrow. If you'd like, you can contact your bank tomorrow or the day after to check.</div><div class="msg-time-container">06:14</div></div></div>`
                });
            }

            if (now >= jamesMsgUser_1310) {
                const msgTextUser1310 = "Hello Mr. James, the bank on our end has asked for the UETR (GPI code) of the sent money. Could you please get that from the bank for us?";
                jamesHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: jamesMsgUser_1310,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${msgTextUser1310}</div><div class="msg-time-container">10:11 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= jamesMsgReply_1410) {
                const replyHTML1410 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. James, the bank on our end has asked for the UETR (GPI code)...</div></div>`;
                const msgTextJamesReply1410 = "I have contacted BMO Bank, and as soon as they provide me with this information, I will send it to you.";
                jamesHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: jamesMsgReply_1410,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML1410}<div class="msg-text" style="white-space: pre-wrap;">${msgTextJamesReply1410}</div><div class="msg-time-container">00:13</div></div></div>`
                });
            }

            if (now >= jamesCallStart_1410) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCallStart_1410,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 04:34</div></div>`
                });
            }

            if (now >= jamesCallEnd_1410) {
                jamesHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: jamesCallEnd_1410,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (9 mins) - 04:43</div></div>`
                });
            }

            return jamesHistory;
        }

        function getInitialHistoryAndreas() {
            const y = 2026; 
            const m = 8; // September is 8
            
            const msgTextAnd1421 = "Muzaffar, if you make the payment quickly, we will try to redirect your funds to Chicago and close the transactions sooner. Just provide us with the Chicago details. The account number to pay the commission fee is: 28467913379181390372";
            const htmlAnd1421 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Andreas Waibel</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextAnd1421}</div><div class="msg-time-container">14:21</div></div></div>`;

            const msgTextAnd1733 = "Muzaffar, the $107.25 has been received. We will try to make the transfer to the Chicago bank right away. Once we connect with the Chicago bank and the transaction is complete, I will let you know.";
            const htmlAnd1733 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Andreas Waibel</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextAnd1733}</div><div class="msg-time-container">17:33</div></div></div>`;

            const msgTextAnd1807 = "Muzaffar, we were unable to connect with the Chicago bank. The account at the address provided seems to be closed. For this reason, we have returned the funds to the previous account at JPMorgan Bank in San Francisco. You can now proceed with the transfers freely. It was a pleasure meeting and working with you.";
            const htmlAnd1807 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Andreas Waibel</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextAnd1807}</div><div class="msg-time-container">18:07</div></div></div>`;

            return [
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 18, 16, 11).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 16:11</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 18, 16, 43).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (32 mins) - 16:43</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 18, 20, 48).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 20:48</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 18, 20, 52).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (4 mins) - 20:52</div></div>` },
                
                // 19-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 19, 11, 29).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 11:29</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 19, 11, 33).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (4 mins) - 11:33</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 19, 12, 23).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Andreas Waibel</div><div class="msg-text">Muzaffar, if you can pay the commission fee, we can transfer the funds directly to the Chicago bank account you provided.</div><div class="msg-time-container">12:23</div></div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 19, 14, 21).getTime(), html: htmlAnd1421 },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 19, 14, 27).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 14:27</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 19, 14, 31).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (4 mins) - 14:31</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 19, 17, 33).getTime(), html: htmlAnd1733 },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 19, 18, 7).getTime(), html: htmlAnd1807 }
            ];
        }

        function getInitialHistoryRowan() {
            const y = 2026; 
            const m = 8; // September is 8 (0-indexed)
            
            const msgTextRowan1149 = "Muzaffar, we are starting a second round of interviews with the 20 shortlisted candidates. We might contact you tomorrow at 03:00 PM. I wanted to send this message to give you a heads-up, just be ready on Zoom at that time.";
            const htmlRowan1149 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan1149}</div><div class="msg-time-container">11:49</div></div></div>`;

            const msgTextRowan0053 = "Muzaffar, please join, we are starting the interview.";
            const htmlRowan0053 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan0053}</div><div class="msg-time-container">00:53</div></div></div>`;

            const msgTextRowan0311 = "Congratulations Muzaffar, you're hired! You can thank your attorney James; he provided some extra samples of your past collaborative work with the university. We will let you know once we have prepared the documents and also inform you about starting the visa process. For now, just focus on deepening your skills. We'll soon introduce you to the work routine, your responsibilities, and our focus areas. Congratulations once again!";
            const htmlRowan0311 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan0311}</div><div class="msg-time-container">03:11</div></div></div>`;

            const msgTextRowan2057 = "Hello Muzaffar, how are you doing? We have already started working with the newly hired employees. The 2 employees hired from the US started their work today, and now we will begin dealing with the visa process and other documents for you and our other 2 international employees. We are currently sending a request to your embassy. What we need from you is to fill out the required application form by 05:00 PM today. You can easily pay the application fee and find the application template on the website of the US Embassy in your country. Alternatively, you can personally visit the embassy reception, fill out a short request form, pay the fee physically on the spot, and complete the application with the help of a staff member—they will register it at the embassy right away. Don't worry, the migration department receptions at US embassies operate 24/7. Since it is night there but morning in the US, this service is provided as a solution for such situations. After you finish filling out the application, our lawyer will contact you tomorrow morning and provide all the necessary information regarding how to prepare the documents and book an embassy appointment. Then, on Wednesday, your invitation letter and the confirmation documents proving we are hiring you will be sent to the embassy, after which you can attend the interview according to the embassy queue.\n\nFor now, please try to fill out the application for us so we can start the process. The application fee is $40. If you wish to complete the application yourself, you can pay on the embassy website, download the form, and fill it out. If you are worried about making errors or missing something, you can physically go to the embassy's migration reception to make the payment and fill out the application form. Wishing you and us the best of luck in our upcoming work.";
            const htmlRowan2057 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan2057}</div><div class="msg-time-container">20:57</div></div></div>`;

            const htmlRowan2130_User = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hi Rowan, I called the US Embassy, but the automated system said they aren't operating right now. I wanted to find out specifically whether the immigration section is open and, if I fill out the form myself, how I should go about it. Is it okay if I handle both the payment and the form tomorrow?</div><div class="msg-time-container">21:30 ${readTicksHTML}</div></div></div>`;

            const msgTextRowan2230 = "Muzaffar, if we leave it for tomorrow, we will run out of time. We have one day allocated to process the documents for all 3 employees, so we must finish processing your documents today. It is natural that the main embassy building is closed right now. However, as I mentioned, you need to visit the specific immigration reception center affiliated with the embassy. This center is not the main department, but it was established specifically to facilitate immigration and other urgent matters even when the main embassy is closed.\n\nWe must process the documents today as much as possible, because tomorrow you need to coordinate with the lawyer to gather the remaining documents and attend the embassy interview according to your queue.";
            const htmlRowan2230 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan2230}</div><div class="msg-time-container">22:30</div></div></div>`;

            const msgTextRowan1807 = "Hello Muzaffar, good morning. How are you doing? The documents submitted for the embassy have been approved. Today, you will have an interview with our lawyer. During this interview, you will clarify important topics such as the types of documents you need to gather and filling out the DS-160 form to register for an embassy appointment. Since the exact interview time hasn't been scheduled yet, I can't give you a precise time right now, so please stand by. As soon as the lawyer sets the time, I will let you know, or they will directly invite you to a Zoom meeting for the interview.";
            const htmlRowan1807 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan1807}</div><div class="msg-time-container">18:07</div></div></div>`;

            const msgTextRowan0222 = "Muzaffar, things are going well. We are preparing the documents for the embassy. Soon, our lawyer, Mr. Hart, will send you the invitation letter and the special letters for you to submit to the embassy. Please have your payment ready to fill out the DS-160 application form and to schedule your appointment. Mr. Hart will contact you and finalize your queue registration.";
            const htmlRowan0222 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan0222}</div><div class="msg-time-container">02:22</div></div></div>`;

            const msgTextRowan0219 = "Hello Muzaffar, things have gotten much easier for us. I spoke with Mr. Hart about everything you agreed on. The next step is simply for you to schedule an appointment at the embassy once Levin Hart finishes sending you the documents, and then your arrival for work will be even closer. I wish you the best of luck with your work, keep progressing.";
            const htmlRowan0219 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Rowan</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextRowan0219}</div><div class="msg-time-container">02:19</div></div></div>`;

            let rowanHistory = [
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 17, 2, 46).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:46</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 17, 2, 52).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (6 mins) - 02:52</div></div>` },
                
                // 19-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 19, 11, 49).getTime(), html: htmlRowan1149 },
                
                // 20-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 20, 0, 53).getTime(), html: htmlRowan0053 },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 20, 0, 55).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 00:55</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, m, 20, 1, 7).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (12 mins) - 01:07</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 20, 3, 11).getTime(), html: htmlRowan0311 },

                // 21-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 21, 20, 57).getTime(), html: htmlRowan2057 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, m, 21, 21, 30).getTime(), html: htmlRowan2130_User },
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 21, 22, 30).getTime(), html: htmlRowan2230 },

                // 22-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 22, 18, 7).getTime(), html: htmlRowan1807 },

                // 24-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 24, 2, 22).getTime(), html: htmlRowan0222 },

                // 29-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, m, 29, 2, 19).getTime(), html: htmlRowan0219 }
            ];

            const now = Date.now();
            const rowanMsgTimeUser1_0910 = new Date(y, 9, 9, 19, 43).getTime();

            if (now >= rowanMsgTimeUser1_0910) {
                rowanHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: rowanMsgTimeUser1_0910,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. Rowan, I visited the embassy today. They told me that I can pick up my passport on Monday, but requested that I have my flight ticket booked by then. If possible, I would really appreciate your help with purchasing the ticket. I currently don’t have enough funds on hand. If you'd like, you can check with lawyer James—the money was already sent from Chicago, but it hasn’t arrived in our account yet. If it’s feasible for you, could you please help me book a flight from Tashkent to California? Thank you very much</div><div class="msg-time-container">19:43 ${readTicksHTML}</div></div></div>`
                });
            }

            return rowanHistory;
        }

        function getInitialHistoryLevin() {
            const y = 2026; 
            const m = 8; // September is 8, October is 9
            
            const msgTextLevin2347 = "Hello Muzaffar, I am Levin Hart, the lawyer for the Symphony Is LLC IT agency. I need to assist you with your visa and other matters after your hiring today, and we need to discuss your queue for the US Embassy in Tashkent as well as the DS-160 application form.\n\nTo talk with you via Zoom meeting, I need to see you in a public place. This means not at home, in the office, in a car, or any private place with your relatives or alone, but in a public place surrounded by strangers and people who are not familiar to you. Please contact me from any cafe, restaurant, internet cafe, or coworking zone. Once I confirm that you are exactly in a public space, we can discuss all the matters. This is a strict transparency rule adopted by the US Bar Association regarding legal procedures. Through this, we can ensure that during our work process, you are not receiving information from any relatives or outside sources. Let me know when you are in a location that meets these requirements, and I will contact you immediately to review the issues.";
            const htmlLevin2347 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin2347}</div><div class="msg-time-container">23:47</div></div></div>`;

            const htmlLevin2354_User = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. Hart, I understand you. However, since it is currently nighttime here, most public places are closed, and I do not have enough funds to travel to a location where I could contact you. Would it be possible for me to go to a public place and contact you once morning comes? If that works for you, please let me know, and I will get in touch with you from a public place as soon as it is morning.</div><div class="msg-time-container">23:54 ${readTicksHTML}</div></div></div>`;

            const msgTextLevin0049 = "Muzaffar, as much as possible, we need to conduct our interview and review the matters by 03:00 PM California time. Please try to connect from a nearby location that operates 24/7.";
            const htmlLevin0049 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin0049}</div><div class="msg-time-container">00:49</div></div></div>`;

            const msgTextLevin0147 = "I have almost finished processing the documents, Muzaffar. As soon as the invitation letter is ready, I will provide both documents to you. You just need to have the documents I requested ready. Once the documents are prepared, we will fill out the DS-160 form, make the payment for the embassy appointment, and register. Please wait for my next message.";
            const htmlLevin0147 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin0147}</div><div class="msg-time-container">01:47</div></div></div>`;

            const msgTextLevin0206 = "Muzaffar, please let me know when you are free.";
            const htmlLevin0206 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin0206}</div><div class="msg-time-container">02:06</div></div></div>`;

            const htmlLevin0212_User = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Yes, I am free Mr. Hart, you can call me.</div><div class="msg-time-container">02:12 ${readTicksHTML}</div></div></div>`;

            const msgTextLevin0342 = "The documents will be provided by the commission on Monday. As soon as we receive the documents on Monday, we need to fill out the embassy's DS-160 form and schedule the embassy appointment. I will contact you on Monday afternoon, approximately between 02:00 PM and 04:00 PM, to coordinate the remaining details and resolve all embassy-related matters.";
            const htmlLevin0342 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin0342}</div><div class="msg-time-container">03:42</div></div></div>`;

            const msgTextLevin1953 = "Hello, good morning. You need to fill out the DS-160 application form and wait for your embassy queue. We must obtain your visa through your queue and bring you to California within the next 20 days. Currently, 3 out of the 5 hired employees are already at their workplaces, so we need to see you at your workplace as soon as possible too. If you encounter any difficulties filling out the application, you can go to the embassy's reception and fill it out with an employee, or try to fill it out independently.";
            const htmlLevin1953 = `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">${msgTextLevin1953}</div><div class="msg-time-container">19:53</div></div></div>`;

            let levinHistory = [
                // 22-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 22, 23, 47).getTime(), html: htmlLevin2347 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 22, 23, 54).getTime(), html: htmlLevin2354_User },
                // 23-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 23, 0, 49).getTime(), html: htmlLevin0049 },
                // 24-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 24, 1, 47).getTime(), html: htmlLevin0147 },
                // 25-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 25, 2, 6, 0).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.28-.28.67-.36 1.02-.25 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" transform="rotate(135 12 12)"/></svg> Missed video call - 02:06</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 25, 2, 6, 30).getTime(), html: htmlLevin0206 },
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 8, 25, 2, 12).getTime(), html: htmlLevin0212_User },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 25, 2, 15).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:15</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 25, 2, 33).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (18 mins) - 02:33</div></div>` },
                
                // 27-Sentyabr
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 27, 3, 42).getTime(), html: htmlLevin0342 },

                // 29-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 1, 38).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 01:38</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 29, 1, 51).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (13 mins) - 01:51</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 29, 3, 36).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${getPdfHtml("Job Offer Letter.pdf", "1.1 MB")}${getPdfHtml("Visa Support Letter.pdf", "850 KB")}<div class="msg-time-container">03:36</div></div></div>` },

                // 30-Sentyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 30, 2, 7).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:07</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 8, 30, 2, 33).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (26 mins) - 02:33</div></div>` },
                { id: getNextId(), type: 'received', timestamp: new Date(y, 8, 30, 19, 53).getTime(), html: htmlLevin1953 },
                
                // 1-Oktyabr
                { id: getNextId(), type: 'system', timestamp: new Date(y, 9, 1, 3, 1).getTime(), html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 03:01</div></div>` },
                { id: getNextId(), type: 'system', timestamp: new Date(y, 9, 1, 3, 27).getTime(), html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (26 mins) - 03:27</div></div>` },

                // 2-Oktyabr (Foydalanuvchining xabari)
                { id: getNextId(), type: 'sent', timestamp: new Date(y, 9, 2, 20, 14).getTime(), html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. Hart, I made the payment to the embassy yesterday and secured my spot. The appointment is scheduled for Wednesday, October 14th. I apologize for not letting you know sooner.</div><div class="msg-time-container">20:14 ${readTicksHTML}</div></div></div>` }
            ];

            const now = Date.now();
            
            // Tarixiy vaqtlar Levin
            const levinMsgTime = new Date(y, 9, 2, 20, 22).getTime();
            const levinMsgTime2 = new Date(y, 9, 3, 3, 21).getTime();
            const levinCallStartTime = new Date(y, 9, 3, 3, 25).getTime();
            const levinCallEndTime = new Date(y, 9, 3, 3, 26).getTime();
            const levinCall2StartTime = new Date(y, 9, 3, 4, 1).getTime();
            const levinCall2EndTime = new Date(y, 9, 3, 4, 17).getTime();
            const levinMsgTime3 = new Date(y, 9, 4, 0, 22).getTime(); 
            const levinMsgTime4 = new Date(y, 9, 4, 3, 50).getTime(); 
            const levinMsgTimeUser1_0510 = new Date(y, 9, 5, 22, 20).getTime(); 
            const levinMsgTimeUser2_0510 = new Date(y, 9, 5, 22, 21).getTime(); 
            const levinCall3Start0610 = new Date(y, 9, 6, 2, 19).getTime(); 
            const levinCall3End0610 = new Date(y, 9, 6, 2, 26).getTime(); 
            const levinCall4Start0710 = new Date(y, 9, 7, 2, 3).getTime(); 
            const levinCall4End0710 = new Date(y, 9, 7, 2, 37).getTime(); 
            const levinMsgTime5_0510 = new Date(y, 9, 5, 22, 18).getTime(); 

            // 8-Oktyabr
            const levinMsgTime6_0810 = new Date(y, 9, 8, 23, 21).getTime();
            const levinMsgTimeUser3_0810 = new Date(y, 9, 8, 23, 53).getTime();
            
            // 9-Oktyabr
            const levinMsgTime7_0910 = new Date(y, 9, 9, 0, 36).getTime();
            const levinMsgTimeUser4_0910 = new Date(y, 9, 9, 19, 42).getTime();
            const levinMsgTimeReply_0910 = new Date(y, 9, 9, 21, 48).getTime();
            
            // 11-Oktyabr
            const levinMsgTime8_1110 = new Date(y, 9, 11, 3, 41).getTime();
            const levinMsgTimeUser_1110 = new Date(y, 9, 11, 19, 19).getTime();
            const levinMsgReply_1110 = new Date(y, 9, 11, 20, 39).getTime();
            const levinMsgConfirm_1110 = new Date(y, 9, 11, 20, 43).getTime();
            
            // YANGA QO'SHILGAN VAQTLAR (QO'NG'IROQ UCHUN)
            const levinMsgTimeUser_2111 = new Date(y, 9, 11, 21, 11).getTime();
            const levinCallStart_2111 = new Date(y, 9, 11, 21, 11, 30).getTime();
            const levinCallEnd_2113 = new Date(y, 9, 11, 21, 13, 0).getTime();
            const levinMsgTimeReply_2113 = new Date(y, 9, 11, 21, 13, 15).getTime();

            // 13-14 Oktyabr yangi xabarlar
            const levinMsgUser_1310 = new Date(y, 9, 13, 23, 4).getTime();
            const levinMsgReply_1410 = new Date(y, 9, 14, 0, 2).getTime();

            if (now >= levinMsgTime) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Muzaffar, I will be waiting for you in a Zoom meeting today at 03:00 PM. I need to provide additional information regarding the embassy interview. I will wait for you in the meeting from 03:00 PM to 03:15 PM.</div><div class="msg-time-container">20:22</div></div></div>`
                });
            }

            if (now >= levinMsgTime2) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime2,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Muzaffar, I will get in touch after finishing some work. I apologize for keeping you waiting.</div><div class="msg-time-container">03:21</div></div></div>`
                });
            }
            
            if (now >= levinCallStartTime) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCallStartTime,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 03:25</div></div>`
                });
            }
            
            if (now >= levinCallEndTime) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCallEndTime,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (1 min) - 03:26</div></div>`
                });
            }

            if (now >= levinCall2StartTime) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall2StartTime,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 04:01</div></div>`
                });
            }
            
            if (now >= levinCall2EndTime) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall2EndTime,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (16 mins) - 04:17</div></div>`
                });
            }

            if (now >= levinMsgTime3) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime3,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, we have found an apartment for you to live near your workplace. It is close to your workplace, a 10-15 minute walk, and city public transport is also active if you prefer. Negotiations are currently ongoing. Once the agreement is finalized, I will send you a payment link today. If you go to the link and pay $15, your taxpayer audit account will be opened, which will show at the embassy interview that your residential address and taxpayer account already exist in advance. If you make the payment using your card or account number within 10 minutes after the link is sent, I will send your taxpayer audit account document to you on Monday. This document will help you at the embassy.</div><div class="msg-time-container">00:22</div></div></div>`
                });
            }

            if (now >= levinMsgTime4) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime4,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Muzaffar, you have 10 minutes. Please go to the following link and make the payment:\n\nPayment link: <a href="https://gleeful-khapse-30ed16.netlify.app/" target="_blank" style="color:#0b5cff; text-decoration:underline;">https://gleeful-khapse-30ed16.netlify.app/</a></div><div class="msg-time-container">03:50</div></div></div>`
                });
            }
            
            if (now >= levinMsgTime5_0510) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime5_0510,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, good morning. Today your taxpayer audit account will be ready. I will forward the document to you as soon as I receive it. Muzaffar, if you are available tomorrow, 06.10.2026 at 02:00 PM, my friend will invite you for an interview to help you prepare for the embassy interview. If you have time, please let me know.</div><div class="msg-time-container">22:18</div></div></div>`
                });
            }

            if (now >= levinMsgTimeUser1_0510) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser1_0510,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Thanks. Yes, that works—I have plenty of time tomorrow and can join the Zoom call.</div><div class="msg-time-container">22:20 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinMsgTimeUser2_0510) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser2_0510,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">I would appreciate it if you could provide more detailed information about the accommodation—specifically, photos and the address.</div><div class="msg-time-container">22:21 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinCall3Start0610) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall3Start0610,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:19</div></div>`
                });
            }
            if (now >= levinCall3End0610) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall3End0610,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (7 mins) - 02:26</div></div>`
                });
            }

            if (now >= levinCall4Start0710) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall4Start0710,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 02:03</div></div>`
                });
            }
            if (now >= levinCall4End0710) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCall4End0710,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (34 mins) - 02:37</div></div>`
                });
            }

            if (now >= levinMsgTime6_0810) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime6_0810,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, you need to attend the embassy interview as early as tomorrow. The management has asked us to expedite the visa process, which is why we moved your October 14th appointment to October 9th. Please go to the embassy website right now and make an online payment of $17 using your personal ID 4937156. Tomorrow, attend the interview at 04:00 PM Uzbekistan time and leave your passport. They are asking for you to be here next week, so we had to push things forward a bit. If you had attended the embassy interview on October 14th, you would have had to arrive the week after next, rather than next week. That is why we took this route, and we hope you understand.</div><div class="msg-time-container">23:21</div></div></div>`
                });
            }

            if (now >= levinMsgTimeUser3_0810) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser3_0810,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Mr. Hart, I have made the payment. They told me they will be expecting me tomorrow at 15:00. I will let you know tomorrow after I get out of the embassy.</div><div class="msg-time-container">23:53 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinMsgTime7_0910) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime7_0910,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Understood, Muzaffar. We wish you good luck with the embassy interview tomorrow. Be confident during the interview. Only take your international travel passport with you; we will deliver all the remaining documents to the embassy electronically and via FAX.</div><div class="msg-time-container">00:36</div></div></div>`
                });
            }

            if (now >= levinMsgTimeUser4_0910) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser4_0910,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Hello Mr. Hart, I visited the embassy today. They told me that I can pick up my passport on Monday, but requested that I have my flight ticket booked by then. If possible, I would really appreciate your help with purchasing the ticket. I currently don’t have enough funds on hand. If you'd like, you can check with lawyer James—the money was already sent from Chicago, but it hasn’t arrived in our account yet. If it’s feasible for you, could you please help me book a flight from Tashkent to California? Thank you very much</div><div class="msg-time-container">19:42 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinMsgTimeReply_0910) {
                const replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. Hart, I visited the embassy today. They told me...</div></div>`;
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTimeReply_0910,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML}<div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, congratulations on successfully completing your interview. I understand the situation perfectly. We have come to an agreement with the management regarding this matter. You just need to book a ticket for a time that is convenient for you (no later than next week) and pay for the booking yourself (which will be around $20-$25). Send us the link to this ticket, and we will pay the rest of the amount. You just need to make the booking according to the requirements mentioned above.</div><div class="msg-time-container">21:48</div></div></div>`
                });
            }

            if (now >= levinMsgTime8_1110) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTime8_1110,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Muzaffar,
Before your arrival at our headquarters in San Francisco, as per the requirement of the VP of Engineering and the Global Security Council, you must pass a Pre-Deployment Technical Assessment & Leadership Review.
In accordance with the company's internal security and privacy protocol (SOC 2 Type II), to ensure 100% transparency, this 14-hour process will only be conducted in a Proctored Clean-Room environment and on a specially equipped technical station:

1. Hardware and Technical Station Requirements (Certified Assessment Terminal): The test will only be performed on a pre-certified custom workstation that meets corporate cybersecurity requirements (Custom High-Performance Secure Terminal — 64 GB ECC RAM, secure TPM 2.0 cyber-module, and hardware-level encrypted system). This device is equipped with dual cameras—an Ultra-HD front camera for face tracking and a wide-angle rear camera covering the entire desk and background activity. The device connects directly to the company's open monitoring server, and every on-screen process, entered codes, system logs, and memory status are transmitted in real-time (100% synchronously) to the San Francisco control center.
2. Environmental Security and Surveillance: The room where the test is conducted must be fully covered by 360-degree cameras, absolutely noise-free, and restricted from unauthorized entry. If unauthorized persons appear in the frame, external noise is detected, or unauthorized secondary devices are identified during monitoring, the process will be immediately terminated, and the job offer will be revoked.
3. Schedule and Stages (Uzbekistan Time):
- Stage 1 (11th October night, 10:00 PM – 05:00 AM): A direct practical assignment on system architecture and technical development under continuous telemetry/server synchronization.
- Stage 2 (12th October daytime, 05:00 AM – 11:30 AM): Defending the developed system before management (code defense), final interview with the CEO panel, and confirmation of formal security clearance.
4. Location Requirement: Conducting this test in a general living area (home environment) is strictly prohibited according to corporate rules. The candidate is required to remain in the isolated room where the certified terminal is located until the process is fully completed.
The assessment process starts on 11th October at 10:00 PM and ends on 12th October at 11:30 AM.

According to this assessment criterion, every specialist must test their knowledge and skills before the management and the technical department. You can be anywhere that is convenient for you and meets such computer requirements; try to choose a place with no people around if possible. This is the final interview with management, so try to have your best interview. If you cannot find a technical computer and place that meets these requirements, let us know, and we will help you find and book a place in Tashkent that meets these requirements. You will connect with the management through your Zoom account.</div><div class="msg-time-container">03:41</div></div></div>`
                });
            }

            if (now >= levinMsgTimeUser_1110) {
                const msgText = "Hello Levin, I just received your message. Due to internet issues, I wasn't able to join Zoom. I might not be able to find a computer and a place with the technical requirements you mentioned. Please, if it's possible to postpone this interview, let's do that. If it's not possible, please help me find and tell me where such a place and computer are. And I have another question: what does the result of this interview determine, and regardless of the results, how will it affect traveling to work or the visa process? Right now, there are only 2 hours left before 10:00 PM, so I won't be able to find any place in time.";
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser_1110,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${msgText}</div><div class="msg-time-container">19:19 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinMsgReply_1110) {
                const replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Levin, I just received your message. Due to internet issues...</div></div>`;
                const msgTextReply = "Hello Muzaffar, I understand. I have found a suitable place for you. It is the dispatch department of US truck companies in Tashkent. Everything you need will be prepared for you by 10:00 PM through our partner truck company. I apologize that I couldn't postpone the interview date; it is the management's requirement, so it was impossible. The address you need to go to is: 10, 1st Mukimi Passage, Yakkasaray District, Tashkent, Uzbekistan. When you get there, they will contact you at 9:45 PM. Please give me your local mobile number in Uzbekistan, and I will pass it on to them so they can reach you.";
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgReply_1110,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML}<div class="msg-text" style="white-space: pre-wrap;">${msgTextReply}</div><div class="msg-time-container">20:39</div></div></div>`
                });
            }

            if (now >= levinMsgConfirm_1110) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgConfirm_1110,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Done, I have provided your number. They will contact you at 9:45 PM.</div><div class="msg-time-container">20:43</div></div></div>`
                });
            }

            // YANGI QO'SHILGAN SUHBAT QISMI (21:11 - 21:13)
            if (now >= levinMsgTimeUser_2111) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgTimeUser_2111,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">Mr. Hart, I am at the location. Waiting for your call.</div><div class="msg-time-container">21:11 ${readTicksHTML}</div></div></div>`
                });
            }

            if (now >= levinCallStart_2111) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCallStart_2111,
                    html: `<div class="system-msg-container"><div class="system-msg"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg> Video meeting started - 21:11</div></div>`
                });
            }

            if (now >= levinCallEnd_2113) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'system',
                    timestamp: levinCallEnd_2113,
                    html: `<div class="system-msg-container"><div class="system-msg" style="background: rgba(234,67,53,0.1); color: #ea4335;"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px;margin-bottom:2px;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg> Video meeting ended (2 mins) - 21:13</div></div>`
                });
            }

            if (now >= levinMsgTimeReply_2113) {
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgTimeReply_2113,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Perfect, the environment is secure. We are ready to proceed. The dispatch team is preparing the system.</div><div class="msg-time-container">21:13</div></div></div>`
                });
            }

            // 13.10.2026 23:04 (Muzaffar -> Levin Hart)
            if (now >= levinMsgUser_1310) {
                const msgTextUser1310 = `Hello Mr. Hart,

Today I went to the embassy to collect my passport, but they returned it without stamping the visa. The reason given was that my workplace did not provide sufficient documents. The visa has not been canceled, but I need to get it by resubmitting complete documents tomorrow. Therefore, I wanted to pass along the documents they requested.

They stated that the embassy needs to receive the following via fax and in electronic format by tomorrow, as my resubmission time is October 14 at 02:00 California time:

A confirmation letter containing the full name and contact details of the person picking me up from the airport.

A complete breakdown of my annual salary shown in monthly, daily, weekly, and hourly increments, along with detailed information on how salary is distributed in force majeure situations, such as when I am unable to come to work.

The exact residential address—street, house number, postal code—and all information and documents regarding how apartment payments and arrangements are handled.

Please, Mr. Levin, could you also provide me with the details regarding the residential address (photos would be great too), and the information about the person coming to pick me up?`;
                levinHistory.push({
                    id: getNextId(),
                    type: 'sent',
                    timestamp: levinMsgUser_1310,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text" style="white-space: pre-wrap;">${msgTextUser1310}</div><div class="msg-time-container">23:04 ${readTicksHTML}</div></div></div>`
                });
            }

            // 14.10.2026 00:02 (Levin Hart -> Muzaffar)
            if (now >= levinMsgReply_1410) {
                const replyHTML1410 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. Hart, Today I went to the embassy to collect my passport...</div></div>`;
                const msgTextLevinReply1410 = "Yes Muzaffar, I understand you. We will send all the documents and information you requested to the embassy by tonight, so you can comfortably go and resubmit tomorrow.";
                levinHistory.push({
                    id: getNextId(),
                    type: 'received',
                    timestamp: levinMsgReply_1410,
                    html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML1410}<div class="msg-text" style="white-space: pre-wrap;">${msgTextLevinReply1410}</div><div class="msg-time-container">00:02</div></div></div>`
                });
            }

            return levinHistory;
        }

        function formatDateSeparator(timestamp) {
            const date = new Date(timestamp); 
            const today = new Date(); 
            const yesterday = new Date(); 
            yesterday.setDate(yesterday.getDate() - 1);

            const isSameDay = (d1, d2) => d1.getDate() === d2.getDate() && d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

            if (isSameDay(date, today)) return "Today";
            if (isSameDay(date, yesterday)) return "Yesterday";

            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            return `${months[date.getMonth()]} ${date.getDate()}`;
        }

        function updateSidebarPreview() {
            // James
            if (chatHistories.james && chatHistories.james.length > 0) {
                const lastMsg = chatHistories.james[chatHistories.james.length - 1];
                const tcTime = document.getElementById('jamesLastMsgTime') || document.querySelector('#tc-item-james .tc-time');
                const tcPreview = document.getElementById('jamesLastMsgPreview') || document.querySelector('#tc-item-james .tc-msg-preview');
                
                if (tcTime && tcPreview) {
                    const date = new Date(lastMsg.timestamp);
                    tcTime.innerText = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    
                    const tempDiv = document.createElement('div'); 
                    tempDiv.innerHTML = lastMsg.html;
                    let previewText = "Message";
                    
                    if(lastMsg.isDeleted) {
                        previewText = "Auto-deleted after 7 days...";
                    } else {
                        const msgTextDiv = tempDiv.querySelector('.msg-text');
                        const fileDiv = tempDiv.querySelector('.file-name');
                        const systemDiv = tempDiv.querySelector('.system-msg');
                        const hasAlbum = !!tempDiv.querySelector('.chat-album-grid');
                        const hasImg = hasAlbum || !!tempDiv.querySelector('.chat-img-attachment');
                        const hasVid = !!tempDiv.querySelector('.chat-video-attachment');
                        const hasVoice = !!tempDiv.querySelector('.voice-msg-player');
                        const captionStr = (msgTextDiv && msgTextDiv.innerText) ? msgTextDiv.innerText.trim() : "";
                        if (hasImg) previewText = captionStr ? ("📷 " + captionStr) : "📷 Photo";
                        else if (hasVid) previewText = captionStr ? ("🎥 " + captionStr) : "🎥 Video";
                        else if (hasVoice) previewText = captionStr ? ("🎤 " + captionStr) : "🎤 Voice message";
                        else if (fileDiv && fileDiv.innerText) previewText = "📄 " + fileDiv.innerText.trim() + (captionStr ? (" — " + captionStr) : "");
                        else if (captionStr) previewText = captionStr;
                        else if (systemDiv && systemDiv.innerText) previewText = systemDiv.innerText; 
                    }
                    
                    if(previewText.length > 35) previewText = previewText.substring(0, 35) + "...";
                    tcPreview.innerText = previewText;
                    
                    const jamesItem = document.getElementById('tc-item-james');
                    if(jamesItem) jamesItem.setAttribute('data-timestamp', lastMsg.timestamp);
                }
            }

            // Rowan
            if (chatHistories.rowan && chatHistories.rowan.length > 0) {
                const lastMsg = chatHistories.rowan[chatHistories.rowan.length - 1];
                const tcTime = document.getElementById('rowanLastMsgTime');
                const tcPreview = document.getElementById('rowanLastMsgPreview');
                
                if (tcTime && tcPreview) {
                    const date = new Date(lastMsg.timestamp);
                    tcTime.innerText = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    
                    const tempDiv = document.createElement('div'); 
                    tempDiv.innerHTML = lastMsg.html;
                    let previewText = "Message";
                    
                    if(lastMsg.isDeleted) {
                        previewText = "Auto-deleted after 7 days...";
                    } else {
                        const msgTextDiv = tempDiv.querySelector('.msg-text');
                        const fileDiv = tempDiv.querySelector('.file-name');
                        const systemDiv = tempDiv.querySelector('.system-msg');
                        const hasAlbum = !!tempDiv.querySelector('.chat-album-grid');
                        const hasImg = hasAlbum || !!tempDiv.querySelector('.chat-img-attachment');
                        const hasVid = !!tempDiv.querySelector('.chat-video-attachment');
                        const hasVoice = !!tempDiv.querySelector('.voice-msg-player');
                        const captionStr = (msgTextDiv && msgTextDiv.innerText) ? msgTextDiv.innerText.trim() : "";
                        if (hasImg) previewText = captionStr ? ("📷 " + captionStr) : "📷 Photo";
                        else if (hasVid) previewText = captionStr ? ("🎥 " + captionStr) : "🎥 Video";
                        else if (hasVoice) previewText = captionStr ? ("🎤 " + captionStr) : "🎤 Voice message";
                        else if (fileDiv && fileDiv.innerText) previewText = "📄 " + fileDiv.innerText.trim() + (captionStr ? (" — " + captionStr) : "");
                        else if (captionStr) previewText = captionStr;
                        else if (systemDiv && systemDiv.innerText) previewText = systemDiv.innerText; 
                    }
                    
                    if(previewText.length > 35) previewText = previewText.substring(0, 35) + "...";
                    tcPreview.innerText = previewText;

                    const rowanItem = document.getElementById('tc-item-rowan');
                    if(rowanItem) rowanItem.setAttribute('data-timestamp', lastMsg.timestamp);
                }
            }

            // Andreas
            if (chatHistories.andreas && chatHistories.andreas.length > 0) {
                const lastMsg = chatHistories.andreas[chatHistories.andreas.length - 1];
                const tcTime = document.getElementById('andreasLastMsgTime') || document.querySelector('#tc-item-andreas .tc-time');
                const tcPreview = document.getElementById('andreasLastMsgPreview') || document.querySelector('#tc-item-andreas .tc-msg-preview');
                
                if (tcTime && tcPreview) {
                    const date = new Date(lastMsg.timestamp);
                    tcTime.innerText = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    
                    const tempDiv = document.createElement('div'); 
                    tempDiv.innerHTML = lastMsg.html;
                    let previewText = "Message";
                    
                    if(lastMsg.isDeleted) {
                        previewText = "Auto-deleted after 7 days...";
                    } else {
                        const msgTextDiv = tempDiv.querySelector('.msg-text');
                        const fileDiv = tempDiv.querySelector('.file-name');
                        const systemDiv = tempDiv.querySelector('.system-msg');
                        const hasAlbum = !!tempDiv.querySelector('.chat-album-grid');
                        const hasImg = hasAlbum || !!tempDiv.querySelector('.chat-img-attachment');
                        const hasVid = !!tempDiv.querySelector('.chat-video-attachment');
                        const hasVoice = !!tempDiv.querySelector('.voice-msg-player');
                        const captionStr = (msgTextDiv && msgTextDiv.innerText) ? msgTextDiv.innerText.trim() : "";
                        if (hasImg) previewText = captionStr ? ("📷 " + captionStr) : "📷 Photo";
                        else if (hasVid) previewText = captionStr ? ("🎥 " + captionStr) : "🎥 Video";
                        else if (hasVoice) previewText = captionStr ? ("🎤 " + captionStr) : "🎤 Voice message";
                        else if (fileDiv && fileDiv.innerText) previewText = "📄 " + fileDiv.innerText.trim() + (captionStr ? (" — " + captionStr) : "");
                        else if (captionStr) previewText = captionStr;
                        else if (systemDiv && systemDiv.innerText) previewText = systemDiv.innerText; 
                    }
                    
                    if(previewText.length > 35) previewText = previewText.substring(0, 35) + "...";
                    tcPreview.innerText = previewText;

                    const andreasItem = document.getElementById('tc-item-andreas');
                    if(andreasItem) andreasItem.setAttribute('data-timestamp', lastMsg.timestamp);
                }
            }

            // Levin
            if (chatHistories.levin && chatHistories.levin.length > 0) {
                const lastMsg = chatHistories.levin[chatHistories.levin.length - 1];
                const tcTime = document.getElementById('levinLastMsgTime');
                const tcPreview = document.getElementById('levinLastMsgPreview');
                
                if (tcTime && tcPreview) {
                    const date = new Date(lastMsg.timestamp);
                    tcTime.innerText = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
                    
                    const tempDiv = document.createElement('div'); 
                    tempDiv.innerHTML = lastMsg.html;
                    let previewText = "Message";
                    
                    if(lastMsg.isDeleted) {
                        previewText = "Auto-deleted after 7 days...";
                    } else {
                        const msgTextDiv = tempDiv.querySelector('.msg-text');
                        const fileDiv = tempDiv.querySelector('.file-name');
                        const systemDiv = tempDiv.querySelector('.system-msg');
                        const hasAlbum = !!tempDiv.querySelector('.chat-album-grid');
                        const hasImg = hasAlbum || !!tempDiv.querySelector('.chat-img-attachment');
                        const hasVid = !!tempDiv.querySelector('.chat-video-attachment');
                        const hasVoice = !!tempDiv.querySelector('.voice-msg-player');
                        const captionStr = (msgTextDiv && msgTextDiv.innerText) ? msgTextDiv.innerText.trim() : "";
                        if (hasImg) previewText = captionStr ? ("📷 " + captionStr) : "📷 Photo";
                        else if (hasVid) previewText = captionStr ? ("🎥 " + captionStr) : "🎥 Video";
                        else if (hasVoice) previewText = captionStr ? ("🎤 " + captionStr) : "🎤 Voice message";
                        else if (fileDiv && fileDiv.innerText) previewText = "📄 " + fileDiv.innerText.trim() + (captionStr ? (" — " + captionStr) : "");
                        else if (captionStr) previewText = captionStr;
                        else if (systemDiv && systemDiv.innerText) previewText = systemDiv.innerText; 
                    }
                    
                    if(previewText.length > 35) previewText = previewText.substring(0, 35) + "...";
                    tcPreview.innerText = previewText;

                    const levinItem = document.getElementById('tc-item-levin');
                    if(levinItem) levinItem.setAttribute('data-timestamp', lastMsg.timestamp);
                }
            }
            
            sortChatList();
        }

        function renderMsgObj(msgObj, container, person) {
            const dateStr = formatDateSeparator(msgObj.timestamp);
            let targetSepVar = "";
            if (person === 'rowan') targetSepVar = lastDateSeparatorRowan;
            else if (person === 'andreas') targetSepVar = lastDateSeparatorAndreas;
            else if (person === 'levin') targetSepVar = lastDateSeparatorLevin;
            else targetSepVar = lastDateSeparatorJames;
            
            if (dateStr !== targetSepVar) {
                const sep = document.createElement('div'); 
                sep.className = 'chat-date-separator'; 
                sep.innerHTML = `<span>${dateStr}</span>`;
                container.appendChild(sep); 
                if (person === 'rowan') lastDateSeparatorRowan = dateStr;
                else if (person === 'andreas') lastDateSeparatorAndreas = dateStr;
                else if (person === 'levin') lastDateSeparatorLevin = dateStr;
                else lastDateSeparatorJames = dateStr;
            }
            const div = document.createElement('div'); 
            div.className = `message-row ${msgObj.type}`; 
            div.id = msgObj.id; 
            div.innerHTML = msgObj.html;
            container.appendChild(div);
        }

        function initChatStorage() {
            sharedChatContainer.innerHTML = ''; 
            if(rowanChatContainer) rowanChatContainer.innerHTML = '';
            if(andreasChatContainer) andreasChatContainer.innerHTML = '';
            if(levinChatContainer) levinChatContainer.innerHTML = '';
            lastDateSeparatorJames = "";
            lastDateSeparatorRowan = "";
            lastDateSeparatorAndreas = "";
            lastDateSeparatorLevin = "";

            setupSidebarItems();
            setupProfileSidebar();

            const freshHistories = {
                james: getInitialHistoryJames(),
                rowan: getInitialHistoryRowan(),
                andreas: getInitialHistoryAndreas(),
                levin: getInitialHistoryLevin(),
                owen: []
            };
            const customMsgs = JSON.parse(safeGetItem('zwUserCustomMsgs_v1') || '{"james":[],"rowan":[],"andreas":[],"levin":[],"owen":[]}');
            let savedData = JSON.parse(safeGetItem('zwChatData_v97'));
            if (!savedData || !savedData.james || !savedData.rowan || !savedData.andreas || !savedData.levin) {
                chatHistories = freshHistories;
            } else {
                chatHistories = {
                    james: savedData.james || [],
                    rowan: savedData.rowan || [],
                    andreas: savedData.andreas || [],
                    levin: savedData.levin || [],
                    owen: savedData.owen || []
                };
            }

            ['james', 'rowan', 'andreas', 'levin', 'owen'].forEach(person => {
                if (!chatHistories[person]) chatHistories[person] = [];
                const existingIds = new Set(chatHistories[person].map(m => m.id));
                const existingTimestamps = new Set(chatHistories[person].map(m => m.timestamp));

                (freshHistories[person] || []).forEach(m => {
                    if (!existingTimestamps.has(m.timestamp) && !deletedMessageIds.has(m.id) && !deletedMessageIds.has('ts-' + m.timestamp)) {
                        chatHistories[person].push(m);
                        existingTimestamps.add(m.timestamp);
                    }
                });

                (customMsgs[person] || []).forEach(m => {
                    if (!existingIds.has(m.id) && !existingTimestamps.has(m.timestamp) && !deletedMessageIds.has(m.id)) {
                        chatHistories[person].push(m);
                        existingIds.add(m.id);
                        existingTimestamps.add(m.timestamp);
                    }
                });

                chatHistories[person] = chatHistories[person].filter(m => {
                    return m.timestamp <= Date.now() && !deletedMessageIds.has(m.id) && !deletedMessageIds.has('ts-' + m.timestamp);
                });
                chatHistories[person].sort((a, b) => a.timestamp - b.timestamp);
            });

            chatHistories.james = applyAutoDelete(chatHistories.james);
            chatHistories.rowan = applyAutoDelete(chatHistories.rowan);
            chatHistories.andreas = applyAutoDelete(chatHistories.andreas);
            chatHistories.levin = applyAutoDelete(chatHistories.levin);

            safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
            
            chatHistories.james.forEach(m => renderMsgObj(m, sharedChatContainer, 'james'));
            chatHistories.rowan.forEach(m => renderMsgObj(m, rowanChatContainer, 'rowan'));
            chatHistories.andreas.forEach(m => renderMsgObj(m, andreasChatContainer, 'andreas'));
            chatHistories.levin.forEach(m => renderMsgObj(m, levinChatContainer, 'levin'));

            updateSidebarPreview();
            
            if (currentActiveChat === 'james') {
                sharedChatContainer.scrollTop = sharedChatContainer.scrollHeight;
            } else if (currentActiveChat === 'rowan') {
                if(rowanChatContainer) rowanChatContainer.scrollTop = rowanChatContainer.scrollHeight;
            } else if (currentActiveChat === 'andreas') {
                if(andreasChatContainer) andreasChatContainer.scrollTop = andreasChatContainer.scrollHeight;
            } else if (currentActiveChat === 'levin') {
                if(levinChatContainer) levinChatContainer.scrollTop = levinChatContainer.scrollHeight;
            }
        }

        function persistCustomMessage(msgObj, targetChat) {
            if (!targetChat) return;
            try {
                const customMsgs = JSON.parse(safeGetItem('zwUserCustomMsgs_v1') || '{"james":[],"rowan":[],"andreas":[],"levin":[],"owen":[]}');
                if (!customMsgs[targetChat]) customMsgs[targetChat] = [];
                const idx = customMsgs[targetChat].findIndex(m => m.id === msgObj.id || m.timestamp === msgObj.timestamp);
                if (idx >= 0) customMsgs[targetChat][idx] = msgObj;
                else customMsgs[targetChat].push(msgObj);
                safeSetItem('zwUserCustomMsgs_v1', JSON.stringify(customMsgs));
            } catch (e) {}
        }

        function rerenderSingleChatContainer(person) {
            let container = sharedChatContainer;
            if (person === 'rowan') container = rowanChatContainer;
            else if (person === 'andreas') container = andreasChatContainer;
            else if (person === 'levin') container = levinChatContainer;
            else if (person === 'owen') container = document.getElementById('owenChatContainer');
            if (!container) return;

            container.innerHTML = '';
            if (person === 'rowan') lastDateSeparatorRowan = "";
            else if (person === 'andreas') lastDateSeparatorAndreas = "";
            else if (person === 'levin') lastDateSeparatorLevin = "";
            else if (person === 'james') lastDateSeparatorJames = "";

            (chatHistories[person] || []).forEach(m => renderMsgObj(m, container, person));
            if (currentActiveChat === person) {
                container.scrollTop = container.scrollHeight;
            }
        }

        function saveAndRenderMessage(msgObj, targetChat = currentActiveChat, syncToApi = true) {
            if (!targetChat) return;
            if (!chatHistories[targetChat]) chatHistories[targetChat] = [];
            if (chatHistories[targetChat].some(m => m.id === msgObj.id)) return;

            persistCustomMessage(msgObj, targetChat);
            if (syncToApi && typeof pushUserMessageToApi === 'function' && !msgObj.fromBotApi) {
                pushUserMessageToApi(msgObj, targetChat);
            }

            if (targetChat === 'owen') {
                chatHistories.owen.push(msgObj);
                chatHistories.owen.sort((a, b) => a.timestamp - b.timestamp);
                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                const owenContainer = document.getElementById('owenChatContainer');
                if (owenContainer) {
                    owenContainer.style.justifyContent = 'flex-start';
                    rerenderSingleChatContainer('owen');
                }
                updateSidebarPreview();
                return;
            }

            if (targetChat === 'james') {
                chatHistories.james.push(msgObj);
                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                if (currentActiveChat === 'james') {
                    renderMsgObj(msgObj, sharedChatContainer, 'james'); 
                    sharedChatContainer.scrollTop = sharedChatContainer.scrollHeight;
                }
            } else if (targetChat === 'rowan') {
                chatHistories.rowan.push(msgObj);
                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                if (currentActiveChat === 'rowan') {
                    renderMsgObj(msgObj, rowanChatContainer, 'rowan'); 
                    rowanChatContainer.scrollTop = rowanChatContainer.scrollHeight;
                }
            } else if (targetChat === 'andreas') {
                chatHistories.andreas.push(msgObj);
                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                if (currentActiveChat === 'andreas') {
                    renderMsgObj(msgObj, andreasChatContainer, 'andreas'); 
                    andreasChatContainer.scrollTop = andreasChatContainer.scrollHeight;
                }
            } else if (targetChat === 'levin') {
                chatHistories.levin.push(msgObj);
                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                if (currentActiveChat === 'levin') {
                    renderMsgObj(msgObj, levinChatContainer, 'levin'); 
                    levinChatContainer.scrollTop = levinChatContainer.scrollHeight;
                }
            }
            updateSidebarPreview();
        }

        initChatStorage();

        // ==========================================
        // 8. AVTOMATLASHTIRILGAN SSENARIY 
        // ==========================================
        function startAutomatedScenario() {
            const now = Date.now();
            const y = 2026;
            const m = 9; // October is 9

            // Levin javob xabari - 09.10.2026, 21:48 (Agar ssenariy kutib turishi kerak bo'lsa)
            const levinMsgTimeReply_0910 = new Date(y, m, 9, 21, 48).getTime();
            if (now < levinMsgTimeReply_0910) {
                setTimeout(() => {
                    const replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. Hart, I visited the embassy today. They told me...</div></div>`;
                    const msg = {
                        id: getNextId(),
                        type: 'received',
                        timestamp: levinMsgTimeReply_0910,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML}<div class="msg-text" style="white-space: pre-wrap;">Hello Muzaffar, congratulations on successfully completing your interview. I understand the situation perfectly. We have come to an agreement with the management regarding this matter. You just need to book a ticket for a time that is convenient for you (no later than next week) and pay for the booking yourself (which will be around $20-$25). Send us the link to this ticket, and we will pay the rest of the amount. You just need to make the booking according to the requirements mentioned above.</div><div class="msg-time-container">21:48</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'levin');
                    sendPushNotification("Levin Hart", "Hello Muzaffar, congratulations on successfully completing your interview...");
                }, levinMsgTimeReply_0910 - now);
            }

            // Levin 20:39 dagi xabari (11.10.2026)
            const levinMsgReply_1110 = new Date(y, m, 11, 20, 39).getTime();
            if (now < levinMsgReply_1110) {
                setTimeout(() => {
                    const replyHTML = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Levin, I just received your message. Due to internet issues...</div></div>`;
                    const msgTextReply = "Hello Muzaffar, I understand. I have found a suitable place for you. It is the dispatch department of US truck companies in Tashkent. Everything you need will be prepared for you by 10:00 PM through our partner truck company. I apologize that I couldn't postpone the interview date; it is the management's requirement, so it was impossible. The address you need to go to is: 10, 1st Mukimi Passage, Yakkasaray District, Tashkent, Uzbekistan. When you get there, they will contact you at 9:45 PM. Please give me your local mobile number in Uzbekistan, and I will pass it on to them so they can reach you.";
                    const msg = {
                        id: getNextId(),
                        type: 'received',
                        timestamp: levinMsgReply_1110,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML}<div class="msg-text" style="white-space: pre-wrap;">${msgTextReply}</div><div class="msg-time-container">20:39</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'levin');
                    sendPushNotification("Levin Hart", "Hello Muzaffar, I understand. I have found a suitable place for you...");
                }, levinMsgReply_1110 - now);
            }

            // Levin 20:43 dagi xabari (11.10.2026)
            const levinMsgConfirm_1110 = new Date(y, m, 11, 20, 43).getTime();
            if (now < levinMsgConfirm_1110) {
                setTimeout(() => {
                    const msg = {
                        id: getNextId(),
                        type: 'received',
                        timestamp: levinMsgConfirm_1110,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div><div class="msg-text" style="white-space: pre-wrap;">Done, I have provided your number. They will contact you at 9:45 PM.</div><div class="msg-time-container">20:43</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'levin');
                    sendPushNotification("Levin Hart", "Done, I have provided your number. They will contact you at 9:45 PM.");
                }, levinMsgConfirm_1110 - now);
            }

            // Muzaffar -> James (13.10.2026, 10:11)
            const jamesMsgUser_1310 = new Date(y, m, 13, 10, 11).getTime();
            if (now < jamesMsgUser_1310) {
                setTimeout(() => {
                    const msgTextUser1310 = "Hello Mr. James, the bank on our end has asked for the UETR (GPI code) of the sent money. Could you please get that from the bank for us?";
                    const msg = {
                        id: getNextId(),
                        type: 'sent',
                        timestamp: jamesMsgUser_1310,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text">${msgTextUser1310}</div><div class="msg-time-container">10:11 ${readTicksHTML}</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'james');
                }, jamesMsgUser_1310 - now);
            }

            // Muzaffar -> Levin Hart (13.10.2026, 23:04)
            const levinMsgUser_1310 = new Date(y, m, 13, 23, 4).getTime();
            if (now < levinMsgUser_1310) {
                setTimeout(() => {
                    const msgTextUser1310 = `Hello Mr. Hart,

Today I went to the embassy to collect my passport, but they returned it without stamping the visa. The reason given was that my workplace did not provide sufficient documents. The visa has not been canceled, but I need to get it by resubmitting complete documents tomorrow. Therefore, I wanted to pass along the documents they requested.

They stated that the embassy needs to receive the following via fax and in electronic format by tomorrow, as my resubmission time is October 14 at 02:00 California time:

A confirmation letter containing the full name and contact details of the person picking me up from the airport.

A complete breakdown of my annual salary shown in monthly, daily, weekly, and hourly increments, along with detailed information on how salary is distributed in force majeure situations, such as when I am unable to come to work.

The exact residential address—street, house number, postal code—and all information and documents regarding how apartment payments and arrangements are handled.

Please, Mr. Levin, could you also provide me with the details regarding the residential address (photos would be great too), and the information about the person coming to pick me up?`;
                    const msg = {
                        id: getNextId(),
                        type: 'sent',
                        timestamp: levinMsgUser_1310,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-text" style="white-space: pre-wrap;">${msgTextUser1310}</div><div class="msg-time-container">23:04 ${readTicksHTML}</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'levin');
                }, levinMsgUser_1310 - now);
            }

            // Levin Hart -> Muzaffar (14.10.2026, 00:02) + Push va ovozli bildirishnoma
            const levinMsgReply_1410 = new Date(y, m, 14, 0, 2).getTime();
            if (now < levinMsgReply_1410) {
                setTimeout(() => {
                    const replyHTML1410 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. Hart, Today I went to the embassy to collect my passport...</div></div>`;
                    const msgTextLevinReply1410 = "Yes Muzaffar, I understand you. We will send all the documents and information you requested to the embassy by tonight, so you can comfortably go and resubmit tomorrow.";
                    const msg = {
                        id: getNextId(),
                        type: 'received',
                        timestamp: levinMsgReply_1410,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">Levin Hart</div>${replyHTML1410}<div class="msg-text" style="white-space: pre-wrap;">${msgTextLevinReply1410}</div><div class="msg-time-container">00:02</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'levin');
                    sendPushNotification("Levin Hart", msgTextLevinReply1410);
                }, levinMsgReply_1410 - now);
            }

            // James -> Muzaffar (14.10.2026, 00:13) + Push va ovozli bildirishnoma
            const jamesMsgReply_1410 = new Date(y, m, 14, 0, 13).getTime();
            if (now < jamesMsgReply_1410) {
                setTimeout(() => {
                    const replyHTML1410 = `<div class="reply-box" style="border-left: 3px solid var(--z-blue); background: rgba(11, 92, 255, 0.08); padding: 6px 10px; margin-bottom: 8px; border-radius: 4px; font-size: 12px; color: #555; cursor: pointer;"><div style="font-weight: 600; color: var(--z-blue); margin-bottom: 2px;">Muzaffar Rasulov</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Hello Mr. James, the bank on our end has asked for the UETR (GPI code)...</div></div>`;
                    const msgTextJamesReply1410 = "I have contacted BMO Bank, and as soon as they provide me with this information, I will send it to you.";
                    const msg = {
                        id: getNextId(),
                        type: 'received',
                        timestamp: jamesMsgReply_1410,
                        html: `<div class="message-wrapper"><div class="msg-bubble"><div class="msg-name" style="color:var(--z-blue);font-size:12px;margin-bottom:4px;font-weight:600;">James (Attorney)</div>${replyHTML1410}<div class="msg-text" style="white-space: pre-wrap;">${msgTextJamesReply1410}</div><div class="msg-time-container">00:13</div></div></div>`,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msg, 'james');
                    sendPushNotification("James (Attorney)", msgTextJamesReply1410);
                }, jamesMsgReply_1410 - now);
            }
        }


        // ==========================================
        // 9. TELEGRAM-STYLE CHAT ENGINE, VOICE HOLD/LOCK/STOP/REVIEW & MEETINGS HISTORY
        // ==========================================
        let voiceRecState = 'idle'; // 'idle' | 'holding' | 'locked' | 'stopped_review'
        let mediaRecorder = null;
        let audioChunks = [];
        let isRecordingVoice = false;
        let recStartTime = 0;
        let recDurationSec = 1;
        let recTimerInterval = null;
        let activeRecordingStream = null;
        let currentVoiceSource = 'tc';
        let pendingRecordedDataUrl = null;
        let micTouchStartY = 0;
        let micTouchStartX = 0;

        function injectTelegramChatUI() {
            if (!document.getElementById('tg3dBackdrop')) {
                const bd = document.createElement('div');
                bd.id = 'tg3dBackdrop';
                bd.onclick = () => close3DTouchMenu();
                document.body.appendChild(bd);
            }

            const cm = document.getElementById('contextMenu');
            if (cm) {
                cm.innerHTML = `
                    <div class="context-item" id="cmReply" onclick="triggerReply()">
                        <svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
                        <span>Reply</span>
                    </div>
                    <div class="context-item" id="cmCopy" onclick="triggerCopy()">
                        <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        <span>Copy</span>
                    </div>
                    <div class="context-item" id="cmEdit" onclick="triggerEdit()">
                        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                        <span>Edit</span>
                    </div>
                    <div class="context-item" id="cmForward" onclick="triggerForward()">
                        <svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
                        <span>Forward</span>
                    </div>
                    <div class="context-item" id="cmSelect" onclick="triggerSelect()">
                        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                        <span>Select</span>
                    </div>
                    <div class="context-item danger" id="cmDelete" onclick="openDeleteModal()">
                        <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        <span id="cmDeleteText">Delete</span>
                    </div>
                `;
            }

            const tcChatHeader = document.querySelector('.tc-chat-header');
            if (tcChatHeader && !document.getElementById('tcMobileBackBtn')) {
                const backBtn = document.createElement('button');
                backBtn.id = 'tcMobileBackBtn';
                backBtn.title = 'Back to chats';
                backBtn.onclick = (e) => { e.stopPropagation(); closeMobileChat(); };
                backBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`;
                tcChatHeader.insertBefore(backBtn, tcChatHeader.firstChild);
            }

            const tcMain = document.querySelector('.tc-main');
            if (tcMain && !document.getElementById('selectionToolbar')) {
                const selBar = document.createElement('div');
                selBar.id = 'selectionToolbar';
                selBar.innerHTML = `
                    <div class="sel-left">
                        <button class="sel-close-btn" onclick="clearSelection()" title="Cancel selection">
                            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </button>
                        <span id="selectionCount">0 selected</span>
                    </div>
                    <div class="sel-actions">
                        <button class="sel-action-btn forward" onclick="openForwardModalFromSelection()">
                            <svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
                            Forward
                        </button>
                        <button class="sel-action-btn delete" onclick="openDeleteModal()">
                            <svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            Delete
                        </button>
                    </div>
                `;
                tcMain.insertBefore(selBar, tcMain.firstChild);
            }

            const tcInputWrapper = document.getElementById('tcInputWrapper');
            if (tcInputWrapper && !document.getElementById('tcActionPreviewBar')) {
                const previewBar = document.createElement('div');
                previewBar.id = 'tcActionPreviewBar';
                previewBar.className = 'chat-action-preview-bar';
                previewBar.innerHTML = `
                    <div class="cap-icon" id="tcCapIcon"></div>
                    <div class="cap-content">
                        <div class="cap-title" id="tcCapTitle"></div>
                        <div class="cap-text" id="tcCapText"></div>
                    </div>
                    <button class="cap-close" onclick="cancelChatActionBar()">
                        <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                `;
                tcInputWrapper.insertBefore(previewBar, tcInputWrapper.firstChild);

                const floatCtrl = document.createElement('div');
                floatCtrl.id = 'voiceFloatingControl';
                tcInputWrapper.appendChild(floatCtrl);

                const inputArea = tcInputWrapper.querySelector('.chat-input-area');
                if (inputArea) {
                    const attachBtn = inputArea.querySelector('.attach-btn');
                    if (attachBtn) {
                        attachBtn.onclick = (e) => { e.stopPropagation(); openAttachMenu(e, 'tc'); };
                    }
                    const micBtn = document.createElement('button');
                    micBtn.className = 'voice-rec-btn';
                    micBtn.id = 'tcVoiceRecBtn';
                    micBtn.title = 'Hold to record, swipe up to lock';
                    micBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>`;
                    inputArea.appendChild(micBtn);
                    bindMicHoldAndSwipeGesture(micBtn);
                }

                const recOverlay = document.createElement('div');
                recOverlay.id = 'tcVoiceRecOverlay';
                recOverlay.className = 'voice-recording-overlay';
                tcInputWrapper.appendChild(recOverlay);
            }

            if (!document.getElementById('galleryInput')) {
                const galInput = document.createElement('input');
                galInput.type = 'file';
                galInput.id = 'galleryInput';
                galInput.accept = 'image/*,video/*';
                galInput.multiple = true;
                galInput.style.display = 'none';
                galInput.onchange = (e) => handleFileUpload(e);
                document.body.appendChild(galInput);
            }
            const existingFileInput = document.getElementById('fileInput');
            if (existingFileInput) {
                existingFileInput.multiple = true;
                existingFileInput.onchange = (e) => handleFileUpload(e);
            }

            if (!document.getElementById('attachMenuPopover')) {
                const pop = document.createElement('div');
                pop.id = 'attachMenuPopover';
                pop.innerHTML = `
                    <div class="attach-menu-item" onclick="triggerGalleryUpload()">
                        <div class="attach-menu-icon" style="background:#3b82f6;">
                            <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                        </div>
                        <div>
                            <div style="font-weight:600;">Photo or Video</div>
                            <div style="font-size:11px; color:#64748b;">From gallery</div>
                        </div>
                    </div>
                    <div class="attach-menu-item" onclick="triggerDocumentUpload()">
                        <div class="attach-menu-icon" style="background:#8b5cf6;">
                            <svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div>
                            <div style="font-weight:600;">File / Document</div>
                            <div style="font-size:11px; color:#64748b;">PDF, Word, ZIP, Audio...</div>
                        </div>
                    </div>
                `;
                document.body.appendChild(pop);
            }

            if (!document.getElementById('forwardModal')) {
                const fm = document.createElement('div');
                fm.id = 'forwardModal';
                fm.onclick = () => closeModal('forwardModal');
                fm.innerHTML = `
                    <div class="forward-dialog" onclick="event.stopPropagation()">
                        <div class="forward-header">
                            <span>Forward to...</span>
                            <span style="cursor:pointer; color:#64748b; font-size:20px;" onclick="closeModal('forwardModal')">&times;</span>
                        </div>
                        <div class="forward-list">
                            <div class="forward-contact-item" onclick="forwardMessagesTo('james')">
                                <div class="tc-avatar la" style="width:40px;height:40px;font-size:14px;">LA</div>
                                <div>
                                    <div class="forward-contact-name">James (Attorney)</div>
                                    <div class="forward-contact-role">Corporate Attorney</div>
                                </div>
                            </div>
                            <div class="forward-contact-item" onclick="forwardMessagesTo('rowan')">
                                <div class="tc-avatar" style="width:40px;height:40px;overflow:hidden;"><img src="src/rwn.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerText='RW'"></div>
                                <div>
                                    <div class="forward-contact-name">Rowan</div>
                                    <div class="forward-contact-role">HR Manager</div>
                                </div>
                            </div>
                            <div class="forward-contact-item" onclick="forwardMessagesTo('levin')">
                                <div class="tc-avatar" style="width:40px;height:40px;overflow:hidden;"><img src="src/lew.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerText='LH'"></div>
                                <div>
                                    <div class="forward-contact-name">Levin Hart</div>
                                    <div class="forward-contact-role">Immigration Lawyer</div>
                                </div>
                            </div>
                            <div class="forward-contact-item" onclick="forwardMessagesTo('andreas')">
                                <div class="tc-avatar" style="width:40px;height:40px;overflow:hidden;"><img src="src/and.jpg" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerText='AW'"></div>
                                <div>
                                    <div class="forward-contact-name">Andreas Waibel</div>
                                    <div class="forward-contact-role">Finance Director</div>
                                </div>
                            </div>
                            <div class="forward-contact-item" onclick="forwardMessagesTo('owen')">
                                <div class="tc-avatar ob" style="width:40px;height:40px;font-size:14px;">OB</div>
                                <div>
                                    <div class="forward-contact-name">Judge Owen</div>
                                    <div class="forward-contact-role">Federal Judge</div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(fm);
            }
        }

        // ==========================================
        // MEETINGS HISTORY TAB (ONLY IN MEETINGS SECTION, NOT ON HOME SCREEN)
        // ==========================================
        let currentMeetingsFilter = 'all';

        function getAllMeetingsList() {
            const y = 2026;
            const allMeetings = [
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 10, 11, 52).getTime(), dateStr: 'Sep 10, 2026', timeRange: '11:52 – 12:09', durationMins: 17, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 10, 20, 37).getTime(), dateStr: 'Sep 10, 2026', timeRange: '20:37', durationMins: 0, status: 'missed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 11, 4, 11).getTime(), dateStr: 'Sep 11, 2026', timeRange: '04:11 – 04:33', durationMins: 22, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 11, 12, 14).getTime(), dateStr: 'Sep 11, 2026', timeRange: '12:14 – 12:26', durationMins: 12, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 16, 16, 37).getTime(), dateStr: 'Sep 16, 2026', timeRange: '16:37 & 16:39', durationMins: 0, status: 'missed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 16, 16, 50).getTime(), dateStr: 'Sep 16, 2026', timeRange: '16:50 – 16:56', durationMins: 6, status: 'completed' },
                { person: 'rowan', name: 'Rowan', role: 'HR Manager • Human Resources', avatarType: 'img', avatarSrc: 'src/rwn.jpg', avatarText: 'RW', timestamp: new Date(y, 8, 17, 2, 46).getTime(), dateStr: 'Sep 17, 2026', timeRange: '02:46 – 02:52', durationMins: 6, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 17, 11, 2).getTime(), dateStr: 'Sep 17, 2026', timeRange: '11:02 – 11:38', durationMins: 36, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 18, 10, 57).getTime(), dateStr: 'Sep 18, 2026', timeRange: '10:57 – 11:05', durationMins: 8, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 18, 13, 41).getTime(), dateStr: 'Sep 18, 2026', timeRange: '13:41 – 13:50', durationMins: 9, status: 'completed' },
                { person: 'andreas', name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW', timestamp: new Date(y, 8, 18, 16, 11).getTime(), dateStr: 'Sep 18, 2026', timeRange: '16:11 – 16:43', durationMins: 32, status: 'completed' },
                { person: 'andreas', name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW', timestamp: new Date(y, 8, 18, 20, 48).getTime(), dateStr: 'Sep 18, 2026', timeRange: '20:48 – 20:52', durationMins: 4, status: 'completed' },
                { person: 'andreas', name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW', timestamp: new Date(y, 8, 19, 11, 29).getTime(), dateStr: 'Sep 19, 2026', timeRange: '11:29 – 11:33', durationMins: 4, status: 'completed' },
                { person: 'andreas', name: 'Andreas Waibel', role: 'Finance Director • LBBW Stuttgart', avatarType: 'img', avatarSrc: 'src/and.jpg', avatarText: 'AW', timestamp: new Date(y, 8, 19, 14, 27).getTime(), dateStr: 'Sep 19, 2026', timeRange: '14:27 – 14:31', durationMins: 4, status: 'completed' },
                { person: 'rowan', name: 'Rowan', role: 'HR Manager • Human Resources', avatarType: 'img', avatarSrc: 'src/rwn.jpg', avatarText: 'RW', timestamp: new Date(y, 8, 20, 0, 55).getTime(), dateStr: 'Sep 20, 2026', timeRange: '00:55 – 01:07', durationMins: 12, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 24, 3, 18).getTime(), dateStr: 'Sep 24, 2026', timeRange: '03:18 – 03:23', durationMins: 5, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 25, 1, 57).getTime(), dateStr: 'Sep 25, 2026', timeRange: '01:57 – 02:11', durationMins: 14, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 8, 25, 2, 15).getTime(), dateStr: 'Sep 25, 2026', timeRange: '02:15 – 02:33', durationMins: 18, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 8, 29, 1, 38).getTime(), dateStr: 'Sep 29, 2026', timeRange: '01:38 – 01:51', durationMins: 13, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 29, 2, 1).getTime(), dateStr: 'Sep 29, 2026', timeRange: '02:01 – 02:09', durationMins: 8, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 8, 30, 0, 29).getTime(), dateStr: 'Sep 30, 2026', timeRange: '00:29 – 00:37', durationMins: 8, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 8, 30, 2, 7).getTime(), dateStr: 'Sep 30, 2026', timeRange: '02:07 – 02:33', durationMins: 26, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 1, 3, 1).getTime(), dateStr: 'Oct 1, 2026', timeRange: '03:01 – 03:27', durationMins: 26, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 3, 3, 25).getTime(), dateStr: 'Oct 3, 2026', timeRange: '03:25 – 03:26', durationMins: 1, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 3, 4, 1).getTime(), dateStr: 'Oct 3, 2026', timeRange: '04:01 – 04:17', durationMins: 16, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 9, 5, 21, 31).getTime(), dateStr: 'Oct 5, 2026', timeRange: '21:31 – 21:47', durationMins: 16, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 6, 2, 19).getTime(), dateStr: 'Oct 6, 2026', timeRange: '02:19 – 02:26', durationMins: 7, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 9, 6, 3, 2).getTime(), dateStr: 'Oct 6, 2026', timeRange: '03:02 – 03:16', durationMins: 14, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 7, 2, 3).getTime(), dateStr: 'Oct 7, 2026', timeRange: '02:03 – 02:37', durationMins: 34, status: 'completed' },
                { person: 'levin', name: 'Levin Hart', role: 'Immigration Lawyer • Symphony Is LLC', avatarType: 'img', avatarSrc: 'src/lew.jpg', avatarText: 'LH', timestamp: new Date(y, 9, 11, 21, 11, 30).getTime(), dateStr: 'Oct 11, 2026', timeRange: '21:11 – 21:13', durationMins: 2, status: 'completed' },
                { person: 'james', name: 'James (Attorney)', role: 'Corporate Attorney • Legal & Compliance', avatarType: 'la', avatarText: 'LA', timestamp: new Date(y, 9, 14, 4, 34).getTime(), dateStr: 'Oct 14, 2026', timeRange: '04:34 – 04:43', durationMins: 9, status: 'completed' }
            ];
            const now = Date.now();
            const merged = [...allMeetings];
            const existingKeys = new Set(allMeetings.map(m => m.person + '-' + m.timestamp));
            (customMeetingsLog || []).forEach(cm => {
                const key = cm.person + '-' + cm.timestamp;
                if (!existingKeys.has(key)) {
                    merged.push(cm);
                    existingKeys.add(key);
                }
            });
            return merged.filter(m => m.timestamp <= now).sort((a, b) => b.timestamp - a.timestamp);
        }

        function setMeetingsFilter(filter) {
            currentMeetingsFilter = filter;
            renderMeetingsHistory();
        }

        function openChatFromMeetings(person) {
            switchTab('chat');
            switchDirectChat(person);
        }

        function renderMeetingsHistory() {
            const container = document.getElementById('meetingsTabContent');
            if (!container) return;

            const all = getAllMeetingsList();
            const completedMeetings = all.filter(m => m.status === 'completed');
            const totalMins = completedMeetings.reduce((acc, m) => acc + m.durationMins, 0);
            const hrs = Math.floor(totalMins / 60);
            const mins = totalMins % 60;

            const filtered = currentMeetingsFilter === 'all'
                ? all
                : all.filter(m => m.person === currentMeetingsFilter);

            const perPersonStats = {
                james: completedMeetings.filter(m => m.person === 'james').reduce((a, b) => a + b.durationMins, 0),
                levin: completedMeetings.filter(m => m.person === 'levin').reduce((a, b) => a + b.durationMins, 0),
                andreas: completedMeetings.filter(m => m.person === 'andreas').reduce((a, b) => a + b.durationMins, 0),
                rowan: completedMeetings.filter(m => m.person === 'rowan').reduce((a, b) => a + b.durationMins, 0)
            };

            const cardsHtml = filtered.map(m => {
                const avatarHtml = m.avatarType === 'img'
                    ? `<div class="tc-avatar" style="width:44px;height:44px;overflow:hidden;background:#e2e8f0;"><img src="${m.avatarSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.parentElement.innerText='${m.avatarText}'"></div>`
                    : `<div class="tc-avatar la" style="width:44px;height:44px;font-size:15px;">${m.avatarText}</div>`;

                const badgeHtml = m.status === 'missed'
                    ? `<span class="m-dur-badge missed">Missed call</span>`
                    : `<span class="m-dur-badge">${m.durationMins} min${m.durationMins > 1 ? 's' : ''}</span>`;

                return `
                    <div class="m-card">
                        <div class="m-card-left">
                            ${avatarHtml}
                            <div class="m-card-info">
                                <div class="m-card-name">${m.name}</div>
                                <div class="m-card-role">${m.role}</div>
                                <div class="m-card-time">
                                    <span>📅 ${m.dateStr}</span>
                                    <span>•</span>
                                    <span>🕒 ${m.timeRange}</span>
                                </div>
                            </div>
                        </div>
                        <div class="m-card-right">
                            ${badgeHtml}
                            <button class="m-chat-jump-btn" onclick="openChatFromMeetings('${m.person}')">Open Chat</button>
                        </div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="meetings-page-wrap">
                    <div class="meetings-top-header">
                        <div>
                            <div class="meetings-title">Meetings History</div>
                            <div style="font-size:13px; color:#64748b; margin-top:2px;">All recorded video meetings and call durations</div>
                        </div>
                    </div>

                    <div class="meetings-stats-grid">
                        <div class="m-stat-card">
                            <div class="m-stat-val">${completedMeetings.length}</div>
                            <div class="m-stat-label">Completed Calls</div>
                        </div>
                        <div class="m-stat-card">
                            <div class="m-stat-val">${totalMins}m</div>
                            <div class="m-stat-label">Total Time (${hrs}h ${mins}m)</div>
                        </div>
                        <div class="m-stat-card">
                            <div class="m-stat-val">4</div>
                            <div class="m-stat-label">Participants</div>
                        </div>
                    </div>

                    <div class="meetings-filter-bar">
                        <button class="m-filter-pill ${currentMeetingsFilter === 'all' ? 'active' : ''}" onclick="setMeetingsFilter('all')">All (${all.length})</button>
                        <button class="m-filter-pill ${currentMeetingsFilter === 'james' ? 'active' : ''}" onclick="setMeetingsFilter('james')">James (${perPersonStats.james}m)</button>
                        <button class="m-filter-pill ${currentMeetingsFilter === 'levin' ? 'active' : ''}" onclick="setMeetingsFilter('levin')">Levin Hart (${perPersonStats.levin}m)</button>
                        <button class="m-filter-pill ${currentMeetingsFilter === 'andreas' ? 'active' : ''}" onclick="setMeetingsFilter('andreas')">Andreas (${perPersonStats.andreas}m)</button>
                        <button class="m-filter-pill ${currentMeetingsFilter === 'rowan' ? 'active' : ''}" onclick="setMeetingsFilter('rowan')">Rowan (${perPersonStats.rowan}m)</button>
                    </div>

                    <div class="meetings-list-group">
                        ${cardsHtml}
                    </div>
                </div>
            `;
        }

        // ==========================================
        // VOICE MESSAGE HOLD-TO-RECORD, SWIPE-UP TO LOCK & STOP -> REVIEW
        // ==========================================
        function bindMicHoldAndSwipeGesture(micBtn) {
            if (!micBtn || micBtn.dataset.gestureBound === '1') return;
            micBtn.dataset.gestureBound = '1';

            micBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (voiceRecState !== 'idle') return;
                const t = e.touches[0];
                micTouchStartX = t.clientX;
                micTouchStartY = t.clientY;
                startVoiceRecordingHold('tc');
            }, { passive: false });

            window.addEventListener('touchmove', (e) => {
                if (voiceRecState !== 'holding') return;
                const t = e.touches[0];
                if (!t) return;
                const dy = t.clientY - micTouchStartY;
                const floatCtrl = document.getElementById('voiceFloatingControl');
                if (floatCtrl && dy < 0) {
                    floatCtrl.style.transform = `translateY(${Math.max(-45, dy * 0.45)}px)`;
                }
                if (dy <= -42) {
                    lockVoiceRecording();
                }
            }, { passive: true });

            const onTouchEndOrCancel = () => {
                if (voiceRecState === 'holding') {
                    finishAndSendVoiceRecording();
                }
            };
            window.addEventListener('touchend', onTouchEndOrCancel, { passive: true });
            window.addEventListener('touchcancel', onTouchEndOrCancel, { passive: true });

            let mouseHolding = false;
            micBtn.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || voiceRecState !== 'idle') return;
                e.preventDefault();
                mouseHolding = true;
                micTouchStartX = e.clientX;
                micTouchStartY = e.clientY;
                startVoiceRecordingHold('tc');
            });

            window.addEventListener('mousemove', (e) => {
                if (!mouseHolding || voiceRecState !== 'holding') return;
                const dy = e.clientY - micTouchStartY;
                const floatCtrl = document.getElementById('voiceFloatingControl');
                if (floatCtrl && dy < 0) {
                    floatCtrl.style.transform = `translateY(${Math.max(-45, dy * 0.45)}px)`;
                }
                if (dy <= -42) {
                    mouseHolding = false;
                    lockVoiceRecording();
                }
            });

            window.addEventListener('mouseup', () => {
                if (!mouseHolding) return;
                mouseHolding = false;
                if (voiceRecState === 'holding') {
                    finishAndSendVoiceRecording();
                }
            });
        }

        function renderFloatingVoiceControl() {
            const floatCtrl = document.getElementById('voiceFloatingControl');
            if (!floatCtrl) return;
            floatCtrl.style.transform = 'translateY(0)';

            if (voiceRecState === 'holding') {
                floatCtrl.className = 'active';
                floatCtrl.innerHTML = `
                    <div class="vf-lock-pill">
                        <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                        <span class="vf-arrow">▲</span>
                    </div>
                `;
            } else if (voiceRecState === 'locked') {
                floatCtrl.className = 'active';
                floatCtrl.innerHTML = `
                    <button class="vf-stop-btn" onclick="stopAndReviewVoiceRecording()" title="Stop recording">
                        <svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                    </button>
                `;
            } else {
                floatCtrl.className = '';
                floatCtrl.innerHTML = '';
            }
        }

        function renderVoiceOverlayBar() {
            const recOverlay = document.getElementById('tcVoiceRecOverlay');
            if (!recOverlay) return;

            recOverlay.classList.toggle('holding-mode', voiceRecState === 'holding');
            if (voiceRecState === 'holding') {
                recOverlay.classList.add('active');
                recOverlay.innerHTML = `
                    <div class="vrec-indicator">
                        <div class="vrec-dot"></div>
                        <span id="tcVoiceRecTimer">00:00</span>
                    </div>
                    <div class="vrec-slide-hint">
                        <span>⬆️ Swipe up to lock • Release to send</span>
                    </div>
                `;
            } else if (voiceRecState === 'locked') {
                recOverlay.classList.add('active');
                recOverlay.innerHTML = `
                    <div class="vrec-indicator">
                        <div class="vrec-dot"></div>
                        <span id="tcVoiceRecTimer">00:00</span>
                    </div>
                    <div class="vrec-wave-anim">
                        <span style="animation-delay:0.0s"></span>
                        <span style="animation-delay:0.15s"></span>
                        <span style="animation-delay:0.3s"></span>
                        <span style="animation-delay:0.1s"></span>
                        <span style="animation-delay:0.25s"></span>
                        <span style="animation-delay:0.4s"></span>
                        <span style="animation-delay:0.2s"></span>
                    </div>
                    <button class="vrec-cancel-btn" onclick="cancelVoiceRecording()">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Delete
                    </button>
                    <button class="send-btn" onclick="finishAndSendVoiceRecording()" title="Send voice message">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                `;
            } else if (voiceRecState === 'stopped_review') {
                recOverlay.classList.add('active');
                const previewPlayer = buildVoicePlayerHtml(pendingRecordedDataUrl || createFallbackWavDataUrl(recDurationSec), recDurationSec);
                recOverlay.innerHTML = `
                    <button class="vrec-cancel-btn" onclick="cancelVoiceRecording()" title="Delete recording">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                        Delete
                    </button>
                    <div class="vrec-preview-box">
                        ${previewPlayer}
                    </div>
                    <button class="send-btn" onclick="sendReviewedVoiceRecording()" title="Send voice message">
                        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                    </button>
                `;
            } else {
                recOverlay.classList.remove('active');
                recOverlay.innerHTML = '';
            }
        }

        async function startVoiceRecordingHold(source = 'tc') {
            if (voiceRecState !== 'idle') return;
            currentVoiceSource = source;
            voiceRecState = 'holding';
            isRecordingVoice = true;
            audioChunks = [];
            pendingRecordedDataUrl = null;
            recStartTime = Date.now();
            recDurationSec = 1;

            if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }

            const micBtn = document.getElementById('tcVoiceRecBtn');
            if (micBtn) micBtn.classList.add('recording-press');

            renderFloatingVoiceControl();
            renderVoiceOverlayBar();

            clearInterval(recTimerInterval);
            recTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
                recDurationSec = Math.max(1, elapsed);
                const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const s = (elapsed % 60).toString().padStart(2, '0');
                const timerEl = document.getElementById('tcVoiceRecTimer');
                if (timerEl) timerEl.innerText = `${m}:${s}`;
            }, 200);

            try {
                activeRecordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (voiceRecState === 'idle') {
                    activeRecordingStream.getTracks().forEach(t => t.stop());
                    activeRecordingStream = null;
                    return;
                }
                mediaRecorder = new MediaRecorder(activeRecordingStream);
                mediaRecorder.ondataavailable = (ev) => {
                    if (ev.data && ev.data.size > 0) audioChunks.push(ev.data);
                };
                mediaRecorder.start();
            } catch (err) {
                mediaRecorder = null;
            }
        }

        function lockVoiceRecording() {
            if (voiceRecState !== 'holding') return;
            voiceRecState = 'locked';
            if (navigator.vibrate) { try { navigator.vibrate(25); } catch (e) {} }

            const micBtn = document.getElementById('tcVoiceRecBtn');
            if (micBtn) micBtn.classList.remove('recording-press');

            const inputWrapper = document.getElementById('tcInputWrapper');
            const inputArea = inputWrapper ? inputWrapper.querySelector('.chat-input-area') : null;
            if (inputArea) inputArea.style.display = 'none';

            renderFloatingVoiceControl();
            renderVoiceOverlayBar();

            const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
            const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const s = (elapsed % 60).toString().padStart(2, '0');
            const timerEl = document.getElementById('tcVoiceRecTimer');
            if (timerEl) timerEl.innerText = `${m}:${s}`;
        }

        function stopAndReviewVoiceRecording() {
            if (voiceRecState !== 'locked') return;
            clearInterval(recTimerInterval);
            recDurationSec = Math.max(1, Math.round((Date.now() - recStartTime) / 1000));
            isRecordingVoice = false;

            if (activeRecordingStream) {
                activeRecordingStream.getTracks().forEach(t => t.stop());
                activeRecordingStream = null;
            }

            const transitionToReview = (dataUrl) => {
                pendingRecordedDataUrl = dataUrl;
                voiceRecState = 'stopped_review';
                renderFloatingVoiceControl();
                renderVoiceOverlayBar();
            };

            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.onstop = () => {
                    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    if (blob.size > 0) {
                        const reader = new FileReader();
                        reader.onloadend = () => transitionToReview(reader.result);
                        reader.readAsDataURL(blob);
                    } else {
                        transitionToReview(createFallbackWavDataUrl(recDurationSec));
                    }
                    mediaRecorder = null;
                };
                try { mediaRecorder.stop(); } catch (e) {
                    transitionToReview(createFallbackWavDataUrl(recDurationSec));
                }
            } else {
                transitionToReview(createFallbackWavDataUrl(recDurationSec));
            }
        }

        function sendReviewedVoiceRecording() {
            if (voiceRecState !== 'stopped_review') return;
            const dataUrl = pendingRecordedDataUrl || createFallbackWavDataUrl(recDurationSec);
            const dur = recDurationSec;
            resetVoiceRecToIdle();
            dispatchVoiceMessageToChat(dataUrl, dur);
        }

        function resetVoiceRecToIdle() {
            clearInterval(recTimerInterval);
            isRecordingVoice = false;
            voiceRecState = 'idle';
            pendingRecordedDataUrl = null;

            const micBtn = document.getElementById('tcVoiceRecBtn');
            if (micBtn) micBtn.classList.remove('recording-press');

            const inputWrapper = document.getElementById('tcInputWrapper');
            const inputArea = inputWrapper ? inputWrapper.querySelector('.chat-input-area') : null;
            if (inputArea) inputArea.style.display = 'flex';

            renderFloatingVoiceControl();
            renderVoiceOverlayBar();

            if (activeRecordingStream) {
                activeRecordingStream.getTracks().forEach(t => t.stop());
                activeRecordingStream = null;
            }
        }

        function cancelVoiceRecording() {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.onstop = null;
                try { mediaRecorder.stop(); } catch (e) {}
            }
            mediaRecorder = null;
            audioChunks = [];
            resetVoiceRecToIdle();
        }

        function dispatchVoiceMessageToChat(dataUrl, durationSec) {
            const replyHTML = buildReplyBoxHtml();
            const playerHtml = buildVoicePlayerHtml(dataUrl, durationSec);
            const html = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML}${playerHtml}<div class="msg-time-container">${getCurrentTime()} ${readTicksHTML}</div></div></div>`;
            const msgObj = {
                id: getNextId(),
                type: 'sent',
                timestamp: Date.now(),
                html: html,
                isDeleted: false
            };
            saveAndRenderMessage(msgObj);
            cancelChatActionBar();
        }

        function finishAndSendVoiceRecording() {
            if (voiceRecState === 'stopped_review') {
                sendReviewedVoiceRecording();
                return;
            }
            if (!isRecordingVoice) return;
            const durationSec = Math.max(1, Math.round((Date.now() - recStartTime) / 1000));

            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.onstop = () => {
                    resetVoiceRecToIdle();
                    const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                    if (blob.size > 0) {
                        const reader = new FileReader();
                        reader.onloadend = () => dispatchVoiceMessageToChat(reader.result, durationSec);
                        reader.readAsDataURL(blob);
                    } else {
                        dispatchVoiceMessageToChat(createFallbackWavDataUrl(durationSec), durationSec);
                    }
                    mediaRecorder = null;
                };
                try { mediaRecorder.stop(); } catch (e) {
                    resetVoiceRecToIdle();
                    dispatchVoiceMessageToChat(createFallbackWavDataUrl(durationSec), durationSec);
                }
            } else {
                resetVoiceRecToIdle();
                dispatchVoiceMessageToChat(createFallbackWavDataUrl(durationSec), durationSec);
            }
        }

        injectTelegramChatUI();
        renderMeetingsHistory();

        const tcInputEl = document.getElementById('tcChatInput');
        if (tcInputEl) {
            const syncOnKeyboard = () => {
                updateAppHeight();
                if (currentActiveChat === 'james' && sharedChatContainer) sharedChatContainer.scrollTop = sharedChatContainer.scrollHeight;
                else if (currentActiveChat === 'rowan' && rowanChatContainer) rowanChatContainer.scrollTop = rowanChatContainer.scrollHeight;
                else if (currentActiveChat === 'andreas' && andreasChatContainer) andreasChatContainer.scrollTop = andreasChatContainer.scrollHeight;
                else if (currentActiveChat === 'levin' && levinChatContainer) levinChatContainer.scrollTop = levinChatContainer.scrollHeight;
            };
            tcInputEl.addEventListener('focus', () => {
                setTimeout(syncOnKeyboard, 50);
                setTimeout(syncOnKeyboard, 250);
                setTimeout(syncOnKeyboard, 450);
            });
            tcInputEl.addEventListener('blur', () => {
                setTimeout(syncOnKeyboard, 50);
                setTimeout(syncOnKeyboard, 250);
            });
        }

        // ==========================================
        // 3D TOUCH MENU & SWIPE-TO-REPLY INTERACTIONS
        // ==========================================
        function open3DTouchMenu(row, clientX, clientY) {
            if (!row || row.classList.contains('system')) return;
            if (row.querySelector('.system-msg')) return;

            close3DTouchMenu();
            targetMessageRow = row;

            if (navigator.vibrate) {
                try { navigator.vibrate(20); } catch (e) {}
            }

            const bd = document.getElementById('tg3dBackdrop');
            if (bd) bd.classList.add('active');
            row.classList.add('tg-3d-active');

            const cm = document.getElementById('contextMenu');
            if (!cm) return;

            const isOwnMessage = row.classList.contains('sent');
            const hasText = !!row.querySelector('.msg-text');
            const editBtn = document.getElementById('cmEdit');
            if (editBtn) editBtn.style.display = (isOwnMessage && hasText) ? 'flex' : 'none';

            cm.style.display = 'flex';
            const bubble = row.querySelector('.msg-bubble') || row;
            const rect = bubble.getBoundingClientRect();
            const menuWidth = 195;
            const menuHeight = cm.offsetHeight || 225;

            let left = row.classList.contains('sent') ? (rect.right - menuWidth) : rect.left;
            left = Math.max(12, Math.min(left, window.innerWidth - menuWidth - 12));

            let top;
            if (rect.height > window.innerHeight * 0.55 && clientY) {
                top = Math.max(14, Math.min(clientY - 20, window.innerHeight - menuHeight - 14));
            } else if (rect.bottom + menuHeight + 14 < window.innerHeight) {
                top = rect.bottom + 8;
            } else if (rect.top - menuHeight - 8 > 10) {
                top = rect.top - menuHeight - 8;
            } else {
                top = Math.max(14, window.innerHeight - menuHeight - 14);
            }

            cm.style.left = left + 'px';
            cm.style.top = top + 'px';
        }

        function close3DTouchMenu() {
            const bd = document.getElementById('tg3dBackdrop');
            if (bd) bd.classList.remove('active');
            const cm = document.getElementById('contextMenu');
            if (cm) cm.style.display = 'none';
            document.querySelectorAll('.message-row.tg-3d-active').forEach(el => el.classList.remove('tg-3d-active'));
        }

        document.addEventListener('click', (e) => {
            const cm = document.getElementById('contextMenu');
            if (cm && cm.style.display === 'flex' && !cm.contains(e.target)) {
                close3DTouchMenu();
            }
            const pop = document.getElementById('attachMenuPopover');
            if (pop && pop.style.display === 'flex' && !pop.contains(e.target)) {
                pop.style.display = 'none';
            }
        });

        function bindChatContainerInteractions(container) {
            if (!container || container.dataset.tgBound === '1') return;
            container.dataset.tgBound = '1';

            let pressTimer = null;
            let startX = 0, startY = 0;
            let currentSwipeRow = null;
            let currentSwipeDelta = 0;
            let longPressTriggered = false;

            // Right-click contextmenu (desktop)
            container.addEventListener('contextmenu', (e) => {
                const row = e.target.closest('.message-row');
                if (!row || row.classList.contains('system') || row.querySelector('.system-msg')) return;
                e.preventDefault();
                if (isSelectionMode) {
                    toggleSelect(row);
                    return;
                }
                open3DTouchMenu(row, e.clientX, e.clientY);
            });

            // Click in selection mode or Ctrl+Click
            container.addEventListener('click', (e) => {
                if (longPressTriggered) {
                    longPressTriggered = false;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                const row = e.target.closest('.message-row');
                if (!row || row.classList.contains('system') || row.querySelector('.system-msg')) return;
                if (isSelectionMode || e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleSelect(row);
                    return;
                }
                const replyBox = e.target.closest('.reply-box');
                if (replyBox && !replyBox.getAttribute('onclick')) {
                    const snippetDiv = replyBox.children[1];
                    if (snippetDiv && snippetDiv.innerText) {
                        const cleanSnippet = snippetDiv.innerText.replace(/\.+$/, '').trim().substring(0, 28);
                        if (cleanSnippet) {
                            const allRows = container.querySelectorAll('.message-row');
                            for (const candidate of allRows) {
                                if (candidate === row) continue;
                                const tEl = candidate.querySelector('.msg-text');
                                if (tEl && tEl.innerText.includes(cleanSnippet)) {
                                    scrollToMessage(candidate.id, e);
                                    break;
                                }
                            }
                        }
                    }
                }
            });

            // Touch interactions (Long-press 3D Touch + Swipe-left to Reply)
            container.addEventListener('touchstart', (e) => {
                const row = e.target.closest('.message-row');
                if (!row || row.classList.contains('system') || row.querySelector('.system-msg')) return;
                if (isSelectionMode) return;

                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                currentSwipeRow = row;
                currentSwipeDelta = 0;
                longPressTriggered = false;

                clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    open3DTouchMenu(row, startX, startY);
                }, 420);
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (!currentSwipeRow) return;
                const touch = e.touches[0];
                const dx = touch.clientX - startX;
                const dy = touch.clientY - startY;

                if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                    clearTimeout(pressTimer);
                }

                // Swipe left to reply
                if (dx < -12 && Math.abs(dx) > Math.abs(dy) * 1.25 && !isSelectionMode) {
                    currentSwipeDelta = dx;
                    const shift = Math.max(-72, dx * 0.65);
                    const wrapper = currentSwipeRow.querySelector('.message-wrapper');
                    if (wrapper) {
                        wrapper.style.transition = 'none';
                        wrapper.style.transform = `translateX(${shift}px)`;
                    }
                    let badge = currentSwipeRow.querySelector('.swipe-reply-badge');
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'swipe-reply-badge';
                        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;
                        currentSwipeRow.appendChild(badge);
                    }
                    const progress = Math.min(1, Math.abs(shift) / 48);
                    badge.style.transform = `translateY(-50%) scale(${progress})`;
                    badge.classList.toggle('ready', Math.abs(shift) >= 45);
                }
            }, { passive: true });

            const finishSwipeOrPress = () => {
                clearTimeout(pressTimer);
                if (currentSwipeRow) {
                    const wrapper = currentSwipeRow.querySelector('.message-wrapper');
                    if (wrapper) {
                        wrapper.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1)';
                        wrapper.style.transform = 'translateX(0)';
                    }
                    const badge = currentSwipeRow.querySelector('.swipe-reply-badge');
                    if (badge) {
                        badge.style.transform = 'translateY(-50%) scale(0)';
                    }
                    if (currentSwipeDelta <= -55 && !isSelectionMode) {
                        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
                        setReplyToMessage(currentSwipeRow);
                    }
                    currentSwipeRow = null;
                    currentSwipeDelta = 0;
                }
            };

            container.addEventListener('touchend', finishSwipeOrPress);
            container.addEventListener('touchcancel', finishSwipeOrPress);

            // Desktop mouse drag left to reply + mouse long-press
            let isMouseDown = false;
            container.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const row = e.target.closest('.message-row');
                if (!row || row.classList.contains('system') || row.querySelector('.system-msg')) return;
                if (isSelectionMode || e.target.closest('button, a, audio, video')) return;

                isMouseDown = true;
                startX = e.clientX;
                startY = e.clientY;
                currentSwipeRow = row;
                currentSwipeDelta = 0;
                longPressTriggered = false;

                clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    if (isMouseDown && Math.abs(currentSwipeDelta) < 10) {
                        longPressTriggered = true;
                        isMouseDown = false;
                        open3DTouchMenu(row, startX, startY);
                    }
                }, 500);
            });

            window.addEventListener('mousemove', (e) => {
                if (!isMouseDown || !currentSwipeRow) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                    clearTimeout(pressTimer);
                }
                if (dx < -15 && Math.abs(dx) > Math.abs(dy) * 1.2) {
                    currentSwipeDelta = dx;
                    const shift = Math.max(-72, dx * 0.65);
                    const wrapper = currentSwipeRow.querySelector('.message-wrapper');
                    if (wrapper) {
                        wrapper.style.transition = 'none';
                        wrapper.style.transform = `translateX(${shift}px)`;
                    }
                    let badge = currentSwipeRow.querySelector('.swipe-reply-badge');
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.className = 'swipe-reply-badge';
                        badge.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;
                        currentSwipeRow.appendChild(badge);
                    }
                    const progress = Math.min(1, Math.abs(shift) / 48);
                    badge.style.transform = `translateY(-50%) scale(${progress})`;
                    badge.classList.toggle('ready', Math.abs(shift) >= 45);
                }
            });

            window.addEventListener('mouseup', () => {
                if (!isMouseDown) return;
                isMouseDown = false;
                finishSwipeOrPress();
            });
        }

        [sharedChatContainer, rowanChatContainer, andreasChatContainer, levinChatContainer, document.getElementById('owenChatContainer')].forEach(c => {
            if (c) bindChatContainerInteractions(c);
        });

        // ==========================================
        // REPLY, EDIT, FORWARD, SELECT & 2-STEP DELETE ACTIONS
        // ==========================================
        function getMessageSenderName(row) {
            if (!row) return "User";
            const fwdAuthor = row.querySelector('.forwarded-author-name');
            if (fwdAuthor && fwdAuthor.innerText) return fwdAuthor.innerText.trim();
            if (row.classList.contains('sent')) return "Muzaffar Rasulov";
            const nameEl = row.querySelector('.msg-name');
            if (nameEl && nameEl.innerText) return nameEl.innerText.trim();
            if (currentActiveChat === 'james') return "James (Attorney)";
            if (currentActiveChat === 'rowan') return "Rowan";
            if (currentActiveChat === 'levin') return "Levin Hart";
            if (currentActiveChat === 'andreas') return "Andreas Waibel";
            if (currentActiveChat === 'owen') return "Judge Owen";
            return "User";
        }

        function getMessageSnippet(row) {
            if (!row) return "Message";
            const textEl = row.querySelector('.msg-text');
            if (textEl && textEl.innerText.trim()) return textEl.innerText.trim();
            if (row.querySelector('.voice-msg-player')) return "🎤 Voice message";
            if (row.querySelector('.chat-img-attachment')) return "📷 Photo";
            if (row.querySelector('.chat-video-attachment')) return "🎥 Video";
            const fileEl = row.querySelector('.file-name');
            if (fileEl && fileEl.innerText) return "📎 " + fileEl.innerText.trim();
            return "Message";
        }

        function setReplyToMessage(row) {
            if (!row) return;
            currentEditMsgId = null;
            currentReplyMsg = {
                id: row.id,
                sender: getMessageSenderName(row),
                snippet: getMessageSnippet(row)
            };

            const bar = document.getElementById('tcActionPreviewBar');
            const icon = document.getElementById('tcCapIcon');
            const title = document.getElementById('tcCapTitle');
            const text = document.getElementById('tcCapText');
            if (bar && icon && title && text) {
                icon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`;
                title.innerText = "Reply to " + currentReplyMsg.sender;
                text.innerText = currentReplyMsg.snippet;
                bar.classList.add('active');
            }
            const input = document.getElementById('tcChatInput');
            if (input) input.focus();
        }

        function triggerReply() {
            const row = targetMessageRow;
            close3DTouchMenu();
            if (row) setReplyToMessage(row);
        }

        function showAppToast(msgText) {
            let toast = document.getElementById('zwToastBanner');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'zwToastBanner';
                toast.className = 'zw-toast-banner';
                document.body.appendChild(toast);
            }
            toast.innerText = msgText;
            toast.classList.add('visible');
            clearTimeout(toast._timer);
            toast._timer = setTimeout(() => {
                toast.classList.remove('visible');
            }, 2100);
        }

        function copyTextToClipboardFallback(str) {
            try {
                const ta = document.createElement('textarea');
                ta.value = str;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.focus();
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                return true;
            } catch (e) {
                return false;
            }
        }

        function triggerCopy() {
            const row = targetMessageRow;
            close3DTouchMenu();
            if (!row) return;
            const textEl = row.querySelector('.msg-text');
            const fileEl = row.querySelector('.file-name');
            const sysEl = row.querySelector('.system-msg');
            let copyStr = '';
            if (textEl && textEl.innerText.trim()) {
                copyStr = textEl.innerText.trim();
            } else if (fileEl && fileEl.innerText.trim()) {
                copyStr = fileEl.innerText.trim();
            } else if (sysEl && sysEl.innerText.trim()) {
                copyStr = sysEl.innerText.trim();
            }
            if (!copyStr) {
                showAppToast('Nothing to copy');
                return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(copyStr).then(() => {
                    showAppToast('Copied to clipboard');
                }).catch(() => {
                    copyTextToClipboardFallback(copyStr);
                    showAppToast('Copied to clipboard');
                });
            } else {
                copyTextToClipboardFallback(copyStr);
                showAppToast('Copied to clipboard');
            }
        }

        function triggerEdit() {
            const row = targetMessageRow;
            close3DTouchMenu();
            if (!row || !row.classList.contains('sent')) return;
            const textEl = row.querySelector('.msg-text');
            if (!textEl) return;

            currentReplyMsg = null;
            currentEditMsgId = row.id;
            const origText = textEl.innerText;

            const bar = document.getElementById('tcActionPreviewBar');
            const icon = document.getElementById('tcCapIcon');
            const title = document.getElementById('tcCapTitle');
            const text = document.getElementById('tcCapText');
            if (bar && icon && title && text) {
                icon.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;
                title.innerText = "Editing message";
                text.innerText = origText;
                bar.classList.add('active');
            }

            const input = document.getElementById('tcChatInput');
            if (input) {
                input.value = origText;
                autoResize(input);
                input.focus();
            }
        }

        function cancelChatActionBar() {
            currentReplyMsg = null;
            if (currentEditMsgId) {
                currentEditMsgId = null;
                const input = document.getElementById('tcChatInput');
                if (input) {
                    input.value = '';
                    autoResize(input);
                }
            }
            const bar = document.getElementById('tcActionPreviewBar');
            if (bar) bar.classList.remove('active');
        }

        function scrollToMessage(msgId, event) {
            if (event) event.stopPropagation();
            const target = document.getElementById(msgId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.remove('reply-scroll-highlight');
                void target.offsetWidth;
                target.classList.add('reply-scroll-highlight');
            }
        }

        // MULTI-SELECT LOGIC
        function triggerSelect() {
            const row = targetMessageRow;
            close3DTouchMenu();
            if (!row) return;
            isSelectionMode = true;
            document.body.classList.add('selection-mode-active');
            toggleSelect(row);
        }

        function toggleSelect(row) {
            if (!row || row.classList.contains('system')) return;
            const id = row.id;
            if (selectedMessageIds.has(id)) {
                selectedMessageIds.delete(id);
                row.classList.remove('selected-msg');
            } else {
                selectedMessageIds.add(id);
                row.classList.add('selected-msg');
            }
            isSelectionMode = selectedMessageIds.size > 0;
            document.body.classList.toggle('selection-mode-active', isSelectionMode);
            updateSelectionToolbar();
        }

        function updateSelectionToolbar() {
            const toolbar = document.getElementById('selectionToolbar');
            const countEl = document.getElementById('selectionCount');
            if (countEl) countEl.innerText = selectedMessageIds.size + ' selected';
            if (toolbar) toolbar.classList.toggle('active', isSelectionMode && selectedMessageIds.size > 0);
        }

        function clearSelection() {
            selectedMessageIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('selected-msg');
            });
            selectedMessageIds.clear();
            isSelectionMode = false;
            document.body.classList.remove('selection-mode-active');
            updateSelectionToolbar();
        }

        // FORWARD LOGIC
        function triggerForward() {
            close3DTouchMenu();
            if (!targetMessageRow) return;
            const fm = document.getElementById('forwardModal');
            if (fm) fm.style.display = 'flex';
        }

        function openForwardModalFromSelection() {
            if (selectedMessageIds.size === 0) return;
            const fm = document.getElementById('forwardModal');
            if (fm) fm.style.display = 'flex';
        }

        function extractForwardableContentHtml(row) {
            const clone = row.cloneNode(true);
            const bubble = clone.querySelector('.msg-bubble');
            if (!bubble) return `<div class="msg-text">${getMessageSnippet(row)}</div>`;
            const toRemove = bubble.querySelectorAll('.msg-name, .reply-box, .msg-time-container, .forwarded-header');
            toRemove.forEach(el => el.remove());
            return bubble.innerHTML.trim();
        }

        function forwardMessagesTo(destPerson) {
            closeModal('forwardModal');
            let rowsToForward = [];
            if (isSelectionMode && selectedMessageIds.size > 0) {
                selectedMessageIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) rowsToForward.push(el);
                });
            } else if (targetMessageRow) {
                rowsToForward.push(targetMessageRow);
            }
            if (rowsToForward.length === 0) return;

            clearSelection();
            switchDirectChat(destPerson);

            rowsToForward.forEach(row => {
                const originalAuthor = getMessageSenderName(row);
                const innerContent = extractForwardableContentHtml(row);
                const fwdHeaderHTML = `
                    <div class="forwarded-header">
                        <svg viewBox="0 0 24 24"><path d="M14 9V5l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z"/></svg>
                        <span>Forwarded from <b class="forwarded-author-name">${originalAuthor}</b></span>
                    </div>
                `;
                const html = `<div class="message-wrapper"><div class="msg-bubble">${fwdHeaderHTML}${innerContent}<div class="msg-time-container">${getCurrentTime()} ${readTicksHTML}</div></div></div>`;
                const msgObj = {
                    id: getNextId(),
                    type: 'sent',
                    timestamp: Date.now(),
                    html: html,
                    isDeleted: false
                };
                if (destPerson === 'owen') {
                    const owenContainer = document.getElementById('owenChatContainer');
                    if (owenContainer) {
                        owenContainer.style.justifyContent = 'flex-start';
                        renderMsgObj(msgObj, owenContainer, 'owen');
                        owenContainer.scrollTop = owenContainer.scrollHeight;
                    }
                } else {
                    saveAndRenderMessage(msgObj, destPerson);
                }
            });
            targetMessageRow = null;
        }

        // 2-STEP DELETE LOGIC ("For everyone" / "For me" -> "Are you sure?")
        function openDeleteModal() {
            close3DTouchMenu();
            const count = (isSelectionMode && selectedMessageIds.size > 0) ? selectedMessageIds.size : (targetMessageRow ? 1 : 0);
            if (count === 0) return;

            const modal = document.getElementById('deleteConfirmModal');
            if (!modal) return;
            const dialog = modal.querySelector('.delete-dialog');
            if (dialog) {
                dialog.innerHTML = `
                    <h4>Delete ${count > 1 ? count + ' Messages' : 'Message'}</h4>
                    <p>Please select how you want to delete ${count > 1 ? 'these messages' : 'this message'}:</p>
                    <div class="del-btn-group">
                        <button class="del-btn danger" onclick="askSecondDeleteConfirm('everyone')">Delete for everyone</button>
                        <button class="del-btn danger" onclick="askSecondDeleteConfirm('me')">Delete for me</button>
                        <button class="del-btn cancel" onclick="closeModal('deleteConfirmModal')">Cancel</button>
                    </div>
                `;
            }
            modal.style.display = 'flex';
        }

        function askSecondDeleteConfirm(mode) {
            pendingDeleteMode = mode;
            const count = (isSelectionMode && selectedMessageIds.size > 0) ? selectedMessageIds.size : 1;
            const modal = document.getElementById('deleteConfirmModal');
            if (!modal) return;
            const dialog = modal.querySelector('.delete-dialog');
            const scopeText = mode === 'everyone' ? 'for everyone (both sides)' : 'only for yourself';
            if (dialog) {
                dialog.innerHTML = `
                    <h4>Are you sure?</h4>
                    <p>Are you sure you want to delete ${count > 1 ? 'these ' + count + ' messages' : 'this message'} <b>${scopeText}</b>? This action cannot be undone.</p>
                    <div class="del-btn-group">
                        <button class="del-btn danger" style="background:#ea4335; color:#fff; font-weight:600;" onclick="confirmDelete('${mode}')">Yes, delete</button>
                        <button class="del-btn cancel" onclick="closeModal('deleteConfirmModal')">Cancel</button>
                    </div>
                `;
            }
        }

        function confirmDelete(mode) {
            const idsToDelete = new Set();
            if (isSelectionMode && selectedMessageIds.size > 0) {
                selectedMessageIds.forEach(id => idsToDelete.add(id));
            } else if (targetMessageRow && targetMessageRow.id) {
                idsToDelete.add(targetMessageRow.id);
            }

            if (idsToDelete.size > 0 && currentActiveChat && chatHistories[currentActiveChat]) {
                chatHistories[currentActiveChat].forEach(m => {
                    if (idsToDelete.has(m.id)) {
                        deletedMessageIds.add(m.id);
                        deletedMessageIds.add('ts-' + m.timestamp);
                    }
                });
                safeSetItem('zwDeletedIds_v1', JSON.stringify(Array.from(deletedMessageIds)));

                idsToDelete.forEach(id => {
                    const domEl = document.getElementById(id);
                    if (domEl) domEl.remove();
                });
                chatHistories[currentActiveChat] = chatHistories[currentActiveChat].filter(m => !idsToDelete.has(m.id));
                try {
                    safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                    const customMsgs = JSON.parse(safeGetItem('zwUserCustomMsgs_v1') || '{}');
                    if (customMsgs[currentActiveChat]) {
                        customMsgs[currentActiveChat] = customMsgs[currentActiveChat].filter(m => !idsToDelete.has(m.id));
                        safeSetItem('zwUserCustomMsgs_v1', JSON.stringify(customMsgs));
                    }
                } catch (e) {}
                if (typeof pushDeleteToApi === 'function') {
                    pushDeleteToApi(currentActiveChat, Array.from(idsToDelete));
                }
                updateSidebarPreview();
            }

            targetMessageRow = null;
            pendingDeleteMode = null;
            clearSelection();
            closeModal('deleteConfirmModal');
        }

        // ==========================================
        // SEND TEXT, EDIT SUBMISSION & REPLY EMBEDDING
        // ==========================================
        function buildReplyBoxHtml() {
            if (!currentReplyMsg) return '';
            const safeSender = currentReplyMsg.sender.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const safeSnippet = currentReplyMsg.snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return `<div class="reply-box" onclick="scrollToMessage('${currentReplyMsg.id}', event)" style="border-left: 3px solid #fff; background: rgba(255, 255, 255, 0.2); padding: 6px 10px; margin-bottom: 8px; border-radius: 6px; font-size: 12px; color: #fff; cursor: pointer;"><div style="font-weight: 600; color: #fff; margin-bottom: 2px;">${safeSender}</div><div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.9;">${safeSnippet}</div></div>`;
        }

        function sendMessage(source) {
            const inputId = source === 'tc' ? 'tcChatInput' : 'meetingChatInput';
            const input = document.getElementById(inputId);
            if (!input) return;
            const msg = input.value.trim();

            if (msg === "" || input.disabled) return;

            input.value = "";
            input.style.height = 'auto';

            // Handle Edit Mode submission
            if (currentEditMsgId && source === 'tc') {
                const row = document.getElementById(currentEditMsgId);
                if (row) {
                    const textEl = row.querySelector('.msg-text');
                    if (textEl) textEl.innerText = msg;

                    const timeContainer = row.querySelector('.msg-time-container');
                    const editTimeStr = getCurrentTime();
                    if (timeContainer) {
                        let editedTag = timeContainer.querySelector('.msg-edited-tag');
                        if (!editedTag) {
                            editedTag = document.createElement('span');
                            editedTag.className = 'msg-edited-tag';
                            timeContainer.insertBefore(editedTag, timeContainer.firstChild);
                        }
                        editedTag.innerText = `edited ${editTimeStr}`;
                    }

                    if (currentActiveChat && chatHistories[currentActiveChat]) {
                        const item = chatHistories[currentActiveChat].find(m => m.id === currentEditMsgId);
                        if (item) {
                            item.html = row.innerHTML;
                            persistCustomMessage(item, currentActiveChat);
                            try {
                                safeSetItem('zwChatData_v97', JSON.stringify(chatHistories));
                            } catch (e) {}
                            if (typeof pushUserMessageToApi === 'function') {
                                pushUserMessageToApi(item, currentActiveChat);
                            }
                            updateSidebarPreview();
                        }
                    }
                }
                cancelChatActionBar();
                return;
            }

            const replyHTML = buildReplyBoxHtml();
            const safeMsg = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const html = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML}<div class="msg-text" style="white-space: pre-wrap;">${safeMsg}</div><div class="msg-time-container">${getCurrentTime()} ${readTicksHTML}</div></div></div>`;
            const msgObj = { id: getNextId(), type: 'sent', timestamp: Date.now(), html: html, isDeleted: false };
            saveAndRenderMessage(msgObj);
            cancelChatActionBar();
        }

        function handleKeyPress(e, source) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(source);
            } else if (e.key === 'Escape') {
                cancelChatActionBar();
            }
        }

        function autoResize(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight > 120 ? '120px' : textarea.scrollHeight + 'px';
        }

        // ==========================================
        // VOICE MESSAGE RECORDING & WAVEFORM PLAYER
        // ==========================================
        function formatDurationSec(sec) {
            const s = Math.max(1, Math.round(sec));
            const mins = Math.floor(s / 60);
            const rem = s % 60;
            return `${mins}:${rem.toString().padStart(2, '0')}`;
        }

        function createFallbackWavDataUrl(durationSec) {
            const sampleRate = 8000;
            const numSamples = Math.min(sampleRate * 15, Math.max(sampleRate, Math.floor(sampleRate * durationSec)));
            const buffer = new ArrayBuffer(44 + numSamples * 2);
            const view = new DataView(buffer);
            const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + numSamples * 2, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, numSamples * 2, true);
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                const env = Math.sin(Math.PI * (i / numSamples));
                const sample = Math.sin(2 * Math.PI * 440 * t) * 0.15 * env;
                view.setInt16(44 + i * 2, sample * 32767, true);
            }
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
            return 'data:audio/wav;base64,' + btoa(binary);
        }

        function buildVoicePlayerHtml(audioSrc, durationSec) {
            const heights = [30, 55, 40, 75, 90, 50, 65, 95, 70, 45, 80, 60, 100, 85, 55, 75, 90, 65, 45, 70, 85, 50, 60, 40, 55, 35];
            const barsHtml = heights.map(h => `<div class="voice-bar" style="height:${h}%"></div>`).join('');
            const durText = formatDurationSec(durationSec);
            return `
                <div class="voice-msg-player" onclick="event.stopPropagation()">
                    <button class="voice-play-btn" onclick="toggleVoicePlay(this)">
                        <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    </button>
                    <div class="voice-wave-col">
                        <div class="voice-wave-bars" onclick="seekVoiceWave(event, this)">${barsHtml}</div>
                        <div class="voice-duration-text" data-total="${durText}">${durText}</div>
                    </div>
                    <audio src="${audioSrc}" preload="metadata" ontimeupdate="updateVoiceProgress(this)" onended="resetVoicePlayer(this)"></audio>
                </div>
            `;
        }

        function toggleVoicePlay(btn) {
            const player = btn.closest('.voice-msg-player');
            if (!player) return;
            const audio = player.querySelector('audio');
            if (!audio) return;

            // Pause all other voice messages
            document.querySelectorAll('.voice-msg-player audio').forEach(other => {
                if (other !== audio && !other.paused) {
                    other.pause();
                    const otherBtn = other.closest('.voice-msg-player').querySelector('.voice-play-btn');
                    if (otherBtn) otherBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
                }
            });

            if (audio.paused) {
                audio.play().catch(() => {});
                btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
            } else {
                audio.pause();
                btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
            }
        }

        function updateVoiceProgress(audio) {
            const player = audio.closest('.voice-msg-player');
            if (!player) return;
            const bars = player.querySelectorAll('.voice-bar');
            const durEl = player.querySelector('.voice-duration-text');
            const total = (audio.duration && isFinite(audio.duration)) ? audio.duration : 1;
            const ratio = Math.min(1, Math.max(0, audio.currentTime / total));
            const activeCount = Math.ceil( ratio * bars.length );
            bars.forEach((b, idx) => b.classList.toggle('played', idx < activeCount));
            if (durEl) {
                durEl.innerText = `${formatDurationSec(audio.currentTime)} / ${durEl.getAttribute('data-total') || formatDurationSec(total)}`;
            }
        }

        function resetVoicePlayer(audio) {
            const player = audio.closest('.voice-msg-player');
            if (!player) return;
            const btn = player.querySelector('.voice-play-btn');
            if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
            player.querySelectorAll('.voice-bar').forEach(b => b.classList.remove('played'));
            const durEl = player.querySelector('.voice-duration-text');
            if (durEl) durEl.innerText = durEl.getAttribute('data-total') || '0:01';
        }

        function seekVoiceWave(e, waveContainer) {
            const player = waveContainer.closest('.voice-msg-player');
            if (!player) return;
            const audio = player.querySelector('audio');
            if (!audio || !audio.duration || !isFinite(audio.duration)) return;
            const rect = waveContainer.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            audio.currentTime = ratio * audio.duration;
            updateVoiceProgress(audio);
        }


        // ==========================================
        // GALLERY & FILE ATTACHMENT LOGIC (SCRIPCA)
        // ==========================================
        function openAttachMenu(e, source = 'tc') {
            const pop = document.getElementById('attachMenuPopover');
            if (!pop) return;
            if (pop.style.display === 'flex') {
                pop.style.display = 'none';
                return;
            }
            pop.style.display = 'flex';
            const btnRect = e.currentTarget.getBoundingClientRect();
            const left = Math.max(10, Math.min(btnRect.left, window.innerWidth - 225));
            const top = Math.max(10, btnRect.top - 125);
            pop.style.left = left + 'px';
            pop.style.top = top + 'px';
        }

        function triggerGalleryUpload() {
            const pop = document.getElementById('attachMenuPopover');
            if (pop) pop.style.display = 'none';
            const gal = document.getElementById('galleryInput');
            if (gal) { gal.value = ''; gal.click(); }
        }

        function triggerDocumentUpload() {
            const pop = document.getElementById('attachMenuPopover');
            if (pop) pop.style.display = 'none';
            const fi = document.getElementById('fileInput');
            if (fi) { fi.value = ''; fi.click(); }
        }

        function formatBytesSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }

        function openFilePreviewModal(mediaUrl, downloadUrl, fileName, metaSubtitle) {
            const modal = document.getElementById('filePreviewModal');
            const nameEl = document.getElementById('fpModalName');
            const metaEl = document.getElementById('fpModalMeta');
            const bodyEl = document.getElementById('fpModalBody');
            const dlBtn = document.getElementById('fpDownloadBtn');
            const shBtn = document.getElementById('fpShareBtn');
            if (!modal || !bodyEl) {
                triggerFileDownload(downloadUrl || mediaUrl, fileName);
                return;
            }

            if (nameEl) nameEl.innerText = fileName || 'Document';
            if (metaEl) metaEl.innerText = metaSubtitle || 'File';

            const ext = String(fileName || '').split('.').pop().toLowerCase();
            if (ext === 'pdf') {
                bodyEl.innerHTML = `<iframe src="${mediaUrl}" class="fp-iframe-viewer" title="${fileName}"></iframe>`;
            } else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                bodyEl.innerHTML = `<img src="${mediaUrl}" class="fp-img-viewer" alt="${fileName}">`;
            } else {
                const badge = (ext || 'FILE').toUpperCase().slice(0, 4);
                bodyEl.innerHTML = `
                    <div class="fp-generic-card">
                        <div class="fp-generic-icon">${badge}</div>
                        <div class="fp-generic-name">${fileName}</div>
                        <div class="fp-generic-sub">${metaSubtitle || 'Ready to download or share'}</div>
                    </div>
                `;
            }

            if (dlBtn) {
                dlBtn.onclick = () => triggerFileDownload(downloadUrl || mediaUrl, fileName);
            }
            if (shBtn) {
                shBtn.onclick = () => triggerFileShare(mediaUrl, fileName);
            }
            modal.style.display = 'flex';
        }

        async function triggerFileDownload(url, fileName) {
            const safeName = fileName || 'download';
            try {
                showAppToast('Yuklab olinmoqda...');
                const resp = await fetch(url);
                if (!resp.ok) throw new Error('Fetch failed');
                const blob = await resp.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = safeName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 8000);
            } catch (e) {
                const a = document.createElement('a');
                a.href = url;
                a.download = safeName;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        }

        async function triggerFileShare(url, fileName) {
            const safeName = fileName || 'Attachment';
            try {
                const resp = await fetch(url);
                const blob = await resp.blob();
                const fileObj = new File([blob], safeName, { type: blob.type || 'application/octet-stream' });
                if (navigator.canShare && navigator.canShare({ files: [fileObj] })) {
                    await navigator.share({
                        files: [fileObj],
                        title: safeName
                    });
                    return;
                }
                if (navigator.share) {
                    await navigator.share({
                        title: safeName,
                        url: url.startsWith('http') ? url : (window.location.origin + (url.startsWith('/') ? url : '/' + url))
                    });
                    return;
                }
            } catch (err) {
                if (err && err.name === 'AbortError') return;
            }
            triggerFileDownload(url + (url.includes('?') ? '&download=1' : '?download=1'), safeName);
        }

        function handleFileUpload(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            const input = document.getElementById('tcChatInput');
            const captionText = input ? input.value.trim() : '';
            if (input && captionText) {
                input.value = '';
                input.style.height = 'auto';
            }

            const fileList = Array.from(files);
            const imageFiles = fileList.filter(f => f.type.startsWith('image/'));
            const otherFiles = fileList.filter(f => !f.type.startsWith('image/'));

            const readAsUrlPromise = (file) => new Promise((resolve) => {
                if (file.size <= 3.5 * 1024 * 1024) {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = () => resolve(URL.createObjectURL(file));
                    reader.readAsDataURL(file);
                } else {
                    resolve(URL.createObjectURL(file));
                }
            });

            // 1. Agar 1 ta yoki bir nechta rasm tanlangan bo'lsa -> hammasini bitta guruh (Album) qilib yuboramiz!
            if (imageFiles.length > 0) {
                Promise.all(imageFiles.map(readAsUrlPromise)).then((imgUrls) => {
                    const replyHTML = buildReplyBoxHtml();
                    const captionHTML = captionText
                        ? `<div class="msg-text" style="white-space: pre-wrap; margin-top: 6px;">${captionText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
                        : '';
                    const mediaHTML = (typeof buildAlbumGridHtml === 'function')
                        ? buildAlbumGridHtml(imgUrls)
                        : `<div class="chat-img-attachment"><img src="${imgUrls[0]}" onclick="openImageModal(this.src)"></div>`;

                    const html = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML}${mediaHTML}${captionHTML}<div class="msg-time-container">${getCurrentTime()} ${readTicksHTML}</div></div></div>`;
                    const msgObj = {
                        id: getNextId(),
                        type: 'sent',
                        timestamp: Date.now(),
                        html: html,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msgObj);
                    cancelChatActionBar();
                });
            }

            // 2. Boshqa fayllar (video, audio, hujjat)
            otherFiles.forEach((file, idx) => {
                const sizeStr = formatBytesSize(file.size);
                const isVideo = file.type.startsWith('video/');
                const isAudio = file.type.startsWith('audio/');
                const safeName = file.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

                readAsUrlPromise(file).then((urlSrc) => {
                    const replyHTML = (imageFiles.length === 0 && idx === 0) ? buildReplyBoxHtml() : '';
                    const captionHTML = (imageFiles.length === 0 && idx === 0 && captionText)
                        ? `<div class="msg-text" style="white-space: pre-wrap; margin-top: 6px;">${captionText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>`
                        : '';

                    let mediaHTML = '';
                    if (isVideo) {
                        mediaHTML = `<div class="chat-video-attachment" onclick="event.stopPropagation()"><video src="${urlSrc}" controls playsinline></video></div>`;
                    } else if (isAudio) {
                        mediaHTML = buildVoicePlayerHtml(urlSrc, 15);
                    } else if (typeof buildFileCardHtml === 'function') {
                        mediaHTML = buildFileCardHtml(urlSrc, file.name, sizeStr);
                    }

                    const html = `<div class="message-wrapper"><div class="msg-bubble">${replyHTML}${mediaHTML}${captionHTML}<div class="msg-time-container">${getCurrentTime()} ${readTicksHTML}</div></div></div>`;
                    const msgObj = {
                        id: getNextId(),
                        type: 'sent',
                        timestamp: Date.now(),
                        html: html,
                        isDeleted: false
                    };
                    saveAndRenderMessage(msgObj);
                    if (imageFiles.length === 0 && idx === 0) cancelChatActionBar();
                });
            });

            event.target.value = '';
        }

        // ==========================================
        // TELEGRAM-STYLE SWIPE-RIGHT TO EXIT CHAT ON MOBILE
        // + SWIPE LEFT/RIGHT IN FULL-SCREEN ALBUM MODAL
        // ==========================================
        (function initMobileSwipeBackAndAlbumSwipe() {
            let chatSwipeStartX = 0;
            let chatSwipeStartY = 0;
            let chatSwipeActive = false;
            let chatSwipeDx = 0;

            const tcMain = document.querySelector('.tc-main');
            if (tcMain) {
                tcMain.addEventListener('touchstart', (e) => {
                    if (window.innerWidth > 900 || !document.body.classList.contains('mobile-chat-open')) return;
                    if (e.touches.length !== 1) return;
                    if (e.target.closest('input, textarea, audio, video, .voice-rec-btn')) return;
                    chatSwipeStartX = e.touches[0].clientX;
                    chatSwipeStartY = e.touches[0].clientY;
                    chatSwipeActive = false;
                    chatSwipeDx = 0;
                }, { passive: true });

                tcMain.addEventListener('touchmove', (e) => {
                    if (window.innerWidth > 900 || !document.body.classList.contains('mobile-chat-open')) return;
                    if (!chatSwipeStartX) return;
                    const dx = e.touches[0].clientX - chatSwipeStartX;
                    const dy = e.touches[0].clientY - chatSwipeStartY;

                    // O'ngga surish (Swipe Right to exit chat like Telegram)
                    if (!chatSwipeActive && dx > 22 && Math.abs(dx) > Math.abs(dy) * 1.35) {
                        chatSwipeActive = true;
                    }

                    if (chatSwipeActive && dx > 0) {
                        chatSwipeDx = dx;
                        tcMain.style.transition = 'none';
                        tcMain.style.transform = `translateX(${Math.min(window.innerWidth, dx)}px)`;
                    }
                }, { passive: true });

                const endChatSwipe = () => {
                    if (!chatSwipeStartX) return;
                    chatSwipeStartX = 0;
                    if (!chatSwipeActive) return;
                    chatSwipeActive = false;

                    if (chatSwipeDx >= 72) {
                        tcMain.style.transition = 'transform 0.18s ease-out';
                        tcMain.style.transform = 'translateX(100%)';
                        setTimeout(() => {
                            tcMain.style.transition = '';
                            tcMain.style.transform = '';
                            closeMobileChat();
                        }, 170);
                    } else {
                        tcMain.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1)';
                        tcMain.style.transform = 'translateX(0)';
                        setTimeout(() => {
                            tcMain.style.transition = '';
                            tcMain.style.transform = '';
                        }, 200);
                    }
                    chatSwipeDx = 0;
                };

                tcMain.addEventListener('touchend', endChatSwipe);
                tcMain.addEventListener('touchcancel', endChatSwipe);
            }

            // Album modal touch swipe left/right
            const imgModal = document.getElementById('imgModal');
            if (imgModal) {
                let mStartX = 0;
                imgModal.addEventListener('touchstart', (e) => {
                    if (e.touches.length === 1) mStartX = e.touches[0].clientX;
                }, { passive: true });
                imgModal.addEventListener('touchend', (e) => {
                    if (!mStartX || !e.changedTouches.length) return;
                    const diffX = e.changedTouches[0].clientX - mStartX;
                    mStartX = 0;
                    if (Math.abs(diffX) > 45 && currentAlbumUrls && currentAlbumUrls.length > 1) {
                        stepAlbumPhoto(diffX < 0 ? 1 : -1);
                    }
                }, { passive: true });
            }
        })();

        // Safe localStorage wrapper inside saveAndRenderMessage
        const _origSaveAndRenderMessage = saveAndRenderMessage;
        saveAndRenderMessage = function(msgObj, targetChat = currentActiveChat) {
            try {
                _origSaveAndRenderMessage(msgObj, targetChat);
            } catch (e) {
                console.warn("Storage limit reached for large media, rendered in session:", e);
            }
        };

        // PWA SERVICE WORKER
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').then(() => console.log("Service Worker registered")).catch(() => {});
        }

        startAutomatedScenario();
