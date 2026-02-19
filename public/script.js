const socket = io();
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
const TMDB_KEY = "4a71b39887f9b5dd489791402728ab1a";
const APP_ID = "97b6d211d09447b480ae3b8b62cc4a68";
const CHANNEL = "main_room";

let localAudioTrack, isMicOn = false, isHost = false, agoraMap = {};
const videoElement = document.getElementById('video');

// --- المزامنة والصلاحيات ---
socket.on("join-success", (data) => {
    isHost = data.isHost;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    if(isHost) document.getElementById('admin-controls').style.display = 'block';
});

socket.on("host-update", (val) => {
    isHost = val;
    document.getElementById('admin-controls').style.display = val ? 'block' : 'none';
    alert("لقد أصبحت أنت الآدمن الآن! 👑");
});

// --- البحث الذكي (Scraper Simulator) ---
function showTab(type) {
    document.getElementById('tmdb-panel').style.display = type === 'tmdb' ? 'block' : 'none';
    document.getElementById('direct-panel').style.display = type === 'direct' ? 'block' : 'none';
}

document.getElementById('movieSearch').oninput = async (e) => {
    const q = e.target.value;
    if(q.length < 3) return;
    const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_KEY}&query=${q}&language=ar-SA`);
    const data = await res.json();
    const resDiv = document.getElementById('searchResults');
    resDiv.innerHTML = "";
    data.results.slice(0,5).forEach(m => {
        const div = document.createElement('div');
        div.className = "search-item";
        div.innerHTML = `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}"> <span>${m.title || m.name}</span>`;
        div.onclick = () => {
            // جلب الرابط من مشغل خارجي (Vidsrc) تلقائياً
            const type = m.media_type === 'movie' ? 'movie' : 'tv';
            const url = `https://vidsrc.me/embed/${type}?tmdb=${m.id}`;
            socket.emit("change-video", url);
            resDiv.style.display = "none";
        };
        resDiv.appendChild(div);
    });
    resDiv.style.display = "block";
};

// --- نظام الصوت المصلح ---
client.on("user-published", async (user, mediaType) => {
    await client.subscribe(user, mediaType);
    if (mediaType === "audio") user.audioTrack.play();
});

async function toggleMic() {
    try {
        if (!localAudioTrack) localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        if (client.connectionState === "DISCONNECTED") {
            const uid = await client.join(APP_ID, CHANNEL, null, null);
            socket.emit("map-agora-id", { uid });
        }
        isMicOn = !isMicOn;
        await localAudioTrack.setEnabled(isMicOn);
        if(isMicOn) await client.publish(localAudioTrack);
        document.getElementById('mic-btn').innerHTML = isMicOn ? "🎤" : "🔇";
    } catch (e) { alert("فشل المايك، تأكد من الصلاحيات!"); }
}

// --- مزامنة الفيديو ---
socket.on("video-changed", url => {
    const iframe = document.getElementById('iframe-slot');
    if(url.includes('vidsrc') || url.includes('embed')) {
        iframe.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay"></iframe>`;
        videoElement.style.display = "none";
    } else {
        iframe.innerHTML = "";
        videoElement.style.display = "block";
        videoElement.src = url;
    }
});