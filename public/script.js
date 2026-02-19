// --- 1. التعريفات الأساسية والمتغيرات العالمية ---
// أضف هذا السطر في أول الملف تماماً
let isHost = false;
const socket = io();
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const TMDB_KEY = "4a71b39887f9b5dd489791402728ab1a";
const APP_ID = "97b6d211d09447b480ae3b8b62cc4a68";
const CHANNEL = "main_room";

let localAudioTrack = null;
let isMicOn = false;
let currentUser = { name: "", avatar: "" };
let ytPlayer;
let isYtReady = false;
let hls = null;
const videoElement = document.getElementById('video');

// جسر الربط: يربط رقم الصوت (UID) بمعرف المستخدم (Socket ID)
let agoraToSocketMap = {}; 

// --- 2. نظام الأفاتارات وتجهيز الدخول ---
function init() {
    const presets = document.getElementById('avatar-presets');
    for(let i=1; i<=5; i++) {
        const url = `https://api.dicebear.com/7.x/avataaars/svg?seed=${i+33}`;
        const img = document.createElement('img');
        img.src = url;
        img.onclick = () => { 
            document.getElementById('preview').src = url; 
            currentUser.avatar = url; 
        };
        presets.appendChild(img);
    }
}
init();

document.getElementById('avatarInput').onchange = function(e) {
    const reader = new FileReader();
    reader.onload = function() {
        document.getElementById('preview').src = reader.result;
        currentUser.avatar = reader.result;
    };
    if (e.target.files[0]) reader.readAsDataURL(e.target.files[0]);
};

function join() {
    const name = document.getElementById('username').value;
    const room = document.getElementById('room-id').value;
    const pass = document.getElementById('room-pass').value;
    if(!name || !room || !pass) return alert("أكمل البيانات!");
    currentUser.name = name;
    currentUser.avatar = currentUser.avatar || document.getElementById('preview').src;
    socket.emit("join-room", { roomId: room, password: pass, user: currentUser });
    {
    // إيقاظ محرك الصوت (حل سحري لمشاكل المتصفحات)
    if (AgoraRTC.getAudioContext) {
        AgoraRTC.getAudioContext().resume().then(() => {
            console.log("تم تفعيل محرك الصوت بنجاح");
        });
    }
    
    // بقية كود الدخول الخاص بك...
    const name = document.getElementById('username').value;
    // ... إلخ
}
}

socket.on("join-success", () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-avatar').src = currentUser.avatar;
});

// --- 3. نظام المزامنة والظهور (Socket.io) ---

// استقبال قائمة المستخدمين ورسمهم جميعاً
socket.on("update-users", users => {
    const userList = document.getElementById('user-list');
    
    // إعادة بناء القائمة: نبدأ بـ "أنت"
    userList.innerHTML = `
        <div class="avatar-container" id="local-user">
            <img src="${currentUser.avatar}" class="avatar-img" id="current-avatar">
            <div class="user-name">أنت (${currentUser.name})</div>
        </div>
    `;

    // إضافة الآخرين
    users.forEach(user => {
        if (user.id !== socket.id) {
            const div = document.createElement('div');
            div.className = 'avatar-container';
            div.id = `user-${user.id}`; // المعرف المستخدم للتوهج
            div.innerHTML = `
                <img src="${user.avatar}" class="avatar-img">
                <div class="user-name">${user.name}</div>
            `;
            userList.appendChild(div);
        }
    });
});

// استقبال خريطة الربط للتوهج
socket.on("update-agora-map", map => {
    agoraToSocketMap = map;
    console.log("خريطة المستخدمين المحدثة:", map);
});

// --- 4. نظام الصوت (Agora) وتوهج الأفاتار ---

client.enableAudioVolumeIndicator();

client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        let elementId = "";
        
        if (volume.uid === 0 || volume.uid === client.uid) {
            elementId = 'local-user';
        } else {
            const socketId = agoraToSocketMap[volume.uid];
            if (socketId) elementId = `user-${socketId}`;
        }

        const el = document.getElementById(elementId);
        if (el) {
            if (volume.level > 40) el.classList.add('speaking');
            else el.classList.remove('speaking');
        }
    });
});

