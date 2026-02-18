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
}

socket.on("join-success", () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('current-avatar').src = currentUser.avatar;
});

// --- 3. نظام المزامنة والظهور (Socket.io) ---

socket.on("update-users", users => {
    const userList = document.getElementById('user-list');
    userList.innerHTML = `
        <div class="avatar-container" id="local-user">
            <img src="${currentUser.avatar}" class="avatar-img" id="current-avatar">
            <div class="user-name">أنت (${currentUser.name})</div>
        </div>
    `;

    users.forEach(user => {
        if (user.id !== socket.id) {
            const div = document.createElement('div');
            div.className = 'avatar-container';
            div.id = `user-${user.id}`;
            div.innerHTML = `
                <img src="${user.avatar}" class="avatar-img">
                <div class="user-name">${user.name}</div>
            `;
            userList.appendChild(div);
        }
    });
});

socket.on("update-agora-map", map => {
    agoraToSocketMap = map;
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

// إصلاح: استقبال المايكروفون من الآخرين تلقائياً
// تأكد من وجود هذا الحدث لاستقبال صوت الآخرين فور انضمامهم
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    console.log("تم استقبال بث جديد من نوع:", mediaType);
    
    if (mediaType === "audio") {
        user.audioTrack.play(); // تشغيل صوت الطرف الآخر
    }
});

async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    
    try {
        // 1. إذا لم يكن المسار الصوتي موجوداً، نقوم بإنشائه
        if (!localAudioTrack) {
            localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        }

        // 2. إذا لم نكن متصلين بـ Agora بعد، يجب الانضمام أولاً
        if (client.connectionState === "DISCONNECTED") {
            const uid = await client.join(APP_ID, CHANNEL, null, null);
            socket.emit("map-agora-id", { uid: uid });
        }

        if (!isMicOn) {
            // تفعيل المايك ونشره للآخرين
            await client.publish(localAudioTrack);
            await localAudioTrack.setEnabled(true);
            
            isMicOn = true;
            micBtn.classList.add('mic-active');
            micBtn.innerHTML = "🎤"; 
        } else {
            // إيقاف المايك وإلغاء النشر
            await localAudioTrack.setEnabled(false);
            await client.unpublish(localAudioTrack);
            
            isMicOn = false;
            micBtn.classList.remove('mic-active');
            micBtn.innerHTML = "🔇";
            document.getElementById('local-user').classList.remove('speaking');
        }
    } catch (error) {
        console.error("فشل تفعيل المايكروفون:", error);
        alert("تأكد من إعطاء صلاحية المايكروفون للمتصفح.");
    }
}

// --- 5. البحث وتشغيل الأفلام والمزامنة ---

document.getElementById('movieSearch').oninput = async (e) => {
    const query = e.target.value;
    const resDiv = document.getElementById('searchResults');
    if(query.length < 3) {
        resDiv.style.display = "none";
        return;
    }
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${query}&language=ar-SA`);
    const data = await res.json();
    resDiv.innerHTML = "";
    data.results.slice(0,6).forEach(m => {
        const div = document.createElement('div');
        div.className = "search-item";
        div.innerHTML = `<img src="https://image.tmdb.org/t/p/w92${m.poster_path || ''}"> <span>${m.title || m.name}</span>`;
        div.onclick = () => {
            const type = m.media_type === 'movie' ? 'movie' : 'tv';
            const url = `https://vidsrc.me/embed/${type}?tmdb=${m.id}`;
            socket.emit("change-video", url);
            resDiv.style.display = "none";
            document.getElementById('movieSearch').value = ""; // تفريغ خانة البحث بعد الاختيار
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

// تحسين المزامنة: إرسال الحالة
videoElement.onplay = () => socket.emit("video-control", { type: 'play', time: videoElement.currentTime });
videoElement.onpause = () => socket.emit("video-control", { type: 'pause', time: videoElement.currentTime });

// تحسين المزامنة: الاستقبال بمنطق العتبة الزمنية
socket.on("video-sync", data => {
    if (videoElement.style.display !== "none") {
        if (data.type === 'play') videoElement.play();
        if (data.type === 'pause') videoElement.pause();
        
        // لا نقوم بالقفز الزمني (Seek) إلا إذا كان الفرق أكثر من 2 ثانية لمنع التقطيع
        const diff = Math.abs(videoElement.currentTime - data.time);
        if (diff > 2) {
            videoElement.currentTime = data.time;
        }
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