// أضف هذا المتغير في أعلى الملف
let myStream;

// حدث دالة الدخول أو أضف هذا الجزء في بدايتها
navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    myStream = stream;
    console.log("تم الوصول للميكروفون بنجاح");
}).catch(err => {
    console.error("فشل الوصول للميكروفون:", err);
});


const socket = io();
let currentUser = { name: "", avatar: "" };
let ytPlayer;
let isYtReady = false;
let hls = null; // لتخزين كائن HLS
const TMDB_KEY = "4a71b39887f9b5dd489791402728ab1a";
const videoElement = document.getElementById('video');

// 1. نظام الدخول والأفاتارات + إصلاح الرفع
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

// إصلاح مشكلة رفع الصورة الشخصية (تحديث المعاينة فوراً)
document.getElementById('avatarInput').onchange = function(e) {
    const reader = new FileReader();
    reader.onload = function() {
        const output = document.getElementById('preview');
        output.src = reader.result;
        currentUser.avatar = reader.result; // تحديث الأفاتار الحالي بالصورة المرفوعة
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
});

// 2. البحث والمزامنة "الإجبارية"
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

// وظيفة التعامل مع المصادر (يوتيوب، إطارات، أو روابط مباشرة m3u8)
function handleSource(url) {
    const ytArea = document.getElementById('youtube-player');
    const iframeSlot = document.getElementById('iframe-slot');
    
    // إخفاء كل شيء أولاً
    ytArea.style.display = "none";
    videoElement.style.display = "none";
    iframeSlot.innerHTML = "";

    if(url.includes('youtube') || url.includes('youtu.be')) {
        ytArea.style.display = "block";
        const id = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
        if(isYtReady) ytPlayer.loadVideoById(id); else initYT(id);
    } 
    else if (typeof url === 'string' && (url.includes('.m3u8') || url.includes('.mp4') || url.includes('visitmycityfor365days'))) {
        videoElement.style.display = "block";
        videoElement.controls = true; // التأكد من تفعيل أزرار التحكم

        if (url.includes('.m3u8') || url.includes('hls')) {
            if (Hls.isSupported()) {
                if (hls) hls.destroy();
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(videoElement);
                hls.on(Hls.Events.MANIFEST_PARSED, () => videoElement.play());
            }
        } else {
            videoElement.src = url;
            videoElement.play();
        }
    } else {
        // إذا كان رابط Iframe عادي من البحث (vidsrc)
        iframeSlot.style.display = "block";
        iframeSlot.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay" style="width:100%; height:100%; border:none;"></iframe>`;
    }
}

socket.on("video-changed", url => handleSource(url));

// 3. التحكم الجماعي (Sync Control)
videoElement.onplay = () => socket.emit("video-control", { type: 'play', time: videoElement.currentTime });
videoElement.onpause = () => socket.emit("video-control", { type: 'pause', time: videoElement.currentTime });
videoElement.onseeked = () => socket.emit("video-control", { type: 'seek', time: videoElement.currentTime });

socket.on("video-sync", data => {
    if (videoElement.style.display !== "none") {
        if (data.type === 'play') videoElement.play();
        if (data.type === 'pause') videoElement.pause();
        if (Math.abs(videoElement.currentTime - data.time) > 2) {
            videoElement.currentTime = data.time;
        }
    } else if (isYtReady && ytPlayer) {
        if (data.type === 'play') ytPlayer.playVideo();
        if (data.type === 'pause') ytPlayer.pauseVideo();
        if (Math.abs(ytPlayer.getCurrentTime() - data.time) > 2) ytPlayer.seekTo(data.time);
    }
});

function showSyncOverlay() {
    const btn = document.createElement('button');
    btn.innerHTML = "بدء المزامنة الآن 🍿";
    btn.className = "btn-primary";
    btn.style = "position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:200px; z-index:1000;";
    btn.onclick = () => { videoElement.play(); btn.remove(); };
    document.getElementById('video-wrapper').appendChild(btn);
}

// 4. يوتيوب والشات والتفاعلات
function initYT(id) {
    ytPlayer = new YT.Player('youtube-player', {
        videoId: id, height: '100%', width: '100%',
        playerVars: { 'autoplay': 1, 'controls': 1 },
        events: { 'onReady': () => { isYtReady = true; } }
    });
}