client.on("user-published", async (user, mediaType) => {
    // الاشتراك في المسار القادم من الشخص الآخر
    await client.subscribe(user, mediaType);
    console.log("تم الاشتراك في ميديا المستخدم:", user.uid);

    if (mediaType === "audio") {
        // تشغيل الصوت فوراً
        user.audioTrack.play();
        console.log("صوت الصديق يعمل الآن...");
    }
});
async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    
    try {
        // 1. إذا لم يكن هناك مسار صوتي أصلاً، نقوم بإنشائه
        if (!localAudioTrack) {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        }

        if (!isMicOn) {
            // --- مرحلة التشغيل ---
            
            // تأكد من الاتصال بـ Agora أولاً
            if (client.connectionState === "DISCONNECTED") {
                const uid = await client.join(APP_ID, CHANNEL, null, null);
                socket.emit("map-agora-id", { uid: uid });
            }

            // الحل السحري: تفعيل المسار يدوياً قبل النشر لمنع خطأ TRACK_IS_DISABLED
            await localAudioTrack.setEnabled(true);

            // نشر المسار إذا لم يكن منضوراً بالفعل
            if (client.localTracks.length === 0) {
                await client.publish(localAudioTrack);
            }

            isMicOn = true;
            micBtn.classList.add('mic-active');
            micBtn.innerHTML = "🎤";
            console.log("المايك يعمل الآن بنجاح ✅");

        } else {
            // --- مرحلة الإيقاف ---
            
            // تعطيل المسار بدلاً من حذفه تماماً لسهولة إعادة التشغيل
            await localAudioTrack.setEnabled(false);
            
            isMicOn = false;
            micBtn.classList.remove('mic-active');
            micBtn.innerHTML = "🔇";
            
            // إزالة تأثير التوهج محلياً
            const me = document.getElementById('local-user');
            if (me) me.classList.remove('speaking');
            
            console.log("تم إيقاف المايك مؤقتاً 🔇");
        }
    } catch (error) {
        console.error("خطأ في نظام المايك:", error);
        // في حال حدوث خطأ حرج، يفضل تصفير المسار لإعادة المحاولة من الصفر
        if (localAudioTrack) {
            await localAudioTrack.close();
            localAudioTrack = null;
        }
        isMicOn = false;
        micBtn.classList.remove('mic-active');
        micBtn.innerHTML = "🔇";
    }
}

// --- 5. البحث وتشغيل الأفلام والمزامنة ---

document.getElementById('movieSearch').oninput = async (e) => {
    const query = e.target.value;
    if(query.length < 3) return;
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&language=ar-SA`);
    const data = await res.json();
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = "";
    data.results.slice(0,6).forEach(m => {
        const div = document.createElement('div');
        div.className = "search-item";
        div.innerHTML = `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}"> <span>${m.title || m.name}</span>`;
        div.onclick = () => {
            const type = m.media_type === 'movie' ? 'movie' : 'tv';
            const url = `https://vidsrc.me/embed/${type}?tmdb=${m.id}`;
            socket.emit("change-video", url);
            resDiv.style.display = "none";
        };
        resDiv.appendChild(div);
    });
    resDiv.style.display = "block";
};

function handleSource(url) {
    const ytArea = document.getElementById('youtube-player');
    const iframeSlot = document.getElementById('iframe-slot');
    ytArea.style.display = "none";
    videoElement.style.display = "none";
    iframeSlot.innerHTML = "";

    if(url.includes('youtube') || url.includes('youtu.be')) {
        ytArea.style.display = "block";
        const id = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
        if(isYtReady) ytPlayer.loadVideoById(id); else initYT(id);
    } 
    else if (url.includes('.m3u8') || url.includes('.mp4')) {
        videoElement.style.display = "block";
        if (url.includes('.m3u8')) {
            if (Hls.isSupported()) {
                if (hls) hls.destroy();
                hls = new Hls();
                hls.loadSource(url); hls.attachMedia(videoElement);
            }
        } else { videoElement.src = url; }
        videoElement.play();
    } else {
        iframeSlot.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
    }
}

socket.on("video-changed", url => handleSource(url));

// المزامنة
videoElement.onplay = () => socket.emit("video-control", { type: 'play', time: videoElement.currentTime });
videoElement.onpause = () => socket.emit("video-control", { type: 'pause', time: videoElement.currentTime });
socket.on("video-sync", data => {
    if (videoElement.style.display !== "none") {
        if (data.type === 'play') videoElement.play();
        if (data.type === 'pause') videoElement.pause();
        if (Math.abs(videoElement.currentTime - data.time) > 2) videoElement.currentTime = data.time;
    }
});

function playDirectUrl() {
    const url = document.getElementById('directLinkInput').value;
    if (url) socket.emit("change-video", url);
}

