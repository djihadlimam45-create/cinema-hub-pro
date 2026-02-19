// --- 1. التعريفات والمتغيرات العالمية ---
let isHost = false; // نظام ديمقراطي: الجميع يمكنه التحكم
const socket = io();
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const TMDB_KEY = "63c062a2d817029ee9fe7760c74dea80";
const APP_ID = "97b6d211d09447b480ae3b8b62cc4a68";
const CHANNEL = "main_room";

let localAudioTrack = null;
let isMicOn = false;
let currentUser = { name: "", avatar: "" };
let ytPlayer;
let isYtReady = false;
let hls = null;
const videoElement = document.getElementById('video');
let agoraToSocketMap = {}; 

// --- 2. نظام الدخول والأفاتارات ---
function init() {
    const presets = document.getElementById('avatar-presets');
    if (!presets) return;
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

function join() {
    const name = document.getElementById('username').value;
    const room = document.getElementById('room-id').value;
    const pass = document.getElementById('room-pass').value;
    if(!name || !room || !pass) return alert("أكمل البيانات!");
    
    currentUser.name = name;
    currentUser.avatar = currentUser.avatar || document.getElementById('preview').src;
    
    socket.emit("join-room", { roomId: room, password: pass, user: currentUser });
    
    if (AgoraRTC.getAudioContext) {
        AgoraRTC.getAudioContext().resume();
    }
}

socket.on("join-success", () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-avatar').src = currentUser.avatar;
});

// --- 3. إدارة المستخدمين وتوهج الأفاتار ---
socket.on("update-users", users => {
    const userList = document.getElementById('user-list');
    userList.innerHTML = `
        <div class="avatar-container" id="local-user">
            <img src="${currentUser.avatar}" class="avatar-img">
            <div class="user-name">أنت (${currentUser.name})</div>
        </div>`;

    users.forEach(user => {
        if (user.id !== socket.id) {
            const div = document.createElement('div');
            div.className = 'avatar-container';
            div.id = `user-${user.id}`;
            div.innerHTML = `<img src="${user.avatar}" class="avatar-img"><div class="user-name">${user.name}</div>`;
            userList.appendChild(div);
        }
    });
});

socket.on("update-agora-map", map => { agoraToSocketMap = map; });

// --- 4. نظام الصوت (Agora) ---
client.enableAudioVolumeIndicator();
client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        let elementId = (volume.uid === 0 || volume.uid === client.uid) ? 'local-user' : `user-${agoraToSocketMap[volume.uid]}`;
        const el = document.getElementById(elementId);
        if (el) {
            if (volume.level > 40) el.classList.add('speaking');
            else el.classList.remove('speaking');
        }
    });
});

async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    try {
        if (!localAudioTrack) localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (!isMicOn) {
            if (client.connectionState === "DISCONNECTED") {
                const uid = await client.join(APP_ID, CHANNEL, null, null);
                socket.emit("map-agora-id", { uid });
            }
            await localAudioTrack.setEnabled(true);
            if (client.localTracks.length === 0) await client.publish(localAudioTrack);
            isMicOn = true; micBtn.innerHTML = "🎤"; micBtn.classList.add('mic-active');
        } else {
            await localAudioTrack.setEnabled(false);
            isMicOn = false; micBtn.innerHTML = "🔇"; micBtn.classList.remove('mic-active');
        }
    } catch (e) { console.error("Mic Error:", e); }
}

// --- 5. محرك تشغيل الفيديو والمزامنة ---
function renderVideo(url) {
    if (!url || url === "undefined") return;
    const iframeSlot = document.getElementById('iframe-slot');
    const ytArea = document.getElementById('youtube-player');
    
    // تنظيف وإخفاء
    iframeSlot.style.display = "none";
    videoElement.style.display = "none";
    ytArea.style.display = "none";
    iframeSlot.innerHTML = "";

    if (url.includes('vidsrc') || url.includes('embed')) {
        iframeSlot.style.display = "block";
        iframeSlot.innerHTML = `<iframe src="${url}" allow="autoplay; fullscreen" allowfullscreen style="width:100%; height:100%; border:none;"></iframe>`;
    } else if (url.includes('youtube') || url.includes('youtu.be')) {
        ytArea.style.display = "block";
        const id = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
        if(isYtReady) ytPlayer.loadVideoById(id); else initYT(id);
    } else {
        videoElement.style.display = "block";
        videoElement.src = url;
        videoElement.play();
    }
}

socket.on("start-countdown", (url) => {
    const overlay = document.getElementById('countdown-overlay');
    const number = document.getElementById('countdown-number');
    if(!overlay) return renderVideo(url);

    let count = 5;
    overlay.style.display = 'flex';
    number.innerText = count;

    const timer = setInterval(() => {
        count--;
        number.innerText = count;
        if (count <= 0) {
            clearInterval(timer);
            overlay.style.display = 'none';
            renderVideo(url);
        }
    }, 1000);
});

// مزامنة التحكم (Play/Pause) للروابط المباشرة فقط
videoElement.onplay = () => socket.emit("video-control", { type: 'play', time: videoElement.currentTime });
videoElement.onpause = () => socket.emit("video-control", { type: 'pause', time: videoElement.currentTime });
socket.on("video-sync", data => {
    if (videoElement.style.display !== "none") {
        if (data.type === 'play') videoElement.play();
        if (data.type === 'pause') videoElement.pause();
        if (Math.abs(videoElement.currentTime - data.time) > 2) videoElement.currentTime = data.time;
    }
});

// --- 6. الشات والتفاعل مع البوت ---
document.getElementById('chatInput').onkeypress = (e) => {
    if(e.key === "Enter" && e.target.value !== "") {
        socket.emit("chat-msg", e.target.value); 
        e.target.value = "";
    }
};

socket.on("chat-msg", (d) => {
    const msgContainer = document.getElementById('messages');
    let botContent = "";

    if (d.isSuggestion) {
        const uniqueId = "btn-" + Date.now();
        botContent = `
            <div class="bot-suggestion-card">
                <img src="${d.poster}" class="mini-poster" onerror="this.src='https://placehold.co/200x300?text=No+Poster'">
                <button id="${uniqueId}" onclick="playMovieDirectly('${d.suggestion}', '${uniqueId}')" class="bot-play-btn">
                    ▶️ تشغيل للجميع
                </button>
            </div>`;
    }

    msgContainer.innerHTML += `
        <div class="msg animate-in">
            <div class="msg-body">
                <b>${d.user.name}:</b>
                <div class="msg-content">${d.text}${botContent}</div>
            </div>
        </div>`;
    msgContainer.scrollTop = msgContainer.scrollHeight;
});

function playMovieDirectly(url, buttonId) {
    socket.emit("change-video", url);
    socket.emit("disable-bot-button", buttonId);
}

socket.on("hide-button", (buttonId) => {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "✅ تم البدء";
        btn.style.background = "#27ae60";
    }
});

// --- 7. وظائف إضافية ---
function initYT(id) {
    ytPlayer = new YT.Player('youtube-player', {
        videoId: id, height: '100%', width: '100%',
        playerVars: { 'autoplay': 1, 'controls': 1 },
        events: { 'onReady': () => { isYtReady = true; } }
    });
}

function copyInviteLink() {
    const inviteUrl = `${window.location.origin}?room=${document.getElementById('room-id').value || 'main'}`;
    navigator.clipboard.writeText(inviteUrl).then(() => alert("تم نسخ الرابط! ✅"));
}