function sendEmoji(e) { socket.emit("reaction", e); showEmoji(e); }
socket.on("reaction", d => showEmoji(d.emoji));
function showEmoji(e) {
    const div = document.createElement('div');
    div.className = "floating-emoji"; div.innerText = e;
    div.style.left = Math.random() * 80 + 10 + "%";
    document.getElementById('video-wrapper').appendChild(div);
    setTimeout(() => div.remove(), 2500);
}
function showEmoji(e) {
    // تشغيل صوت خفيف إذا أردت (اختياري)
    // const audio = new Audio('pop.mp3'); audio.play();

    const div = document.createElement('div');
    div.className = "floating-emoji"; 
    div.innerText = e;
    // جعل الإيموجي يظهر في أماكن متفرقة أكثر حيوية
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
    msg.innerHTML += `
        <div class="msg">
            <img src="${d.user.avatar}">
            <div class="msg-body">
                <b>${d.user.name}</b>
                <div class="msg-content">${d.text}</div>
            </div>
        </div>`;
    msg.scrollTop = msg.scrollHeight;
});
socket.on("update-users", users => {
    document.getElementById('usersList').innerHTML = users.map(u => `<img src="${u.avatar}" class="user-img-small" title="${u.name}">`).join('');
});
function playDirectUrl() {
    const url = document.getElementById('directLinkInput').value;
    if (url && (url.includes('.m3u8') || url.includes('.mp4'))) {
        // نرسل الرابط للسيرفر لكي يغير الفيديو عند الجميع
        socket.emit("change-video", url);
        document.getElementById('directLinkInput').value = ""; // مسح الخانة بعد الإرسال
    } else {
        alert("يرجى وضع رابط فيديو مباشر صحيح (m3u8 أو mp4)");
    }
}

// تأكد أن هذه المتغيرات معرفة في أعلى ملف script.js (خارج الدالة)
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
// تأكد أن هذه المتغيرات في أعلى الملف مرة واحدة فقط
let isMicOn = false;
let localAudioTrack = null; 

async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');

    if (!isMicOn) {
        // --- حالة التشغيل ---
        try {
            const APP_ID = "97b6d211d09447b480ae3b8b62cc4a68";
            const CHANNEL = "main_room";

            // فحص: إذا كان العميل غير متصل، نقوم بالاتصال
            if (client.connectionState === "DISCONNECTED") {
                await client.join(APP_ID, CHANNEL, null, null);
            }

            // إنشاء وبث المايك
            if (!localAudioTrack) {
                localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            }
            await client.publish(localAudioTrack);

            isMicOn = true;
            micBtn.innerHTML = "🎤"; // أيقونة المايك المفتوح
            micBtn.classList.add('mic-active');
            console.log("✅ المايك يعمل الآن");

        } catch (error) {
            console.error("❌ خطأ في التشغيل:", error);
        }
    } else {
        // --- حالة الإيقاف ---
        try {
            // 1. وقف بث المايك
            if (localAudioTrack) {
                await client.unpublish(localAudioTrack);
                localAudioTrack.stop();
                localAudioTrack.close();
                localAudioTrack = null;
            }

            // 2. مغادرة القناة تماماً
            await client.leave();

            isMicOn = false;
            micBtn.innerHTML = "🔇"; // أيقونة المايك الصامت
            micBtn.classList.remove('mic-active');
            console.log("❌ تم إغلاق المايك والمغادرة");

        } catch (error) {
            console.error("❌ خطأ في الإيقاف:", error);
        }
    }
}

async function leaveVoice() {
    localTracks.audioTrack.stop();
    localTracks.audioTrack.close();
    await client.leave();
    document.getElementById('mic-btn').classList.remove('mic-active');
}
let isVoiceConnected = false;

async function handleMicClick() {
    const micBtn = document.getElementById('mic-btn');
    const micIcon = document.getElementById('mic-icon');

    if (!isVoiceConnected) {
        // إذا كان المايك مطفأ، نقوم بالاتصال
        try {
            await joinVoice(); // الدالة التي تستخدم Agora
            isVoiceConnected = true;
            micBtn.classList.add('mic-active');
            micIcon.innerText = "🎤"; // تغيير الشكل لميكروفون مفتوح
            console.log("تم تفعيل المايك");
        } catch (err) {
            console.error("فشل تفعيل المايك:", err);
            alert("تأكد من إعطاء إذن الميكروفون للمتصفح");
        }
    } else {
        // إذا كان المايك يعمل، نقوم بإطفائه
        await leaveVoice();
        isVoiceConnected = false;
        micBtn.classList.remove('mic-active');
        micIcon.innerText = "🔇"; // تغيير الشكل لميكروفون صامت
        console.log("تم إغلاق المايك");
    }
}