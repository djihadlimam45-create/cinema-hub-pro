
// --- 1. التعريفات الأساسية والمتغيرات العالمية ---
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
}

socket.on("join-success", () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    // تحديث صورة "أنت" في القائمة
    document.getElementById('current-avatar').src = currentUser.avatar;
});

// --- 3. نظام الصوت (Agora) وتوهج الأفاتار ---

// تفعيل مراقب الصوت (خارج الدوال ليعمل مرة واحدة)
client.enableAudioVolumeIndicator();

client.on("volume-indicator", volumes => {
    volumes.forEach((volume) => {
        let avatarId;
        // إذا كان المستخدم المحلي (أنت)
        if (volume.uid === 0 || volume.uid == client.uid) {
            avatarId = 'local-user';
        } else {
            // إذا كان صديق (مستخدم عن بعد)
            avatarId = `user-${volume.uid}`;
        }

        const avatarElement = document.getElementById(avatarId);
        if (avatarElement) {
            if (volume.level > 45) { // حساسية الصوت
                avatarElement.classList.add('speaking');
            } else {
                avatarElement.classList.remove('speaking');
            }
        }
    });
});

// الاستماع لدخول الآخرين ورسم صورهم
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") {
        user.audioTrack.play();
        
        // رسم الأفاتار الخاص بالصديق
        const userList = document.getElementById('user-list');
        if (!document.getElementById(`user-${user.uid}`)) {
            const newUserDiv = document.createElement('div');
            newUserDiv.id = `user-${user.uid}`;
            newUserDiv.className = 'avatar-container';
            newUserDiv.innerHTML = `
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}" class="avatar-img">
                <div class="user-name">صديق</div>
            `;
            userList.appendChild(newUserDiv);
        }
    }
});

client.on("user-left", (user) => {
    const remoteUserDiv = document.getElementById(`user-${user.uid}`);
    if (remoteUserDiv) remoteUserDiv.remove();
});

async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    if (!isMicOn) {
        try {
            if (client.connectionState === "DISCONNECTED") {
                await client.join(APP_ID, CHANNEL, null, null);
            }
            if (!localAudioTrack) {
                localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                await client.publish(localAudioTrack);
            }
            await localAudioTrack.setEnabled(true);
            isMicOn = true;
            micBtn.innerHTML = "🎤"; 
            micBtn.classList.add('mic-active');
        } catch (error) { console.error(error); }
    } else {
        if (localAudioTrack) await localAudioTrack.setEnabled(false);
        isMicOn = false;
        micBtn.innerHTML = "🔇";
        micBtn.classList.remove('mic-active');
        document.getElementById('local-user').classList.remove('speaking');
    }
}

// --- 4. البحث وتشغيل الأفلام والمزامنة ---

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

// --- 5. الشات والتفاعلات وروابط الدعوة ---

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
socket.on("chat-msg", d => {
    const msg = document.getElementById('messages');
    msg.innerHTML += `<div class="msg"><img src="${d.user.avatar}"><div class="msg-body"><b>${d.user.name}</b><div class="msg-content">${d.text}</div></div></div>`;
    msg.scrollTop = msg.scrollHeight;
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