// --- 6. الشات والتفاعلات ---

function sendEmoji(e) { socket.emit("reaction", e); showEmoji(e); }
socket.on("reaction", d => showEmoji(d.emoji));
function showEmoji(e) {
    const div = document.createElement('div');
    div.className = "floating-emoji"; div.innerText = e;
    div.style.left = (Math.random() * 60 + 20) + "%";
    document.getElementById('video-wrapper').appendChild(div);
    setTimeout(() => div.remove(), 2500);
}

document.getElementById('chatInput').onkeypress = (e) => {
    if(e.key === "Enter" && e.target.value !== "") {
        socket.emit("chat-msg", e.target.value); e.target.value = "";
    }
};
socket.on("chat-msg", (d) => {
    const msgContainer = document.getElementById('messages');
    
    // إنشاء محتوى إضافي إذا كان هناك اقتراح من البوت
    let botContent = "";
    if (d.isSuggestion) {
        const uniqueId = "btn-" + Date.now(); // معرف فريد للزر
        botContent = `
            <div class="bot-suggestion-card">
                <img src="${d.poster}" class="mini-poster" onerror="this.src='https://via.placeholder.com/150x225?text=No+Poster'">
                <button id="${uniqueId}" onclick="playMovieDirectly('${d.suggestion}', '${uniqueId}')" class="bot-play-btn">
                    ▶️ تشغيل الفيلم للجميع
                </button>
            </div>
        `;
    }

    // عرض الرسالة (تأكد من أن أسماء الكلاسات تطابق تنسيقك)
    msgContainer.innerHTML += `
        <div class="msg animate-in">
            <img src="${d.user.avatar}" class="chat-avatar">
            <div class="msg-body">
                <b class="user-name">${d.user.name}</b>
                <div class="msg-content">
                    ${d.text}
                    ${botContent}
                </div>
            </div>
        </div>`;
    
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

// دالة التشغيل التي تطلق العد التنازلي
function playMovieDirectly(url, buttonId) {
    // إخفاء الزر عند الجميع لعدم التكرار
    socket.emit("disable-bot-button", buttonId);
    // بدء العد التنازلي والتشغيل
    socket.emit("change-video", url);
}

socket.on("start-countdown", (url) => {
    const overlay = document.getElementById('countdown-overlay');
    const numberDisplay = document.getElementById('countdown-number');
    let count = 5; // عدد الثواني

    overlay.style.display = 'flex';
    numberDisplay.innerText = count;

    const timer = setInterval(() => {
        count--;
        numberDisplay.innerText = count;

        if (count <= 0) {
            clearInterval(timer);
            overlay.style.display = 'none';
            
            // الآن نقوم بتشغيل الفيلم فعلياً
            renderVideo(url); 
        }
    }, 1000);
});

// دالة مساعدة لتشغيل الفيديو (تأكد أن أسماء الـ IDs تطابق ما لديك)
function renderVideo(url) {
    const iframe = document.getElementById('iframe-slot'); // أو مشغل الفيديو الخاص بك
    if (url.includes('iframe') || url.includes('vidsrc')) {
        iframe.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay"></iframe>`;
    } else {
        // إذا كان رابط مباشر mp4
        const video = document.getElementById('video');
        video.src = url;
        video.play();
    }
}

// دالة التشغيل المباشر (متاحة للجميع)
function playMovieDirectly(url, buttonId) {
    // 1. إرسال أمر تشغيل الفيديو
    socket.emit("change-video", url);

    // 2. إرسال أمر لإخفاء الزر عند الجميع (باستخدام معرف فريد)
    socket.emit("disable-bot-button", buttonId);
}

// استقبال أمر إخفاء الزر
socket.on("hide-button", (buttonId) => {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.disabled = true;
        btn.style.background = "#555";
        btn.innerHTML = "✅ تم بدء هذا الفيلم";
        btn.style.cursor = "default";
    }
});
function copyInviteLink() {
    const inviteUrl = `${window.location.origin}?room=${document.getElementById('room-id').value || 'main'}`;
    navigator.clipboard.writeText(inviteUrl).then(() => alert("تم نسخ رابط الدعوة! ✅"));
}

function initYT(id) {
    ytPlayer = new YT.Player('youtube-player', {
        videoId: id, height: '100%', width: '100%',
        playerVars: { 'autoplay': 1, 'controls': 1 },
        events: { 'onReady': () => { isYtReady = true; } }
    });
}